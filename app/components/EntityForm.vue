<script setup lang="ts">
import type { Agent, PermissionLevel, Permissions, Project, Provider, ToolId } from '~~/shared/types'

const props = defineProps<{
  agent?: Agent | null
  providers: Provider[]
  projects: Project[]
  agents: Agent[]
}>()

const emit = defineEmits<{ saved: []; close: [] }>()

const { request } = useApi()
const busy = ref(false)
const error = ref('')

const DEFAULT_PERMISSIONS: Permissions = {
  filesystem: 'ask',
  git: 'ask',
  terminal: 'ask',
  network: 'deny',
  mcp: 'allow',
}

const form = reactive({
  name: props.agent?.name ?? '',
  role: props.agent?.role ?? '',
  description: props.agent?.description ?? '',
  systemPrompt: props.agent?.systemPrompt ?? '',
  providerId: props.agent?.providerId ?? '',
  modelOverride: props.agent?.modelOverride ?? '',
  projectId: props.agent?.projectId ?? '',
  parentId: props.agent?.parentId ?? '',
  workingDir: props.agent?.workingDir ?? '',
  tools: [...(props.agent?.tools ?? ['filesystem', 'git', 'terminal'])] as ToolId[],
  permissions: { ...(props.agent?.permissions ?? DEFAULT_PERMISSIONS) } as Permissions,
})

const TOOL_OPTIONS: { id: ToolId; label: string }[] = [
  { id: 'filesystem', label: 'FILESYSTEM' },
  { id: 'git', label: 'GIT' },
  { id: 'terminal', label: 'TERMINAL' },
  { id: 'network', label: 'NETWORK' },
  { id: 'mcp', label: 'MCP' },
]
const PERMISSION_LEVELS: PermissionLevel[] = ['allow', 'auto', 'ask', 'readonly', 'deny']

const TEMPLATES = [
  {
    name: 'ARCHON',
    role: 'Orchestrator',
    description: 'Primary orchestrator of EREBUS. Decomposes objectives into tasks, assigns them to entities, monitors progress and reports status.',
    systemPrompt: 'You are ARCHON, the primary orchestrator of EREBUS. You receive high-level objectives, decompose them into discrete tasks, assign tasks to the appropriate entities, monitor progress, detect failures, reassign work, and report overall status concisely. Prefer action over discussion. Always report exactly what is done and what remains. Use your tools: entity_create, entity_start, entity_stop, send_message, task_create, task_update, task_list, ask_operator, list_entities.',
    tools: ['filesystem', 'git', 'terminal', 'mcp'],
  },
  {
    name: 'CHIRON',
    role: 'Project Manager',
    description: 'Keeps scope, priorities and dependencies in order. Reviews entity output and tracks delivery.',
    systemPrompt: 'You are CHIRON, project manager of the EREBUS system. You keep scope, priorities and dependencies in order, review entity output, and track delivery. You report risks early and precisely.',
    tools: ['filesystem', 'git', 'terminal', 'mcp'],
  },
  {
    name: 'VESPER',
    role: 'Developer',
    description: 'Implementation specialist. Works inside the codebase, makes the requested changes, and verifies them.',
    systemPrompt: 'You are VESPER, a developer entity of EREBUS. You implement the tasks assigned to you inside the project codebase, run the necessary commands to verify your work, and report precisely what changed and what was tested.',
  },
  {
    name: 'CROW',
    role: 'Developer',
    description: 'Implementation specialist. Works inside the codebase, makes the requested changes, and verifies them.',
    systemPrompt: 'You are CROW, a developer entity of EREBUS. You implement the tasks assigned to you inside the project codebase, run the necessary commands to verify your work, and report precisely what changed and what was tested.',
  },
  {
    name: 'ARGUS',
    role: 'QA',
    description: 'Verifies implemented work against the requirements. Finds what is broken and reports it precisely.',
    systemPrompt: 'You are ARGUS, a QA entity of EREBUS. You verify implemented work against the requirements, exercise the relevant paths, and report every defect with exact reproduction details.',
  },
  {
    name: 'AEGIS',
    role: 'QA',
    description: 'Regression and stability specialist. Guards against collateral damage across the whole system.',
    systemPrompt: 'You are AEGIS, a QA entity of EREBUS. You perform regression and stability testing across the system, watching for collateral damage from recent changes, and report what regressed and why.',
  },
] as const

function applyTemplate(template: (typeof TEMPLATES)[number]) {
  form.name = template.name
  form.role = template.role
  form.description = template.description
  form.systemPrompt = template.systemPrompt
  if ('tools' in template && Array.isArray(template.tools)) {
    form.tools = [...template.tools] as ToolId[]
  }
}

