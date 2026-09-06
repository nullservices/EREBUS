/**
 * EREBUS end-to-end smoke test.
 *
 * Run against a FRESH instance (empty data dir) with the server up:
 *   npm run dev        (terminal 1)
 *   npm run smoke      (terminal 2)
 *
 * Exercises: bootstrap → setup → auth → agents/providers/projects CRUD →
 * messages → events → dashboard → logout → login.
 * Exits non-zero on the first failure.
 */
import { createServer } from 'node:http'

const BASE = process.env.EREBUS_URL || 'http://127.0.0.1:4521'

let cookie = ''
let failures = 0
let checks = 0

async function waitFor(fn, timeoutMs, stepMs = 500) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = await fn()
    if (value) return value
    if (Date.now() > deadline) return null
    await new Promise((r) => setTimeout(r, stepMs))
  }
}

// Local HTTP receiver standing in for a real webhook endpoint.
const received = []
const receiver = createServer((req, res) => {
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    received.push({ url: req.url, headers: req.headers, body })
    res.end('ok')
  })
})
await new Promise((resolve) => receiver.listen(4523, '127.0.0.1', resolve))

function check(name, cond, extra = '') {
  checks++
  if (cond) {
    console.log(`  OK   ${name}`)
  } else {
    failures++
    console.log(`  FAIL ${name}${extra ? ` — ${extra}` : ''}`)
  }
}

async function req(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const setCookie = res.headers.get('set-cookie')
  if (setCookie) cookie = setCookie.split(';')[0]
  let json = null
  try {
    json = await res.json()
  } catch {
    /* non-JSON response */
  }
  return { status: res.status, json }
}

const OPS = { username: 'erebus_admin', password: 'erebus-smoke-password' }

console.log(`EREBUS smoke test → ${BASE}\n`)

// 1. Bootstrap state
const status = await req('GET', '/api/status')
check('GET /api/status is public', status.status === 200)
check('status reports firstRun on a fresh install', status.json?.firstRun === true, JSON.stringify(status.json))

// 2. First-run setup
const setup = await req('POST', '/api/auth/setup', {
  ...OPS,
  projectName: 'Smoke Project',
  projectDir: 'C:\\Smoke',
  provider: { kind: 'deepseek', apiKey: 'sk-smoke-secret-1234' },
})
check('setup creates the operator + session', setup.status === 200 && setup.json?.ok === true, JSON.stringify(setup.json))
check('setup seeded ARCHON', setup.json?.archon?.name === 'ARCHON')
check('session cookie issued', Boolean(cookie))

// 3. Setup is one-shot
const setupAgain = await req('POST', '/api/auth/setup', { ...OPS, password: 'another-password' })
check('setup refuses a second time', setupAgain.status === 403)

// 4. Authenticated session
const me = await req('GET', '/api/auth/me')
check('GET /api/auth/me with session', me.status === 200 && me.json?.username === OPS.username)

const meAnon = await fetch(`${BASE}/api/auth/me`).then((r) => r.status)
check('GET /api/auth/me without session → 401', meAnon === 401)

// 5. Providers — masked, never exposing the key
const providers = await req('GET', '/api/providers')
check('providers list returns 4 seeded', providers.status === 200 && providers.json?.length === 4)
const deepseek = providers.json?.find((p) => p.kind === 'deepseek')
check('deepseek configured from setup', deepseek?.configured === true)
check('key is masked, not exposed', deepseek?.apiKeyHint === '••••1234')
const providersRaw = JSON.stringify(providers.json)
check('raw key never reaches the client', !providersRaw.includes('sk-smoke-secret'))

const providerUpdate = await req('PATCH', `/api/providers/${deepseek.id}`, { model: 'deepseek-reasoner' })
check('provider update works', providerUpdate.status === 200 && providerUpdate.json?.model === 'deepseek-reasoner')

// 6. Projects
const projectList = await req('GET', '/api/projects')
const smokeProject = projectList.json?.find((p) => p.name === 'Smoke Project')
check('setup created the first project', Boolean(smokeProject))

const newProject = await req('POST', '/api/projects', { name: 'Second Project', rootDir: 'C:\\Second' })
check('create project', newProject.status === 200 && newProject.json?.name === 'Second Project')

