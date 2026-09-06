<script setup lang="ts">
import type { Agent, Project, Task, TaskStatus } from '~~/shared/types'

const { data: tasks, refresh } = await useFetch<Task[]>('/api/tasks')
const { data: agents } = await useFetch<Agent[]>('/api/agents')
const { data: projects } = await useFetch<Project[]>('/api/projects')

const showForm = ref(false)
const editing = ref<Task | null>(null)
const draggingId = ref<string | null>(null)
const dragOverColumn = ref<string | null>(null)

interface Column {
  id: string
  label: string
  statuses: TaskStatus[]
  dropStatus: TaskStatus
}

const COLUMNS: Column[] = [
  { id: 'TODO', label: 'TODO', statuses: ['BACKLOG', 'TODO'], dropStatus: 'TODO' },
  { id: 'IN_PROGRESS', label: 'IN PROGRESS', statuses: ['IN_PROGRESS', 'BLOCKED'], dropStatus: 'IN_PROGRESS' },
  { id: 'REVIEW', label: 'REVIEW', statuses: ['REVIEW'], dropStatus: 'REVIEW' },
  { id: 'QA', label: 'QA', statuses: ['QA'], dropStatus: 'QA' },
  { id: 'DONE', label: 'DONE', statuses: ['DONE', 'FAILED', 'CANCELLED'], dropStatus: 'DONE' },
]

function tasksIn(column: Column): Task[] {
  return (tasks.value ?? []).filter((t) => column.statuses.includes(t.status))
}

function openNew() {
  editing.value = null
  showForm.value = true
}

function openEdit(task: Task) {
  editing.value = task
  showForm.value = true
}

async function onSaved() {
  showForm.value = false
  editing.value = null
  await refresh()
}

async function dropOn(column: Column) {
  const taskId = draggingId.value
  draggingId.value = null
  dragOverColumn.value = null
  if (!taskId) return
  const task = (tasks.value ?? []).find((t) => t.id === taskId)
  if (!task || task.status === column.dropStatus) return
  try {
    const { request } = useApi()
    await request(`/tasks/${taskId}`, {
      method: 'PATCH',
      body: { status: column.dropStatus },
    })
    await refresh()
  } catch (err) {
    window.alert((err as { message: string }).message)
  }
}

const PRIORITY_STYLE: Record<string, string> = {
  CRITICAL: 'text-blood',
  HIGH: 'text-arcane',
  NORMAL: 'text-faint',
  LOW: 'text-faint/70',
}

const BADGES: Partial<Record<TaskStatus, { label: string; class: string }>> = {
  BACKLOG: { label: 'BACKLOG', class: 'text-faint' },
  BLOCKED: { label: 'BLOCKED', class: 'text-blood' },
  FAILED: { label: 'FAILED', class: 'text-blood' },
  CANCELLED: { label: 'CANCELLED', class: 'text-faint' },
}

const { lastPayload } = useRealtime()
watch(lastPayload, (payload) => {
  if (payload?.kind === 'event' && payload.event?.type.startsWith('task.')) {
    void refresh()
  }
})
</script>

<template>
  <div class="flex h-full min-w-0 flex-col">
    <header class="flex h-12 shrink-0 items-center justify-between border-b border-line px-5">
      <div class="flex items-baseline gap-3">
        <span class="text-[13.5px] tracking-[0.2em] text-ink">TASKS</span>
        <span class="font-mono text-[9.5px] uppercase tracking-[0.25em] text-faint">
          {{ tasks?.length ?? 0 }} RECORDED
        </span>
      </div>
      <button class="btn btn-primary" @click="openNew">NEW TASK</button>
    </header>

    <div class="min-h-0 flex-1 overflow-x-auto">
      <div class="flex h-full min-w-[960px] gap-3 p-4">
        <div
          v-for="column in COLUMNS"
          :key="column.id"
          class="flex min-h-0 w-1/5 flex-col border border-line bg-abyss"
          :class="dragOverColumn === column.id ? 'border-arcane' : ''"
          @dragover.prevent="dragOverColumn = column.id"
          @dragleave="dragOverColumn === column.id && (dragOverColumn = null)"
          @drop.prevent="dropOn(column)"
        >
          <div class="flex items-baseline justify-between border-b border-line px-3 py-2">
            <span class="label">{{ column.label }}</span>
            <span class="font-mono text-[10px] text-faint">{{ tasksIn(column).length }}</span>
          </div>

          <div class="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
            <div
              v-for="task in tasksIn(column)"
              :key="task.id"
              class="cursor-grab border border-line-strong bg-surface p-3 transition-all active:cursor-grabbing"
              :class="draggingId === task.id ? 'opacity-40' : 'hover:border-arcane/60'"
              draggable="true"
              @dragstart="draggingId = task.id"
              @dragend="draggingId = null"
              @click="openEdit(task)"
            >
              <div class="flex items-baseline justify-between gap-2">
                <span class="font-mono text-[9px] text-faint">#{{ task.number }}</span>
                <span
                  v-if="BADGES[task.status]"
                  class="font-mono text-[8.5px] tracking-[0.12em]"
                  :class="BADGES[task.status]?.class"
                >
                  {{ BADGES[task.status]?.label }}
                </span>
                <span v-else class="font-mono text-[8.5px] tracking-[0.12em]" :class="PRIORITY_STYLE[task.priority]">
                  {{ task.priority }}
                </span>
              </div>
              <div class="mt-1.5 text-[12.5px] leading-snug text-ink">{{ task.title }}</div>
              <div class="mt-2 space-y-0.5 font-mono text-[9px] tracking-[0.08em] text-faint">
                <div v-if="task.assignedAgentName">◈ {{ task.assignedAgentName }}</div>
                <div v-if="task.projectName">{{ task.projectName }}</div>
                <div v-if="task.parentNumber">↳ #{{ task.parentNumber }} {{ task.parentTitle }}</div>
              </div>
            </div>

            <p
              v-if="tasksIn(column).length === 0"
              class="px-2 py-6 text-center font-mono text-[9px] tracking-[0.2em] text-faint/50"
            >
              EMPTY
            </p>
          </div>
        </div>
      </div>
    </div>

    <Modal :open="showForm" :title="editing ? `TASK #${editing.number}` : 'NEW TASK'" @close="showForm = false">
      <TaskForm
        :task="editing"
        :projects="projects ?? []"
        :agents="agents ?? []"
        :tasks="tasks ?? []"
        @saved="onSaved"
        @close="showForm = false"
      />
    </Modal>
  </div>
</template>
