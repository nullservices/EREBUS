<script setup lang="ts">
import type { ModelCatalog, ProviderKind } from '~~/shared/types'

/**
 * Model dropdown fed by the provider:
 * - live list where the provider API exposes one (DeepSeek),
 * - curated catalog otherwise (Claude CLI, providers without adapters),
 * - the current value is always kept as an option,
 * - CUSTOM… reveals a free-text input for models outside the list.
 *
 * Pass the provider id when it exists (live fetch); pass the kind when
 * configuring an unsaved provider (catalog only).
 */

const props = defineProps<{
  providerId: string | null
  kind?: ProviderKind | null
  modelValue: string
  emptyLabel?: string
  placeholder?: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const { request } = useApi()
const catalog = ref<ModelCatalog | null>(null)
const loading = ref(false)
const error = ref('')
const showCustom = ref(false)
const customValue = ref('')

const canLoad = computed(() => Boolean(props.providerId || props.kind))

const options = computed(() => {
  const list = catalog.value?.models ?? []
  if (props.modelValue && !list.some((m) => m.id === props.modelValue)) {
    return [{ id: props.modelValue, label: `${props.modelValue} (CURRENT)` }, ...list]
  }
  return list
})

async function fetchModels() {
  if (!canLoad.value) {
    catalog.value = null
    showCustom.value = false
    return
  }
  loading.value = true
  error.value = ''
  try {
    catalog.value = await request<ModelCatalog>(
      props.providerId
        ? `/providers/${props.providerId}/models`
        : `/providers/models?kind=${encodeURIComponent(props.kind ?? '')}`,
    )
  } catch (err) {
    error.value = (err as { message: string }).message
  } finally {
    loading.value = false
  }
}

watch(() => [props.providerId, props.kind], fetchModels, { immediate: true })

function onSelect(value: string) {
  if (value === '__custom__') {
    customValue.value = ''
    showCustom.value = true
  } else {
    showCustom.value = false
    emit('update:modelValue', value)
  }
}

function applyCustom() {
  const value = customValue.value.trim()
  if (value) emit('update:modelValue', value)
  showCustom.value = false
}
</script>

<template>
  <div>
    <div class="flex items-stretch gap-2">
      <select
        class="field font-mono text-[12px]"
        :disabled="!canLoad"
        :value="showCustom ? '__custom__' : modelValue"
        @change="onSelect(($event.target as HTMLSelectElement).value)"
      >
        <option v-if="!canLoad" value="">{{ placeholder ?? 'SELECT A PROVIDER FIRST' }}</option>
        <template v-else>
          <option v-if="emptyLabel !== undefined" value="">{{ emptyLabel }}</option>
          <option v-for="m in options" :key="m.id" :value="m.id">{{ m.label }}</option>
          <option value="__custom__">CUSTOM…</option>
        </template>
      </select>
      <button
        class="btn shrink-0"
        :disabled="!canLoad || loading"
        :title="canLoad ? 'Fetch the current model list from the provider' : 'Assign a provider first'"
        @click="fetchModels"
      >
        {{ loading ? '…' : '⟳' }}
      </button>
    </div>

    <div v-if="canLoad && showCustom" class="mt-2 flex items-stretch gap-2">
      <input
        v-model="customValue"
        class="field font-mono text-[12px]"
        placeholder="MODEL ID — E.G. claude-sonnet-5"
        @keydown.enter.prevent="applyCustom"
        @keydown.esc="showCustom = false"
      />
      <button class="btn shrink-0" @click="applyCustom">SET</button>
    </div>

    <div class="mt-1 flex min-h-[14px] items-center gap-2 font-mono text-[9px] tracking-[0.15em]">
      <span v-if="canLoad && catalog" :class="catalog.source === 'live' ? 'text-moss' : 'text-faint'">
        {{ catalog.source === 'live' ? 'LIVE FROM PROVIDER' : 'CURATED CATALOG' }}
      </span>
      <span v-if="error" class="truncate text-blood">{{ error }}</span>
    </div>
  </div>
</template>