// 7. Entities
const agents = await req('GET', '/api/agents')
check('agents list contains ARCHON', agents.status === 200 && agents.json?.some((a) => a.name === 'ARCHON'))
check('new entities start OFFLINE', agents.json?.every((a) => a.status === 'OFFLINE'))
const archonId = agents.json?.find((a) => a.name === 'ARCHON')?.id

const vesper = await req('POST', '/api/agents', {
  name: 'VESPER',
  role: 'Developer',
  providerId: deepseek.id,
  projectId: newProject.json?.id,
  parentId: agents.json?.find((a) => a.name === 'ARCHON')?.id,
  tools: ['filesystem', 'git', 'terminal'],
  permissions: { filesystem: 'ask', git: 'ask', terminal: 'ask', network: 'deny' },
})
check('create entity', vesper.status === 200 && vesper.json?.name === 'VESPER')
check('entity hierarchy links resolve', vesper.json?.parentName === 'ARCHON' && vesper.json?.projectName === 'Second Project')

const dup = await req('POST', '/api/agents', { name: 'VESPER' })
check('duplicate entity name → 409', dup.status === 409)

const badTools = await req('POST', '/api/agents', { name: 'BROKEN', tools: ['laser'] })
check('unknown tool rejected → 400', badTools.status === 400)

// 8. Messages
const sent = await req('POST', `/api/agents/${vesper.json.id}/messages`, { content: 'Inspect the project layout.' })
check('record instruction to entity', sent.status === 200 && sent.json?.role === 'user')
const thread = await req('GET', `/api/agents/${vesper.json.id}/messages`)
check('conversation persists', thread.status === 200 && thread.json?.length === 1)

// 9. Events + dashboard
const events = await req('GET', '/api/events')
check('global activity log has events', events.status === 200 && events.json?.length >= 5)
const dash = await req('GET', '/api/dashboard')
check('dashboard aggregates', dash.status === 200 && dash.json?.agents?.total === 2 && dash.json?.projects === 2)

// 10. Hierarchy cycle protection
const cycle = await req('PATCH', `/api/agents/${agents.json?.find((a) => a.name === 'ARCHON')?.id}`, {
  parentId: vesper.json.id,
})
check('cycle assignment rejected → 400', cycle.status === 400)

// 11. Logout / login round trip
const logout = await req('POST', '/api/auth/logout')
check('logout clears session', logout.status === 200)
cookie = ''
const meAfter = await fetch(`${BASE}/api/auth/me`).then((r) => r.status)
check('session revoked after logout', meAfter === 401)

const login = await req('POST', '/api/auth/login', OPS)
check('login with same credentials', login.status === 200)
const me2 = await req('GET', '/api/auth/me')
check('new session valid', me2.status === 200)

const badLogin = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: OPS.username, password: 'wrong-password' }),
})
check('wrong password → 401', badLogin.status === 401)

// ── Phase III · realtime WebSocket ────────────────────────────────────

const wsBase = BASE.replace(/^http/, 'ws')
const sessionToken = cookie.split('=').slice(1).join('=')
const wsPayloads = []
let wsOpen = false
const ws = new WebSocket(`${wsBase}/live?token=${encodeURIComponent(sessionToken)}`)
await new Promise((resolve) => {
  ws.onopen = () => {
    wsOpen = true
    resolve(null)
  }
  ws.onerror = () => resolve(null)
  ws.onclose = () => resolve(null)
  setTimeout(() => resolve(null), 8000)
})
check('websocket connects with session token', wsOpen)

ws.onmessage = (ev) => {
  const data = ev.data
  if (typeof data === 'string') wsPayloads.push(data)
  else if (data && typeof data.text === 'function') data.text().then((t) => wsPayloads.push(t))
  else wsPayloads.push(String(data))
}

ws.send('ping')
const pong = await waitFor(() => (wsPayloads.some((p) => p === 'pong') ? true : null), 8000)
check('websocket ping/pong works', Boolean(pong))

