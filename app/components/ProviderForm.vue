<script setup lang="ts">
import type { Provider, ProviderKind } from '~~/shared/types'

const props = defineProps<{ provider?: Provider | null }>()
const emit = defineEmits<{ saved: []; close: [] }>()

const { request } = useApi()
const busy = ref(false)
const error = ref('')

const KINDS: { id: ProviderKind; label: string }[] = [
  { id: 'claude', label: 'CLAUDE' },
  { id: 'deepseek', label: 'DEEPSEEK' },
  { id: 'openai', label: 'OPENAI' },
  { id: 'gemini', label: 'GEMINI' },
  { id: 'custom', label: 'CUSTOM' },
]

const form = reactive({
  kind: (props.provider?.kind ?? 'claude') as ProviderKind,
  label: props.provider?.label ?? '',
  baseUrl: props.provider?.baseUrl ?? '',
  model: props.provider?.model ?? '',
  temperature: props.provider?.temperature ?? 0.7,
  maxTokens: props.provider?.maxTokens ?? 8192,
  apiKey: '',
})

const PRESET_URLS: Record<ProviderKind, string> = {
  claude: 'https://api.anthropic.com',
  deepseek: 'https://api.deepseek.com',
  openai: 'https://api.openai.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
  custom: '',
}

function onKindChange() {
  if (!form.baseUrl) form.baseUrl = PRESET_URLS[form.kind]
  if (form.kind !== 'custom' && !form.label) {
    form.label = KINDS.find((k) => k.id === form.kind)?.label ?? ''
  }
}

async function submit() {
  if (!form.label.trim() || !form.baseUrl.trim()) {
    error.value = 'Label and base URL are required.'
    return
  }
  busy.value = true
  error.value = ''
  try {
    const body: Record<string, unknown> = { ...form }
    // Only send the key when the operator typed a new one.
    if (!form.apiKey) delete body.apiKey
    await request(props.provider ? `/providers/${props.provider.id}` : '/providers', {
      method: props.provider ? 'PATCH' : 'POST',
      body,
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
    <div class="grid grid-cols-2 gap-4">
      <FieldBlock label="KIND">
        <select v-model="form.kind" class="field font-mono" @change="onKindChange">
          <option v-for="k in KINDS" :key="k.id" :value="k.id">{{ k.label }}</option>
        </select>
      </FieldBlock>
      <FieldBlock label="LABEL">
        <input v-model="form.label" class="field" maxlength="64" />
      </FieldBlock>
    </div>

    <FieldBlock label="BASE URL">
      <input v-model="form.baseUrl" class="field font-mono text-[12px]" />
    </FieldBlock>

    <div class="grid grid-cols-2 gap-4">
      <FieldBlock label="MODEL">
        <ModelSelect
          v-model="form.model"
          :provider-id="provider?.id ?? null"
          :kind="form.kind"
        />
      </FieldBlock>
      <FieldBlock label="MAX TOKENS">
        <input v-model.number="form.maxTokens" type="number" min="1" max="131072" class="field font-mono" />
      </FieldBlock>
    </div>

    <FieldBlock label="TEMPERATURE">
      <input v-model.number="form.temperature" type="number" min="0" max="2" step="0.1" class="field font-mono" />
    </FieldBlock>

    <FieldBlock :label="provider?.configured ? 'API KEY (BLANK KEEPS CURRENT)' : 'API KEY'">
      <input
        v-model="form.apiKey"
        type="password"
        class="field font-mono"
        autocomplete="off"
        :placeholder="provider?.configured ? `${provider.apiKeyHint ?? ''} — enter to replace` : 'sk-...'"
      />
    </FieldBlock>

    <div v-if="error" class="font-mono text-[11px] text-blood">{{ error }}</div>

    <div class="flex justify-end gap-3 border-t border-line pt-4">
      <button class="btn" @click="emit('close')">CANCEL</button>
      <button class="btn btn-primary" :disabled="busy" @click="submit">
        {{ provider ? 'SAVE CHANGES' : 'ADD PROVIDER' }}
      </button>
    </div>
  </div>
</template>
