<script setup lang="ts">
import type { Agent } from '~~/shared/types'

/**
 * Ctrl+K command palette: navigation, entity switching, actions.
 * Keyboard-first: arrows to move, enter to run, esc to close.
 */

const props = defineProps<{ open: boolean; agents: Agent[] }>()
const emit = defineEmits<{ close: [] }>()

const router = useRouter()
const query = ref('')
const selectedIndex = ref(0)
const listRef = ref<HTMLElement | null>(null)

interface Command {
  id: string
  group: string
  label: string
  hint?: string
  run: () => void
}

const commands = computed<Command[]>(() => {
  const nav: Command[] = [
    { id: 'nav-dashboard', group: 'NAVIGATE', label: 'Command — Dashboard', run: () => router.push('/') },
    { id: 'nav-entities', group: 'NAVIGATE', label: 'Entities', run: () => router.push('/agents') },
    { id: 'nav-tasks', group: 'NAVIGATE', label: 'Task Board', run: () => router.push('/tasks') },
    { id: 'nav-projects', group: 'NAVIGATE', label: 'Projects', run: () => router.push('/projects') },
    { id: 'nav-providers', group: 'NAVIGATE', label: 'Providers', run: () => router.push('/providers') },
    { id: 'nav-settings', group: 'NAVIGATE', label: 'System Settings', run: () => router.push('/settings') },
  ]
  const entities: Command[] = props.agents.map((a) => ({
    id: `entity-${a.id}`,
    group: 'ENTITIES',
    label: a.name,
    hint: `${a.role || 'UNASSIGNED'} · ${a.status}`,
    run: () => router.push(`/agents/${a.id}`),
  }))
  const actions: Command[] = [
    {
      id: 'act-task',
      group: 'ACTIONS',
      label: 'New Task',
      hint: 'opens the task board',
      run: () => router.push('/tasks'),
    },
    {
      id: 'act-entity',
      group: 'ACTIONS',
      label: 'New Entity',
      hint: 'opens the entity roster',
      run: () => router.push('/agents'),
    },
  ]
  const searchCmd: Command = {
    id: 'act-search',
    group: 'ACTIONS',
    label: 'Search: ' + query.value,
    hint: 'global search',
    run: () => router.push(`/search?q=${encodeURIComponent(query.value)}`),
  }

  const all = query.value.trim() ? [searchCmd, ...nav, ...entities, ...actions] : [...nav, ...actions, ...entities]
  const filter = query.value.trim().toLowerCase()
  return filter
    ? all.filter((c) => c.id === 'act-search' || c.label.toLowerCase().includes(filter) || c.hint?.toLowerCase().includes(filter))
    : all
})

function runSelected() {
  const cmd = commands.value[selectedIndex.value]
  if (cmd) {
    cmd.run()
    emit('close')
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectedIndex.value = Math.min(selectedIndex.value + 1, commands.value.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedIndex.value = Math.max(selectedIndex.value - 1, 0)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    runSelected()
  } else if (e.key === 'Escape') {
    emit('close')
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      query.value = ''
      selectedIndex.value = 0
      nextTick(() => listRef.value?.querySelector('input')?.focus())
    }
  },
)

watch(commands, () => {
  selectedIndex.value = 0
})
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh]">
      <div class="absolute inset-0 bg-black/70" @click="emit('close')" />
      <div
        class="relative w-full max-w-lg border border-line-strong bg-surface shadow-[8px_8px_0_rgba(0,0,0,0.65)]"
        @keydown="onKeydown"
      >
        <div ref="listRef" class="border-b border-line p-3">
          <input
            v-model="query"
            class="w-full bg-transparent font-mono text-[13px] text-ink outline-none placeholder:text-faint"
            placeholder="TYPE A COMMAND OR SEARCH…"
          />
        </div>
        <div class="max-h-[46vh] overflow-y-auto py-2">
          <div v-for="(cmd, index) in commands.slice(0, 40)" :key="cmd.id">
            <div
              v-if="index === 0 || commands[index - 1]?.group !== cmd.group"
              class="label px-4 pb-1 pt-2"
            >
              {{ cmd.group }}
            </div>
            <button
              class="flex w-full cursor-pointer items-baseline justify-between gap-4 px-4 py-1.5 text-left transition-colors"
              :class="selectedIndex === index ? 'bg-raised text-ink' : 'text-dim'"
              @mouseenter="selectedIndex = index"
              @click="runSelected"
            >
              <span class="truncate text-[13px]">{{ cmd.label }}</span>
              <span v-if="cmd.hint" class="shrink-0 font-mono text-[9px] tracking-[0.12em] text-faint">
                {{ cmd.hint }}
              </span>
            </button>
          </div>
          <p v-if="commands.length === 0" class="px-4 py-3 font-mono text-[10px] tracking-[0.15em] text-faint">
            NO MATCHES
          </p>
        </div>
        <div class="flex items-center justify-between border-t border-line px-4 py-2 font-mono text-[9px] tracking-[0.15em] text-faint">
          <span>↑↓ MOVE · ENTER RUN · ESC CLOSE</span>
          <span>CTRL+K</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>