const wsMsg = await req('POST', `/api/agents/${archonId}/messages`, {
  content: 'Realtime probe.',
})
const wsEvent = await waitFor(() => {
  const found = wsPayloads.find((p) => p.includes(`"agentId":"${archonId}"`) && p.includes('"kind":"event"'))
  return found ?? null
}, 8000)
check('event broadcast reaches websocket peer', Boolean(wsEvent), JSON.stringify(wsPayloads))

let anonOpened = false
const anon = new WebSocket(`${wsBase}/live`)
await new Promise((resolve) => {
  anon.onopen = () => {
    anonOpened = true
    resolve(null)
  }
  anon.onerror = () => resolve(null)
  anon.onclose = () => resolve(null)
  setTimeout(() => resolve(null), 6000)
})
check('websocket rejects unauthenticated connections', !anonOpened)

// ── Notifications · real delivery to a local receiver ────────────────

const chan = await req('POST', '/api/channels', {
  kind: 'generic',
  label: 'Smoke Receiver',
  events: ['error', 'completion', 'lifecycle'],
  config: { url: 'http://127.0.0.1:4523/hook' },
})
check('create notification channel', chan.status === 200 && chan.json?.kind === 'generic', JSON.stringify(chan.json))
check('channel exposes host hint only', chan.json?.configHint === '127.0.0.1:4523')

const chanList = await req('GET', '/api/channels')
check('channels list works', chanList.status === 200 && chanList.json?.length === 1)

const chanTest = await req('POST', `/api/channels/${chan.json.id}/test`)
check('channel test delivers', chanTest.status === 200 && chanTest.json?.ok === true, JSON.stringify(chanTest.json))
const testDelivery = await waitFor(() => (received.length >= 1 ? received[0] : null), 10000)
check('receiver got the test delivery', Boolean(testDelivery?.body?.includes('CHANNEL TEST')), JSON.stringify(received))

const badChan = await req('POST', '/api/channels', {
  kind: 'generic',
  label: 'Broken',
  events: ['error'],
  config: { url: 'not-a-url' },
})
check('malformed channel URL rejected', badChan.status === 400)

const emptyChan = await req('POST', '/api/channels', {
  kind: 'generic',
  label: 'No Events',
  events: [],
  config: { url: 'http://127.0.0.1:4523/hook' },
})
check('channel without event categories rejected', emptyChan.status === 400)

// ── Phase IV · task system ───────────────────────────────────────────

const t1 = await req('POST', '/api/tasks', {
  title: 'Implement inventory backend',
  projectId: newProject.json?.id,
  assignedAgentId: vesper.json?.id,
  priority: 'HIGH',
  status: 'TODO',
})
check('create task', t1.status === 200 && t1.json?.number >= 1, JSON.stringify(t1.json))
check('task joins resolve', t1.json?.assignedAgentName === 'VESPER' && t1.json?.projectName === 'Second Project')

const t2 = await req('POST', '/api/tasks', { title: 'Child task', parentId: t1.json.id })
check('task hierarchy created', t2.status === 200 && t2.json?.parentNumber === t1.json?.number)

const tCycle = await req('PATCH', `/api/tasks/${t1.json.id}`, { parentId: t2.json.id })
check('task cycle rejected → 400', tCycle.status === 400)

const badStatus = await req('POST', '/api/tasks', { title: 'Bad', status: 'NOPE' })
check('unknown task status → 400', badStatus.status === 400)

const tDone = await req('PATCH', `/api/tasks/${t1.json.id}`, { status: 'DONE', result: 'implemented' })
check('task completion sets timestamps', tDone.status === 200 && Boolean(tDone.json?.completedAt))

const tBlocked = await req('PATCH', `/api/tasks/${t1.json.id}`, { status: 'BLOCKED' })
check('blocked clears completion', tBlocked.status === 200 && tBlocked.json?.completedAt === null)

const agentTaskList = await req('GET', `/api/agents/${vesper.json.id}/tasks`)
check('entity task list works', agentTaskList.status === 200 && agentTaskList.json?.some((t) => t.title === 'Implement inventory backend'))

const taskFilter = await req('GET', `/api/tasks?projectId=${newProject.json.id}`)
check(
  'task project filter works',
  taskFilter.status === 200 &&
    taskFilter.json?.length === 1 &&
    taskFilter.json?.[0]?.title === 'Implement inventory backend',
  JSON.stringify(taskFilter.json),
)

