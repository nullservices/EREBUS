import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { getDb } from '../db'

/**
 * Host process execution with Windows semantics.
 *
 * - Direct executable spawn (no shell) with explicit cwd + env.
 * - stdout/stderr streamed to subscribers and kept in bounded ring buffers.
 * - Termination kills the whole process tree (`taskkill /T /F`), which is
 *   essential on Windows where agent runtimes spawn their own children.
 * - Every process is persisted to the `processes` table for observability.
 */

export type ProcessStatus = 'RUNNING' | 'EXITED' | 'KILLED' | 'FAILED'

export interface ManagedProcess {
  id: string
  agentId: string | null
  sessionId: string | null
  command: string
  args: string[]
  cwd: string
  status: ProcessStatus
  pid: number | null
  exitCode: number | null
  startedAt: string
  endedAt: string | null
  /** Bounded recent output lines, newest last. */
  stdoutRing: string[]
  stderrRing: string[]
  onLine: (stream: 'stdout' | 'stderr', line: string) => void
  /** Resolves when the process exits; rejects if it fails to spawn. */
  done: Promise<{ exitCode: number | null; status: ProcessStatus }>
}

interface SpawnOptions {
  command: string
  args?: string[]
  cwd?: string
  env?: NodeJS.ProcessEnv
  agentId?: string | null
  sessionId?: string | null
}

const RING_CAPACITY = 400

const managed = new Map<string, ManagedProcess>()

function isWindows(): boolean {
  return process.platform === 'win32'
}

/** Kill the process and its whole tree. Windows: taskkill /T. POSIX: negative pid. */
function killTree(pid: number): void {
  if (isWindows()) {
    try {
      spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      })
    } catch {
      /* best effort */
    }
  } else {
    try {
      process.kill(-pid, 'SIGKILL')
    } catch {
      try {
        process.kill(pid, 'SIGKILL')
      } catch {
        /* already gone */
      }
    }
  }
}

function splitLines(buffer: string, carry: { value: string }): string[] {
  const combined = carry.value + buffer
  const lines = combined.split(/\r?\n/)
  carry.value = lines.pop() ?? ''
  return lines.filter((line) => line.length > 0)
}

export function spawnProcess(options: SpawnOptions): ManagedProcess {
  const id = randomUUID()
  const cwd = options.cwd || process.cwd()

  const record: ManagedProcess = {
    id,
    agentId: options.agentId ?? null,
    sessionId: options.sessionId ?? null,
    command: [options.command, ...(options.args ?? [])].join(' '),
    args: options.args ?? [],
    cwd,
    status: 'RUNNING',
    pid: null,
    exitCode: null,
    startedAt: new Date().toISOString(),
    endedAt: null,
    stdoutRing: [],
    stderrRing: [],
    onLine: () => {},
    done: Promise.resolve({ exitCode: null, status: 'FAILED' }),
  }

  let child: ChildProcess
  try {
    child = spawn(options.command, options.args ?? [], {
      cwd,
      env: { ...process.env, ...options.env },
      windowsHide: true,
      // stdin stays open-but-ended: the Claude CLI on Windows has historically
      // misbehaved when stdin is unreadable/closed during headless runs.
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    child.stdin?.end()
  } catch (err) {
    record.status = 'FAILED'
    record.endedAt = new Date().toISOString()
    record.done = Promise.resolve({ exitCode: null, status: 'FAILED' })
    persistProcess(record)
    return record
  }

  record.pid = child.pid ?? null
  managed.set(id, record)

  const stdoutCarry = { value: '' }
  const stderrCarry = { value: '' }

  child.stdout?.setEncoding('utf8')
  child.stderr?.setEncoding('utf8')
  child.stdout?.on('data', (chunk: string) => {
    for (const line of splitLines(chunk, stdoutCarry)) {
      record.stdoutRing.push(line)
      if (record.stdoutRing.length > RING_CAPACITY) record.stdoutRing.shift()
      record.onLine('stdout', line)
    }
  })
  child.stderr?.on('data', (chunk: string) => {
    for (const line of splitLines(chunk, stderrCarry)) {
      record.stderrRing.push(line)
      if (record.stderrRing.length > RING_CAPACITY) record.stderrRing.shift()
      record.onLine('stderr', line)
    }
  })

  record.done = new Promise((resolve) => {
    child.on('error', (err) => {
      record.status = 'FAILED'
      record.endedAt = new Date().toISOString()
      record.stderrRing.push(`spawn error: ${err.message}`)
      persistProcess(record)
      managed.delete(id)
      resolve({ exitCode: null, status: 'FAILED' })
    })
    child.on('exit', (code, signal) => {
      // Distinguish an operator kill from a natural exit.
      record.status = record.status === 'RUNNING' ? (signal ? 'KILLED' : 'EXITED') : record.status
      record.exitCode = code
      record.endedAt = new Date().toISOString()
      // Flush any partial line left in the carry buffers.
      if (stdoutCarry.value) record.stdoutRing.push(stdoutCarry.value)
      if (stderrCarry.value) record.stderrRing.push(stderrCarry.value)
      persistProcess(record)
      managed.delete(id)
      resolve({ exitCode: code, status: record.status })
    })
  })

  persistProcess(record)
  return record
}

export async function stopProcess(record: ManagedProcess): Promise<void> {
  if (record.pid === null) return
  if (record.status !== 'RUNNING') return
  record.status = 'KILLED'
  killTree(record.pid)
  await record.done.catch(() => {})
}

export function getManagedProcess(id: string): ManagedProcess | undefined {
  return managed.get(id)
}

export function listManagedProcesses(): ManagedProcess[] {
  return [...managed.values()]
}

/** Shut down every live process (server shutdown). */
export async function stopAllProcesses(): Promise<void> {
  await Promise.all([...managed.values()].map((p) => stopProcess(p)))
}

interface ProcessRow {
  id: string
  command: string
  cwd: string
  status: string
  pid: number | null
  exit_code: number | null
  started_at: string
  ended_at: string | null
}

function persistProcess(record: ManagedProcess): void {
  const db = getDb()
  db.prepare(
    `INSERT INTO processes
       (id, agent_id, session_id, command, cwd, status, pid, exit_code, started_at, ended_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       status = excluded.status, exit_code = excluded.exit_code, ended_at = excluded.ended_at`,
  ).run(
    record.id,
    record.agentId,
    record.sessionId,
    record.command,
    record.cwd,
    record.status,
    record.pid,
    record.exitCode,
    record.startedAt,
    record.endedAt,
  )
}

export function getProcessRow(id: string): ProcessRow | undefined {
  return getDb().prepare('SELECT * FROM processes WHERE id = ?').get(id) as
    | ProcessRow
    | undefined
}
