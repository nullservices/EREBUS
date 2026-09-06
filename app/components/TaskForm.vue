<script setup lang="ts">
import type { Agent, Project, Task, TaskPriority, TaskStatus } from '~~/shared/types'

const props = defineProps<{
  task?: Task | null
  projects: Project[]
  agents: Agent[]
  tasks: Task[]
}>()

const emit = defineEmits<{ saved: []; close: [] }>()

const { request } = useApi()
const busy = ref(false)
const error = ref('')

const form = reactive({
  title: props.task?.title ?? '',
  description: props.task?.description ?? '',
  status: (props.task?.status ?? 'TODO') as TaskStatus,
  priority: (props.task?.priority ?? 'NORMAL') as TaskPriority,
  projectId: props.task?.projectId ?? '',
  parentId: props.task?.parentId ?? '',
  assignedAgentId: props.task?.assignedAgentId ?? '',
  result: props.task?.result ?? '',
})

const STATUSES: TaskStatus[] = [
  'BACKLOG',
  'TODO',
  'IN_PROGRESS',
  'BLOCKED',
  'REVIEW',
  'QA',
  'DONE',
  'FAILED',
  'CANCELLED',
]
const PRIORITIES: TaskPriority[] = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL']

const selectableParents = computed(() =>
  props.tasks.filter((t) => !props.task || t.id !== props.task.id),
)

async function submit() {
  if (form.title.trim().length < 2) {
    error.value = 'A title is required.'
    return
  }
  busy.value = true
  error.value = ''
  try {
    await request(props.task ? `/tasks/${props.task.id}` : '/tasks', {
      method: props.task ? 'PATCH' : 'POST',
      body: { ...form },
    })
    emit('saved')
  } catch (err) {
    error.value = (err as { message: string }).message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <FieldBlock label="TITLE">
      <input v-model="form.title" class="field" maxlength="200" />
    </FieldBlock>

    <FieldBlock label="DESCRIPTION">
      <textarea v-model="form.description" rows="4" class="field resize-y" />
    </FieldBlock>

    <div class="grid grid-cols-2 gap-4">
      <FieldBlock label="STATUS">
        <select v-model="form.status" class="field font-mono">
          <option v-for="s in STATUSES" :key="s" :value="s">{{ s.replace('_', ' ') }}</option>
        </select>
      </FieldBlock>
      <FieldBlock label="PRIORITY">
        <select v-model="form.priority" class="field font-mono">
          <option v-for="p in PRIORITIES" :key="p" :value="p">{{ p }}</option>
        </select>
      </FieldBlock>
      <FieldBlock label="PROJECT">
        <select v-model="form.projectId" class="field">
          <option value="">— NONE —</option>
          <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
      </FieldBlock>
      <FieldBlock label="ASSIGNED ENTITY">
        <select v-model="form.assignedAgentId" class="field">
          <option value="">— UNASSIGNED —</option>
          <option v-for="a in agents" :key="a.id" :value="a.id">{{ a.name }}</option>
        </select>
      </FieldBlock>
    </div>

    <FieldBlock label="PARENT TASK">
      <select v-model="form.parentId" class="field font-mono">
        <option value="">— NONE —</option>
        <option v-for="t in selectableParents" :key="t.id" :value="t.id">
          #{{ t.number }} · {{ t.title }}
        </option>
      </select>
    </FieldBlock>

    <FieldBlock v-if="task" label="RESULT">
      <textarea v-model="form.result" rows="3" class="field resize-y font-mono text-[12px]" />
    </FieldBlock>

    <div v-if="error" class="font-mono text-[11px] text-blood">{{ error }}</div>

    <div class="flex justify-end gap-3 border-t border-line pt-4">
      <button class="btn" @click="emit('close')">CANCEL</button>
      <button class="btn btn-primary" :disabled="busy" @click="submit">
        {{ task ? 'SAVE CHANGES' : 'CREATE TASK' }}
      </button>
    </div>
  </div>
</template>