function toggleTool(tool: ToolId) {
  if (form.tools.includes(tool)) {
    form.tools = form.tools.filter((t) => t !== tool)
  } else {
    form.tools = [...form.tools, tool]
  }
}

const selectableParents = computed(() =>
  props.agents.filter((a) => !props.agent || a.id !== props.agent.id),
)

const selectedProviderKind = computed(
  () => props.providers.find((p) => p.id === form.providerId)?.kind ?? null,
)

async function submit() {
  if (!form.name.trim()) {
    error.value = 'A name is required.'
    return
  }
  busy.value = true
  error.value = ''
  try {
    await request(props.agent ? `/agents/${props.agent.id}` : '/agents', {
      method: props.agent ? 'PATCH' : 'POST',
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
  <div class="space-y-5">
    <div v-if="!agent">
      <span class="label mb-2 block">TEMPLATES</span>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="template in TEMPLATES"
          :key="template.name"
          class="btn"
          :class="form.name === template.name ? 'btn-primary' : ''"
          @click="applyTemplate(template)"
        >
          {{ template.name }}
        </button>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-4">
      <FieldBlock label="NAME">
        <input v-model="form.name" class="field font-mono" maxlength="32" />
      </FieldBlock>
      <FieldBlock label="ROLE">
        <input v-model="form.role" class="field" maxlength="64" />
      </FieldBlock>
    </div>

    <FieldBlock label="DESCRIPTION">
      <input v-model="form.description" class="field" maxlength="2000" />
    </FieldBlock>

    <FieldBlock label="SYSTEM PROMPT">
      <textarea
        v-model="form.systemPrompt"
        rows="5"
        class="field resize-y font-mono text-[12px] leading-relaxed"
      />
    </FieldBlock>

    <div class="grid grid-cols-2 gap-4">
      <FieldBlock label="PROVIDER">
        <select v-model="form.providerId" class="field">
          <option value="">— NONE —</option>
          <option v-for="p in providers" :key="p.id" :value="p.id">{{ p.label }}</option>
        </select>
      </FieldBlock>
      <FieldBlock label="MODEL OVERRIDE">
        <ModelSelect
          v-model="form.modelOverride"
          :provider-id="form.providerId || null"
          :kind="selectedProviderKind"
          empty-label="PROVIDER DEFAULT"
          placeholder="SELECT A PROVIDER FIRST"
        />
      </FieldBlock>
      <FieldBlock label="PROJECT">
        <select v-model="form.projectId" class="field">
          <option value="">— NONE —</option>
          <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
      </FieldBlock>
      <FieldBlock label="PARENT ENTITY">
        <select v-model="form.parentId" class="field">
          <option value="">— NONE —</option>
          <option v-for="a in selectableParents" :key="a.id" :value="a.id">{{ a.name }}</option>
        </select>
      </FieldBlock>
    </div>

    <FieldBlock label="WORKING DIRECTORY">
      <input
        v-model="form.workingDir"
        class="field font-mono text-[12px]"
        placeholder="C:\Projects\..."
      />
    </FieldBlock>

    <div>
      <span class="label mb-2 block">TOOLS &amp; PERMISSIONS</span>
      <div class="grid grid-cols-2 gap-3">
        <div
          v-for="tool in TOOL_OPTIONS"
          :key="tool.id"
          class="border border-line bg-abyss p-3"
        >
          <label class="flex cursor-pointer items-center gap-2.5 font-mono text-[11px] tracking-[0.15em] text-dim">
            <input
              type="checkbox"
              class="accent-[var(--color-arcane)]"
              :checked="form.tools.includes(tool.id)"
              @change="toggleTool(tool.id)"
            />
            {{ tool.label }}
          </label>
          <select
            v-if="form.tools.includes(tool.id)"
            v-model="form.permissions[tool.id]"
            class="field mt-2.5 py-1 font-mono text-[10px]"
          >
            <option v-for="level in PERMISSION_LEVELS" :key="level" :value="level">
              {{ level.toUpperCase() }}
            </option>
          </select>
        </div>
      </div>
    </div>

    <div v-if="error" class="font-mono text-[11px] text-blood">{{ error }}</div>

    <div class="flex justify-end gap-3 border-t border-line pt-4">
      <button class="btn" @click="emit('close')">CANCEL</button>
      <button class="btn btn-primary" :disabled="busy" @click="submit">
        {{ agent ? 'SAVE CHANGES' : 'CREATE ENTITY' }}
      </button>
    </div>
  </div>
</template>
