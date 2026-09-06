<script setup lang="ts">
interface SearchResults {
  agents: { id: string; name: string; role: string; status: string }[]
  tasks: { id: string; number: number; title: string; status: string; agent_name: string | null }[]
  projects: { id: string; name: string; description: string; root_dir: string }[]
  messages: { id: string; agentId: string; agentName: string | null; role: string; snippet: string; createdAt: string }[]
  events: { id: string; type: string; summary: string; created_at: string; agent_name: string | null }[]
}

const route = useRoute()
const router = useRouter()
const query = ref(String(route.query.q ?? ''))
const results = ref<SearchResults | null>(null)
const busy = ref(false)

async function runSearch() {
  const q = query.value.trim()
  if (q.length < 2) {
    results.value = null
    return
  }
  busy.value = true
  try {
    const { request } = useApi()
    results.value = await request<SearchResults>(`/search?q=${encodeURIComponent(q)}`)
    if (route.query.q !== q) void router.replace({ query: { q } })
  } finally {
    busy.value = false
  }
}

onMounted(() => {
  if (query.value) void runSearch()
})

const total = computed(() => {
  if (!results.value) return 0
  return (
    results.value.agents.length +
    results.value.tasks.length +
    results.value.projects.length +
    results.value.messages.length +
    results.value.events.length
  )
})

function fmtTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-GB', { hour12: false })
}
</script>

<template>
  <div class="h-full overflow-y-auto">
    <div class="mx-auto max-w-3xl px-8 py-10">
      <header class="mb-8">
        <div class="label mb-2">GLOBAL SEARCH</div>
        <div class="flex items-stretch gap-2">
          <input
            v-model="query"
            class="field flex-1 font-mono text-[14px]"
            placeholder="SEARCH ENTITIES · TASKS · MESSAGES · EVENTS…"
            autofocus
            @keydown.enter.prevent="runSearch"
          />
          <button class="btn btn-primary" :disabled="busy" @click="runSearch">SEARCH</button>
        </div>
        <div v-if="results" class="mt-2 font-mono text-[10px] tracking-[0.15em] text-faint">
          {{ total }} RESULTS
        </div>
      </header>

      <div v-if="results" class="space-y-8">
        <section v-if="results.agents.length">
          <div class="label mb-2">ENTITIES</div>
          <NuxtLink
            v-for="agent in results.agents"
            :key="agent.id"
            :to="`/agents/${agent.id}`"
            class="flex items-baseline gap-4 border-b border-line-soft px-2 py-2 transition-colors hover:bg-raised/60"
          >
            <StatusDot :status="agent.status" />
            <span class="text-[13px] text-ink">{{ agent.name }}</span>
            <span class="font-mono text-[9.5px] uppercase tracking-[0.15em] text-faint">{{ agent.role }}</span>
          </NuxtLink>
        </section>

        <section v-if="results.tasks.length">
          <div class="label mb-2">TASKS</div>
          <NuxtLink
            v-for="task in results.tasks"
            :key="task.id"
            to="/tasks"
            class="flex items-baseline gap-4 border-b border-line-soft px-2 py-2 transition-colors hover:bg-raised/60"
          >
            <span class="font-mono text-[10px] text-faint">#{{ task.number }}</span>
            <span class="truncate text-[13px] text-ink">{{ task.title }}</span>
            <span class="font-mono text-[9px] text-faint">{{ task.status }}</span>
            <span v-if="task.agent_name" class="font-mono text-[9px] text-arcane-dim">{{ task.agent_name }}</span>
          </NuxtLink>
        </section>

        <section v-if="results.projects.length">
          <div class="label mb-2">PROJECTS</div>
          <NuxtLink
            v-for="project in results.projects"
            :key="project.id"
            to="/projects"
            class="flex items-baseline gap-4 border-b border-line-soft px-2 py-2 transition-colors hover:bg-raised/60"
          >
            <span class="text-[13px] text-ink">{{ project.name }}</span>
            <span v-if="project.root_dir" class="truncate font-mono text-[9.5px] text-faint">{{ project.root_dir }}</span>
          </NuxtLink>
        </section>

        <section v-if="results.messages.length">
          <div class="label mb-2">CONVERSATIONS</div>
          <NuxtLink
            v-for="message in results.messages"
            :key="message.id"
            :to="`/agents/${message.agentId}`"
            class="block border-b border-line-soft px-2 py-2 transition-colors hover:bg-raised/60"
          >
            <div class="flex items-baseline gap-3">
              <span class="font-mono text-[9px] text-arcane-dim">{{ message.agentName }}</span>
              <span class="font-mono text-[9px] text-faint">{{ fmtTime(message.createdAt) }}</span>
            </div>
            <div class="mt-0.5 truncate text-[12.5px] text-dim">{{ message.snippet }}</div>
          </NuxtLink>
        </section>

        <section v-if="results.events.length">
          <div class="label mb-2">ACTIVITY</div>
          <div
            v-for="ev in results.events"
            :key="ev.id"
            class="border-b border-line-soft px-2 py-2 font-mono text-[11px] text-dim"
          >
            <span class="text-faint">{{ fmtTime(ev.created_at) }}</span>
            <span class="mx-2 text-arcane-dim">{{ ev.agent_name ?? 'SYSTEM' }}</span>
            {{ ev.summary }}
          </div>
        </section>

        <EmptyState v-if="total === 0" message="NO RESULTS" hint="TRY A DIFFERENT QUERY" />
      </div>

      <EmptyState v-else message="SEARCH ACROSS THE SYSTEM" hint="TWO CHARACTERS OR MORE" />
    </div>
  </div>
</template>
