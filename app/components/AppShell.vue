<script setup lang="ts">
import type { Agent, Project } from '~~/shared/types'

const route = useRoute()
const { request } = useApi()
const { selectedProjectId } = useErebusState()
const version = useRuntimeConfig().public.version as string

const { data: agents, refresh: refreshAgents } = await useFetch<Agent[]>('/api/agents')
const { data: projects } = await useFetch<Project[]>('/api/projects')

// Realtime: refresh the sidebar whenever an entity-relevant payload arrives.
const { connected, lastPayload } = useRealtime()
watch(lastPayload, (payload) => {
  if (!payload) return
  if (payload.kind === 'agent.status') {
    void refreshAgents()
    return
  }
  if (payload.kind === 'event' && payload.event?.agentId) {
    void refreshAgents()
  }
})

// Slow fallback polling while the socket is down — statuses stay honest.
let fallbackTimer: ReturnType<typeof setInterval> | null = null
function syncFallback() {
  if (fallbackTimer) {
    clearInterval(fallbackTimer)
    fallbackTimer = null
  }
  if (!connected.value) {
    fallbackTimer = setInterval(() => void refreshAgents(), 5000)
  }
}
watch(connected, syncFallback, { immediate: true })
onUnmounted(() => {
  if (fallbackTimer) clearInterval(fallbackTimer)
})

const filteredAgents = computed(() => {
  const all = agents.value ?? []
  return selectedProjectId.value
    ? all.filter((a) => a.projectId === selectedProjectId.value)
    : all
})

const VIEW_TITLES: Record<string, string> = {
  index: 'COMMAND',
  agents: 'ENTITIES',
  'agents-id': 'ENTITY',
  tasks: 'TASKS',
  projects: 'PROJECTS',
  providers: 'PROVIDERS',
  settings: 'SYSTEM',
}

const viewTitle = computed(() => VIEW_TITLES[String(route.name)] ?? '')

const NAV = [
  { to: '/', label: 'COMMAND' },
  { to: '/agents', label: 'ENTITIES' },
  { to: '/tasks', label: 'TASKS' },
  { to: '/projects', label: 'PROJECTS' },
  { to: '/providers', label: 'PROVIDERS' },
  { to: '/settings', label: 'SYSTEM' },
]

async function signOut() {
  try {
    await request('/auth/logout', { method: 'POST' })
  } finally {
    await navigateTo('/login', { replace: true })
  }
}

// ── Command palette (Ctrl+K) ──────────────────────────────────────────

const paletteOpen = ref(false)
const router = useRouter()

function onGlobalKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    paletteOpen.value = !paletteOpen.value
  }
}
onMounted(() => window.addEventListener('keydown', onGlobalKeydown))
onUnmounted(() => window.removeEventListener('keydown', onGlobalKeydown))

// ── Search ─────────────────────────────────────────────────────────────

const searchQuery = ref('')
function runSearch() {
  const q = searchQuery.value.trim()
  if (q.length >= 2) void router.push(`/search?q=${encodeURIComponent(q)}`)
}

// ── Mobile sidebar ─────────────────────────────────────────────────────

const sidebarOpen = ref(false)
function closeSidebar() {
  sidebarOpen.value = false
}
watch(
  () => route.path,
  () => closeSidebar(),
)
</script>

