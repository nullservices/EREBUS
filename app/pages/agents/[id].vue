<script setup lang="ts">
import type { Agent, Message, Project, Provider, Task } from '~~/shared/types'

const route = useRoute()
const agentId = computed(() => String(route.params.id))

const { data: agent, refresh: refreshAgent } = await useFetch<Agent>(`/api/agents/${agentId.value}`)
const { data: agents, refresh: refreshAgents } = await useFetch<Agent[]>('/api/agents')
const { data: projects } = await useFetch<Project[]>('/api/projects')
const { data: providers } = await useFetch<Provider[]>('/api/providers')
const { data: messages, refresh: refreshMessages } = await useFetch<Message[]>(
  `/api/agents/${agentId.value}/messages`,
)
const { data: sessions, refresh: refreshSessions } = await useFetch<SessionInfo[]>(
  `/api/agents/${agentId.value}/sessions`,
)
const { data: agentTasks, refresh: refreshTasks } = await useFetch<Task[]>(
  `/api/agents/${agentId.value}/tasks?limit=50`,
)

const currentTask = computed(() => {
  const list = agentTasks.value ?? []
  const active = list.find((t) => t.status === 'IN_PROGRESS' || t.status === 'BLOCKED')
  return active ?? list.find((t) => !['DONE', 'FAILED', 'CANCELLED'].includes(t.status)) ?? null
})

interface SessionInfo {
  id: string
  providerKind: string | null
  model: string
  status: string
  startedAt: string
  endedAt: string | null
  tokenUsageIn: number | null
  tokenUsageOut: number | null
}

const children = computed(() =>
  (agents.value ?? []).filter((a) => a.parentId === agentId.value),
)

const lastSession = computed(() =>
  (sessions.value ?? []).find((s) => s.status === 'RUNNING') ?? (sessions.value ?? [])[0] ?? null,
)

const isStarted = computed(() => !!agent.value && agent.value.status !== 'OFFLINE')

// Realtime: every payload that touches this entity refreshes its queries —
// streamed replies land in the conversation as they are written to the DB.
const { connected, lastPayload } = useRealtime()
watch(lastPayload, (payload) => {
  if (!payload) return
  const touches = (id: string | null | undefined) => !id || id === agentId.value
  if (payload.kind === 'agent.status' && touches(payload.agentId)) {
    void refreshAgent()
    void refreshSessions()
    return
  }
  if (payload.kind === 'event' && touches(payload.event?.agentId)) {
    void refreshAgent()
    void refreshMessages()
    void refreshSessions()
  }
  if (payload.kind === 'event' && payload.event?.type.startsWith('task.')) {
    void refreshTasks()
  }
})

// Slow fallback polling while the socket is down.
let fallbackTimer: ReturnType<typeof setInterval> | null = null
function syncFallback() {
  if (fallbackTimer) {
    clearInterval(fallbackTimer)
    fallbackTimer = null
  }
  if (!connected.value) {
    fallbackTimer = setInterval(() => {
      void refreshAgent()
      void refreshMessages()
      void refreshSessions()
    }, 5000)
  }
}
watch(connected, syncFallback, { immediate: true })
onUnmounted(() => {
  if (fallbackTimer) clearInterval(fallbackTimer)
})

const runtimeError = ref('')
const runtimeBusy = ref(false)

async function runAction(action: 'start' | 'stop' | 'restart') {
  if (!agent.value) return
  runtimeError.value = ''
  runtimeBusy.value = true
  try {
    const { request } = useApi()
    await request(`/agents/${agent.value.id}/${action}`, { method: 'POST' })
    await refreshAgent()
    await refreshAgents()
    await refreshSessions()
  } catch (err) {
    runtimeError.value = (err as { message: string }).message
  } finally {
    runtimeBusy.value = false
  }
}

const showEdit = ref(false)
const busyDelete = ref(false)

async function onSaved() {
  showEdit.value = false
  await refreshAgents()
}

async function onMessageSent() {
  await refreshMessages()
  void refreshAgent()
}

async function removeAgent() {
  if (!agent.value) return
  if (!window.confirm(`Delete entity ${agent.value.name}? Its conversation is removed; children are detached.`)) {
    return
  }
  busyDelete.value = true
  try {
    const { request } = useApi()
    await request(`/agents/${agent.value.id}`, { method: 'DELETE' })
    await navigateTo('/agents')
  } catch (err) {
    window.alert((err as { message: string }).message)
  } finally {
    busyDelete.value = false
  }
}
</script>

<template>
  <div v-if="agent" class="flex h-full min-w-0">
    <!-- CENTER · conversation -->
    <div class="flex min-w-0 flex-1 flex-col">
      <div class="flex h-12 shrink-0 items-center justify-between border-b border-line px-5">
        <div class="flex items-baseline gap-3">
          <StatusDot :status="agent.status" />
          <span class="text-[13.5px] tracking-[0.2em] text-ink">{{ agent.name }}</span>
          <span class="font-mono text-[9.5px] uppercase tracking-[0.25em] text-faint">
            {{ agent.role || 'UNASSIGNED' }}
          </span>
        </div>
        <div class="flex items-center gap-2">
          <span
            v-if="runtimeError"
            class="mr-1 max-w-[280px] truncate font-mono text-[10px] text-blood"
            :title="runtimeError"
          >
            {{ runtimeError }}
          </span>
          <button
            v-if="!isStarted"
            class="btn btn-primary"
            :disabled="runtimeBusy || !agent.providerId"
            :title="agent.providerId ? 'Bring the entity runtime online' : 'Assign a provider first (CONFIGURE)'"
            @click="runAction('start')"
          >
            START
          </button>
          <template v-else>
            <button class="btn" :disabled="runtimeBusy" @click="runAction('restart')">RESTART</button>
            <button class="btn btn-danger" :disabled="runtimeBusy" @click="runAction('stop')">STOP</button>
          </template>
          <button class="btn" @click="showEdit = true">CONFIGURE</button>
          <button class="btn btn-danger" :disabled="busyDelete" @click="removeAgent">DELETE</button>
        </div>
      </div>

      <ConversationView :agent="agent" :messages="messages ?? []" />
      <CommandInput :agent-id="agent.id" :agent-status="agent.status" @sent="onMessageSent" />
    </div>

    <!-- RIGHT · context -->
    <ContextPanel
      :agent="agent"
      :children="children"
      :last-session="lastSession"
      :current-task="currentTask"
    />

    <Modal :open="showEdit" title="CONFIGURE ENTITY" @close="showEdit = false">
      <EntityForm
        :agent="agent"
        :providers="providers ?? []"
        :projects="projects ?? []"
        :agents="agents ?? []"
        @saved="onSaved"
        @close="showEdit = false"
      />
    </Modal>
  </div>

  <div v-else class="flex h-full">
    <div class="m-auto">
      <EmptyState message="ENTITY NOT FOUND" hint="IT MAY HAVE BEEN REMOVED" />
    </div>
  </div>
</template>