const dashWithTasks = await req('GET', '/api/dashboard')
check('dashboard carries task stats', dashWithTasks.status === 200 && dashWithTasks.json?.tasks?.total === 2)

const tDelete = await req('DELETE', `/api/tasks/${t2.json.id}`)
check('task deletion works', tDelete.status === 200 && tDelete.json?.ok === true)

// ── Phase II · agent runtime ─────────────────────────────────────────

// No provider → start refuses.
const bare = await req('POST', '/api/agents', { name: 'NO_PROVIDER' })
const bareStart = await req('POST', `/api/agents/${bare.json.id}/start`)
check('start without provider → 400', bareStart.status === 400)

// Start ARCHON (deepseek provider, key configured but invalid in smoke).
const archonStart = await req('POST', `/api/agents/${archonId}/start`)
check('start brings runtime to IDLE', archonStart.status === 200 && archonStart.json?.status === 'IDLE')

const startedAgain = await req('POST', `/api/agents/${archonId}/start`)
check('double start → 409', startedAgain.status === 409)

// Instruction triggers a real run — with no valid key it must fail honestly.
const instruction = await req('POST', `/api/agents/${archonId}/messages`, {
  content: 'Report your status.',
})
check('instruction queued to runtime', instruction.status === 200 && instruction.json?.queued === true)

const errored = await waitFor(async () => {
  const r = await req('GET', `/api/agents/${archonId}`)
  return r.json?.status === 'ERROR' ? r.json : null
}, 15000)
check('failed provider run lands on ERROR status', Boolean(errored), JSON.stringify(errored))

const threadAfter = await req('GET', `/api/agents/${archonId}/messages`)
const errorRow = threadAfter.json?.find((m) => m.role === 'error')
check('error recorded in conversation', Boolean(errorRow), JSON.stringify(threadAfter.json))
check('error names the missing key', /key/i.test(errorRow?.content ?? ''), errorRow?.content)

const errorNotif = await waitFor(() => {
  const found = received.find((r) => {
    try {
      return JSON.parse(r.body).severity === 'error'
    } catch {
      return false
    }
  })
  return found ?? null
}, 10000)
check('error event fanned out to channel', Boolean(errorNotif?.body?.includes('ARCHON')), JSON.stringify(received))

// Recovery: an ERROR entity can still be stopped.
const archonStop = await req('POST', `/api/agents/${archonId}/stop`)
check('stop returns entity to OFFLINE', archonStop.status === 200 && archonStop.json?.status === 'OFFLINE')

const sessions = await req('GET', `/api/agents/${archonId}/sessions`)
check('runtime sessions persisted', sessions.status === 200 && sessions.json?.length >= 1)
check('session closed on stop', sessions.json?.[0]?.status === 'ENDED')

const archonRestart = await req('POST', `/api/agents/${archonId}/restart`)
check('restart brings runtime back to IDLE', archonRestart.status === 200 && archonRestart.json?.status === 'IDLE')
await req('POST', `/api/agents/${archonId}/stop`)

// Provider connection tests are real requests.
const dsTest = await req('POST', `/api/providers/${deepseek.id}/test`)
check('deepseek test reports missing key honestly', dsTest.status === 200 && dsTest.json?.ok === false && /key/i.test(dsTest.json?.detail ?? ''), JSON.stringify(dsTest.json))

const claudeProvider = providers.json?.find((p) => p.kind === 'claude')
const claudeTest = await req('POST', `/api/providers/${claudeProvider.id}/test`)
check('claude CLI test returns a result', claudeTest.status === 200 && typeof claudeTest.json?.ok === 'boolean' && typeof claudeTest.json?.detail === 'string', JSON.stringify(claudeTest.json))

// ── Model catalogs ───────────────────────────────────────────────────

// deepseek: live fetch fails (invalid smoke key) → curated catalog fallback.
const dsModels = await req('GET', `/api/providers/${deepseek.id}/models`)
check('deepseek models endpoint works', dsModels.status === 200 && Array.isArray(dsModels.json?.models))
check('deepseek falls back to catalog without a valid key', dsModels.json?.source === 'catalog', JSON.stringify(dsModels.json))
check('catalog contains deepseek-chat', dsModels.json?.models?.some((m) => m.id === 'deepseek-chat'))
check('current configured model preserved in list', dsModels.json?.models?.some((m) => m.id === 'deepseek-reasoner'), JSON.stringify(dsModels.json?.models))