<template>
  <div class="flex h-screen w-full overflow-hidden bg-void text-ink">
    <!-- mobile sidebar backdrop -->
    <div
      v-if="sidebarOpen"
      class="fixed inset-0 z-40 bg-black/60 lg:hidden"
      @click="closeSidebar"
    />

    <!-- LEFT · entity navigation -->
    <aside
      class="fixed inset-y-0 left-0 z-40 flex w-[264px] shrink-0 -translate-x-full flex-col border-r border-line bg-abyss transition-transform duration-200 lg:static lg:translate-x-0"
      :class="sidebarOpen ? 'translate-x-0' : ''"
    >
      <div class="shrink-0 space-y-4 border-b border-line px-4 py-4">
        <div class="label mb-1.5">PROJECTS</div>
        <div class="space-y-0.5">
          <button
            class="flex w-full cursor-pointer items-center justify-between px-2 py-1 text-left transition-colors"
            :class="!selectedProjectId ? 'bg-raised text-ink' : 'text-dim hover:text-ink'"
            @click="selectedProjectId = null"
          >
            <span class="truncate font-mono text-[11px] tracking-[0.15em]">ALL PROJECTS</span>
            <span class="font-mono text-[10px] text-faint">{{ agents?.length ?? 0 }}</span>
          </button>
          <button
            v-for="p in projects ?? []"
            :key="p.id"
            class="flex w-full cursor-pointer items-center justify-between px-2 py-1 text-left transition-colors"
            :class="selectedProjectId === p.id ? 'bg-raised text-ink' : 'text-dim hover:text-ink'"
            @click="selectedProjectId = selectedProjectId === p.id ? null : p.id"
          >
            <span class="truncate text-[12.5px]">{{ p.name }}</span>
            <span class="font-mono text-[10px] text-faint">{{ p.agentCount ?? 0 }}</span>
          </button>
          <NuxtLink
            to="/projects"
            class="block px-2 py-1 font-mono text-[10px] tracking-[0.2em] text-faint transition-colors hover:text-arcane"
          >
            + NEW PROJECT
          </NuxtLink>
        </div>

        <div>
          <div class="mb-1.5 flex items-baseline justify-between">
            <span class="label">ENTITIES</span>
            <span class="font-mono text-[10px] text-faint">{{ filteredAgents.length }}</span>
          </div>
          <nav class="max-h-[38vh] space-y-0.5 overflow-y-auto pr-1">
            <NuxtLink
              v-for="agent in filteredAgents"
              :key="agent.id"
              :to="`/agents/${agent.id}`"
              class="group flex items-center gap-3 border-l-2 px-2.5 py-2 transition-colors duration-150"
              :class="
                route.params.id === agent.id
                  ? 'border-arcane bg-raised'
                  : 'border-transparent hover:bg-raised/60'
              "
            >
              <StatusDot :status="agent.status" />
              <div class="min-w-0">
                <div
                  class="truncate text-[13px] tracking-wide"
                  :class="route.params.id === agent.id ? 'text-ink' : 'text-dim group-hover:text-ink'"
                >
                  {{ agent.name }}
                </div>
                <div class="truncate font-mono text-[9px] uppercase tracking-[0.2em] text-faint">
                  {{ agent.role || 'UNASSIGNED' }}
                </div>
              </div>
            </NuxtLink>
            <p v-if="filteredAgents.length === 0" class="px-2.5 py-2 font-mono text-[10px] tracking-[0.15em] text-faint/60">
              NO ENTITIES IN THIS PROJECT
            </p>
          </nav>
          <NuxtLink
            to="/agents"
            class="mt-1 block px-2.5 py-1 font-mono text-[10px] tracking-[0.2em] text-faint transition-colors hover:text-arcane"
          >
            + NEW ENTITY
          </NuxtLink>
        </div>
      </div>

      <!-- SYSTEM nav -->
      <nav class="shrink-0 space-y-0.5 border-b border-line px-4 py-4">
        <NuxtLink
          v-for="item in NAV"
          :key="item.to"
          :to="item.to"
          class="flex items-center justify-between px-2 py-1.5 transition-colors"
          :class="route.path === item.to ? 'text-arcane' : 'text-dim hover:text-ink'"
        >
          <span class="font-mono text-[11px] tracking-[0.22em]">{{ item.label }}</span>
          <span v-if="route.path === item.to" class="text-arcane">▸</span>
        </NuxtLink>
      </nav>

      <div class="mt-auto shrink-0 px-4 py-4">
        <div class="mb-2 font-mono text-[10px] tracking-[0.15em] text-faint">OPERATOR</div>
        <button
          class="w-full cursor-pointer border border-line px-3 py-2 text-left font-mono text-[11px] tracking-[0.15em] text-dim transition-colors hover:border-blood/50 hover:text-blood"
          @click="signOut"
        >
          SIGN OUT
        </button>
      </div>
    </aside>

    <!-- CENTER / RIGHT -->
    <div class="flex min-w-0 flex-1 flex-col">
      <header class="flex h-12 shrink-0 items-center justify-between border-b border-line px-5">
        <div class="flex min-w-0 items-center gap-4">
          <button
            class="cursor-pointer font-mono text-sm text-faint transition-colors hover:text-ink lg:hidden"
            @click="sidebarOpen = true"
          >
            ☰
          </button>
          <span class="text-[13px] font-medium tracking-[0.28em] text-ink">E R E B U S</span>
          <span v-if="viewTitle" class="hidden font-mono text-[10px] tracking-[0.25em] text-faint sm:inline">
            / {{ viewTitle }}
          </span>
        </div>
        <div class="flex min-w-0 items-center gap-4">
          <div class="hidden items-center gap-2 md:flex">
            <input
              v-model="searchQuery"
              class="w-44 bg-abyss px-2.5 py-1 font-mono text-[10px] tracking-[0.1em] text-dim outline-none transition-colors placeholder:text-faint focus:text-ink"
              placeholder="SEARCH…"
              @keydown.enter.prevent="runSearch"
            />
          </div>
          <div class="flex items-center gap-2 font-mono text-[10px] tracking-[0.2em] text-faint">
            <StatusDot status="COMPLETED" />
            <span class="hidden sm:inline">SYSTEM ONLINE</span>
          </div>
          <button
            class="hidden cursor-pointer border border-line px-2 py-0.5 font-mono text-[9px] tracking-[0.15em] text-faint transition-colors hover:text-ink sm:block"
            @click="paletteOpen = true"
          >
            CTRL K
          </button>
          <span class="hidden font-mono text-[10px] tracking-[0.2em] text-faint md:inline">v{{ version }}</span>
        </div>
      </header>
      <main class="min-h-0 flex-1 overflow-hidden">
        <slot />
      </main>
    </div>

    <CommandPalette :open="paletteOpen" :agents="agents ?? []" @close="paletteOpen = false" />
    <NotificationCenter />
  </div>
</template>
