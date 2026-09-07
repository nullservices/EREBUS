/**
 * One-off real-provider end-to-end verification (not part of the suite).
 * Requires: isolated EREBUS instance with FRESH data + EREBUS_REAL_KEY env.
 * Flow: setup with real key → start ARCHON → instruction → real streamed
 * reply → completion status. This file is deleted after use.
 */
const BASE = process.env.EREBUS_URL || 'http://127.0.0.1:4524'
const KEY = process.env.EREBUS_REAL_KEY

if (!KEY) {
  console.error('EREBUS_REAL_KEY is required')
  process.exit(1)
}

let cookie = ''
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
    /* non-JSON */
  }
  return { status: res.status, json }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const setup = await req('POST', '/api/auth/setup', {
  username: 'e2e',
  password: 'e2e-password-123',
  projectName: 'E2E',
  provider: { kind: 'deepseek', apiKey: KEY },
})
if (setup.status !== 200) {
  console.error('SETUP FAILED:', JSON.stringify(setup.json))
  process.exit(1)
}
console.log('OK  setup with real key')

const agents = await req('GET', '/api/agents')
const archonId = agents.json?.find((a) => a.name === 'ARCHON')?.id

const start = await req('POST', `/api/agents/${archonId}/start`)
console.log(start.status === 200 ? `OK  started (${start.json?.status})` : 'FAIL start')

const msg = await req('POST', `/api/agents/${archonId}/messages`, {
  content: 'Reply with exactly: GREETINGS OPERATOR',
})
console.log(msg.status === 200 && msg.json?.queued ? 'OK  instruction queued' : 'FAIL queue')

let reply = null
let finalStatus = null
for (let i = 0; i < 90; i++) {
  await sleep(1000)
  const msgs = await req('GET', `/api/agents/${archonId}/messages`)
  reply = (msgs.json ?? []).find((m) => m.role === 'agent' && m.content.trim())
  const agent = await req('GET', `/api/agents/${archonId}`)
  finalStatus = agent.json?.status
  if (reply && ['IDLE', 'ERROR'].includes(finalStatus)) break
}

console.log(reply ? `OK  real reply: ${reply.content.trim().slice(0, 200)}` : 'FAIL no assistant reply')
console.log(`    final status: ${finalStatus}`)

// Second phase: a real tool loop under auto-approve.
await req('POST', `/api/agents/${archonId}/auto-approve`, { enabled: true })
const beforeCount = (await req('GET', `/api/agents/${archonId}/messages`)).json.length
const msg2 = await req('POST', `/api/agents/${archonId}/messages`, {
  content: 'List the files in the working directory and tell me how many entries there are.',
})
console.log(msg2.status === 200 && msg2.json?.queued ? 'OK  tool instruction queued' : 'FAIL tool queue')

let toolReply = null
let toolRow = null
let finalStatus2 = null
for (let i = 0; i < 120; i++) {
  await sleep(1000)
  const msgs = (await req('GET', `/api/agents/${archonId}/messages`)).json ?? []
  const after = msgs.slice(beforeCount)
  toolReply = after.find((m) => m.role === 'agent' && m.content.trim())
  toolRow = after.find((m) => m.role === 'tool')
  const agent = await req('GET', `/api/agents/${archonId}`)
  finalStatus2 = agent.json?.status
  if (toolReply && finalStatus2 === 'IDLE') break
}
console.log(toolRow ? `OK  tool call recorded: ${toolRow.content}${toolRow.meta?.args ? ` ${toolRow.meta.args}` : ''}` : 'FAIL no tool row')
console.log(toolReply ? `OK  tool-loop reply: ${toolReply.content.trim().slice(0, 200)}` : 'FAIL no tool-loop reply')
console.log(`    final status: ${finalStatus2}`)

await req('POST', `/api/agents/${archonId}/stop`)
const events = await req('GET', '/api/events?limit=20')
const completed = (events.json ?? []).some((e) => e.type === 'agent.completed')
console.log(completed ? 'OK  agent.completed recorded' : 'FAIL no completion event')

process.exit(reply && finalStatus === 'IDLE' && completed && toolReply && toolRow && finalStatus2 === 'IDLE' ? 0 : 1)
