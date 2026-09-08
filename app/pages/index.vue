<script setup lang="ts">
import type { Agent, DashboardStats, Project } from '~~/shared/types'

const { data: stats, refresh: refreshStats } = await useFetch<DashboardStats>('/api/dashboard')
const { selectedProjectId } = useErebusState()
const { data: agents, refresh: refreshAgents } = await useFetch<Agent[]>('/api/agents')
const conversations = computed(() => (agents.value ?? []).filter(a => !selectedProjectId.value || a.projectId === selectedProjectId.value))
const { data: projects } = await useFetch<Project[]>('/api/projects')

// Any realtime payload refreshes the activity feed and counters.
const { lastPayload } = useRealtime()
watch(lastPayload, (payload) => {
  void refreshStats()
  if (payload?.kind === 'agent.status' || payload?.event?.type === 'entity.created') void refreshAgents()
})

const working = computed(
  () => (stats.value?.agents.byStatus.WORKING ?? 0) + (stats.value?.agents.byStatus.THINKING ?? 0),
)
const waiting = computed(
  () =>
    (stats.value?.agents.byStatus.WAITING ?? 0) +
    (stats.value?.agents.byStatus.BLOCKED ?? 0),
)
const activeTasks = computed(() => stats.value?.tasks.active ?? 0)
const blockedTasks = computed(() => stats.value?.tasks.blocked ?? 0)
const doneTasks = computed(() => stats.value?.tasks.done ?? 0)

const today = new Date().toLocaleDateString('en-GB', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
})
</script>

<template>
  <div class="h-full overflow-y-auto">
    <div class="mx-auto max-w-5xl px-8 py-10">
      <header class="workspace-heading">
        <div>
          <div class="label mb-3">EREBUS / WORKSPACE</div>
          <h1>Your command center.</h1>
          <p>Open a conversation. Put your agents to work.</p>
        </div>
        <NuxtLink to="/projects" class="btn">Manage projects <span aria-hidden="true">↗</span></NuxtLink>
      </header>

      <section class="mb-8" aria-labelledby="conversations-heading">
        <div class="mb-3 flex items-center justify-between">
          <h2 id="conversations-heading" class="label">Conversations / {{ conversations.length }}</h2>
          <NuxtLink to="/agents" class="font-mono text-[11px] text-dim hover:text-arcane">Manage agents ↗</NuxtLink>
        </div>
        <div v-if="conversations.length" class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <NuxtLink v-for="agent in conversations" :key="agent.id" :to="`/agents/${agent.id}`" class="conversation-entry">
            <div class="flex items-center justify-between gap-3">
              <span class="font-medium text-ink">{{ agent.name }}</span>
              <span aria-hidden="true" class="text-faint">↗</span>
            </div>
            <p class="mt-1 truncate text-xs text-faint">{{ agent.role || 'Agent' }} · {{ agent.projectName || 'No project assigned' }}</p>
            <div class="mt-5 flex items-center gap-2 font-mono text-[10px] tracking-wider text-dim">
              <StatusDot :status="agent.status" /> {{ agent.status.replaceAll('_', ' ') }}
            </div>
          </NuxtLink>
        </div>
        <EmptyState v-else message="NO AGENT CONVERSATIONS" hint="ADD AN AGENT TO START WORKING IN THIS PROJECT" />
      </section>

      <div class="workspace-stats mb-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatTile label="ENTITIES" :value="stats?.agents.total ?? 0" :sub="`${stats?.agents.online ?? 0} ONLINE`" />
        <StatTile label="WORKING" :value="working" sub="ACTIVE RUNTIMES" />
        <StatTile label="WAITING" :value="waiting" sub="OR BLOCKED" />
        <StatTile label="PROJECTS" :value="stats?.projects ?? 0" sub="REGISTERED" />
        <NuxtLink to="/tasks" class="block">
          <StatTile
            label="TASKS"
            :value="activeTasks"
            :sub="`${blockedTasks} BLOCKED · ${doneTasks} DONE`"
          />
        </NuxtLink>
      </div>

      <div class="grid gap-5 xl:grid-cols-[1fr_280px]">
        <section class="system-panel">
          <div class="label mb-3">RECENT ACTIVITY</div>
          <ActivityFeed :events="stats?.recentEvents ?? []" />
        </section>

        <aside class="space-y-6">
          <section class="system-panel">
            <div class="label mb-3">PROJECTS</div>
            <div v-if="(projects?.length ?? 0) === 0">
              <EmptyState message="NO PROJECTS" hint="CREATE ONE TO ORGANIZE YOUR ENTITIES" />
            </div>
            <div v-else class="space-y-2">
              <NuxtLink
                v-for="p in projects"
                :key="p.id"
                to="/projects"
                class="panel block px-4 py-3 transition-colors hover:border-arcane/40"
              >
                <div class="flex items-baseline justify-between">
                  <span class="text-[13.5px] text-ink">{{ p.name }}</span>
                  <span class="font-mono text-[10px] text-faint">{{ p.agentCount ?? 0 }} ENTITIES</span>
                </div>
                <div v-if="p.rootDir" class="mt-1 truncate font-mono text-[10px] text-faint/70">
                  {{ p.rootDir }}
                </div>
              </NuxtLink>
            </div>
          </section>
        </aside>
      </div>
      <p class="mt-6 font-mono text-[10px] tracking-wider text-faint">{{ today.toUpperCase() }} / LOCAL AUTONOMOUS OPERATIONS</p>
    </div>
  </div>
</template>