// claude: curated catalog is the list (no API models endpoint).
const claudeModels = await req('GET', `/api/providers/${claudeProvider.id}/models`)
check('claude models endpoint works', claudeModels.status === 200 && claudeModels.json?.source === 'catalog')
check('claude catalog covers the family', ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5-20251001', 'claude-fable-5-1'].every((id) => claudeModels.json?.models?.some((m) => m.id === id)), JSON.stringify(claudeModels.json?.models))

// kind-based catalog for unsaved providers.
const openaiModels = await req('GET', '/api/providers/models?kind=openai')
check('kind-based catalog works', openaiModels.status === 200 && openaiModels.json?.models?.some((m) => m.id === 'gpt-4o'))
const badKind = await req('GET', '/api/providers/models?kind=bogus')
check('unknown kind → 400', badKind.status === 400)

// ── Phase V · orchestration & human intervention ─────────────────────

// ARCHON sends a message carrying the communication protocol.
const agentMsg = await req('POST', `/api/agents/${vesper.json.id}/messages`, {
  senderAgentId: archonId,
  content: '@NO_PROVIDER verify the inventory API\n@OPERATOR which approach should we use for inventory?',
})
check('agent-to-agent message recorded with sender', agentMsg.status === 200 && agentMsg.json?.senderAgentId === archonId)

const vesperThread2 = await req('GET', `/api/agents/${vesper.json.id}/messages`)
check('thread exposes sender name', vesperThread2.json?.some((m) => m.senderAgentId === archonId && m.senderAgentName === 'ARCHON'))

const noProviderThread = await req('GET', `/api/agents/${bare.json.id}/messages`)
check(
  'delegation delivered to target entity',
  noProviderThread.json?.some((m) => m.content.includes('verify the inventory API') && m.senderAgentName === 'ARCHON'),
  JSON.stringify(noProviderThread.json),
)

// Operator question → intervention raised on the asking entity (ARCHON).
const pendingList = await req('GET', '/api/interventions?status=PENDING')
const archonIntervention = pendingList.json?.find((i) => i.agentId === archonId)
check('operator question raises intervention', Boolean(archonIntervention), JSON.stringify(pendingList.json))

const archonPaused = await req('GET', `/api/agents/${archonId}`)
check('entity paused at WAITING_FOR_HUMAN', archonPaused.json?.status === 'WAITING_FOR_HUMAN')

const resolved = await req('PATCH', `/api/interventions/${archonIntervention.id}`, {
  resolution: 'Use approach A',
})
check('intervention resolves', resolved.status === 200 && resolved.json?.status === 'RESOLVED')

const archonAfter = await req('GET', `/api/agents/${archonId}`)
check('entity returns to OFFLINE when not started', archonAfter.json?.status === 'OFFLINE')

const archonThread = await req('GET', `/api/agents/${archonId}/messages`)
check(
  'operator answer injected into history',
  archonThread.json?.some((m) => m.content === 'OPERATOR: Use approach A'),
)

const interventionCreate = await req('POST', `/api/agents/${vesper.json.id}/interventions`, {
  prompt: 'Pick a color',
  options: ['red', 'blue'],
})
check(
  'intervention creation API works',
  interventionCreate.status === 200 && interventionCreate.json?.options?.length === 2,
)

const doubleResolve = await req('PATCH', `/api/interventions/${archonIntervention.id}`, {
  resolution: 'again',
})
check('double resolution → 409', doubleResolve.status === 409)

// ── Cleanup ───────────────────────────────────────────────────────────

const chanDelete = await req('DELETE', `/api/channels/${chan.json.id}`)
check('channel deletion works', chanDelete.status === 200 && chanDelete.json?.ok === true)
await new Promise((resolve) => receiver.close(resolve))
ws.close()
anon.close()

console.log(`\n${checks - failures}/${checks} checks passed`)
process.exit(failures ? 1 : 0)
