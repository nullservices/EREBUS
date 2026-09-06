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
const BASE = process.env.EREBUS_URL || 'http://127.0.0.1:4521'

let cookie = ''
let failures = 0
let checks = 0

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

// ── Phase II · agent runtime ─────────────────────────────────────────

async function waitFor(fn, timeoutMs, stepMs = 500) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = await fn()
    if (value) return value
    if (Date.now() > deadline) return null
    await new Promise((r) => setTimeout(r, stepMs))
  }
}

const archonId = agents.json?.find((a) => a.name === 'ARCHON')?.id

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

console.log(`\n${checks - failures}/${checks} checks passed`)
process.exit(failures ? 1 : 0)
