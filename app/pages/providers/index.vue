<script setup lang="ts">
import type { Provider } from '~~/shared/types'

const { data: providers, refresh } = await useFetch<Provider[]>('/api/providers')

const showForm = ref(false)
const editing = ref<Provider | null>(null)

// Real connection test results per provider id: { ok, detail } or null.
const testResults = ref<Record<string, { ok: boolean; detail: string }>>({})
const testing = ref<Record<string, boolean>>({})

function openNew() {
  editing.value = null
  showForm.value = true
}

function openEdit(provider: Provider) {
  editing.value = provider
  showForm.value = true
}

async function onSaved() {
  showForm.value = false
  editing.value = null
  await refresh()
}

async function testConnection(provider: Provider) {
  testing.value = { ...testing.value, [provider.id]: true }
  delete testResults.value[provider.id]
  try {
    const { request } = useApi()
    const result = await request<{ ok: boolean; detail: string }>(
      `/providers/${provider.id}/test`,
      { method: 'POST' },
    )
    testResults.value = { ...testResults.value, [provider.id]: result }
  } catch (err) {
    testResults.value = {
      ...testResults.value,
      [provider.id]: { ok: false, detail: (err as { message: string }).message },
    }
  } finally {
    testing.value = { ...testing.value, [provider.id]: false }
  }
}

async function remove(provider: Provider) {
  if (!window.confirm(`Delete provider ${provider.label}? Entities using it lose their assignment.`)) {
    return
  }
  try {
    const { request } = useApi()
    await request(`/providers/${provider.id}`, { method: 'DELETE' })
    await refresh()
  } catch (err) {
    window.alert((err as { message: string }).message)
  }
}
</script>

<template>
  <div class="h-full overflow-y-auto">
    <div class="mx-auto max-w-4xl px-8 py-10">
      <header class="mb-8 flex items-end justify-between">
        <div>
          <div class="label mb-1">PROVIDERS</div>
          <h1 class="text-xl font-light tracking-[0.25em] text-ink">
            {{ providers?.length ?? 0 }} REGISTERED
          </h1>
        </div>
        <button class="btn btn-primary" @click="openNew">ADD PROVIDER</button>
      </header>

      <div class="grid gap-4 md:grid-cols-2">
        <div v-for="p in providers ?? []" :key="p.id" class="panel p-5">
          <div class="flex items-center justify-between">
            <h2 class="text-[15px] tracking-[0.1em] text-ink">{{ p.label }}</h2>
            <span class="flex items-center gap-2 font-mono text-[9.5px] tracking-[0.18em]">
              <StatusDot :status="p.configured ? 'COMPLETED' : 'OFFLINE'" />
              <span :class="p.configured ? 'text-moss' : 'text-faint'">
                {{ p.configured ? 'CONFIGURED' : 'NOT CONFIGURED' }}
              </span>
            </span>
          </div>

          <dl class="mt-4 space-y-1.5 border-t border-line-soft pt-4 font-mono text-[10.5px]">
            <div class="flex justify-between gap-3">
              <dt class="text-faint">KIND</dt>
              <dd class="uppercase text-dim">{{ p.kind }}</dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-faint">MODEL</dt>
              <dd class="truncate text-dim">{{ p.model || '—' }}</dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-faint">TEMP / MAX TOKENS</dt>
              <dd class="text-dim">{{ p.temperature }} / {{ p.maxTokens }}</dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-faint">KEY</dt>
              <dd class="text-dim">{{ p.apiKeyHint ?? '—' }}</dd>
            </div>
            <div>
              <dt class="mb-0.5 text-faint">BASE URL</dt>
              <dd class="truncate text-[10px] text-dim/80">{{ p.baseUrl }}</dd>
            </div>
          </dl>

          <div
            v-if="testResults[p.id]"
            class="mt-3 border-t border-line-soft pt-3 font-mono text-[10px] leading-relaxed"
            :class="testResults[p.id]?.ok ? 'text-moss' : 'text-blood'"
          >
            {{ testResults[p.id]?.ok ? 'CONNECTION OK' : 'CONNECTION FAILED' }} · {{ testResults[p.id]?.detail }}
          </div>

          <div class="mt-4 flex gap-2">
            <button class="btn" :disabled="testing[p.id]" @click="testConnection(p)">
              {{ testing[p.id] ? 'TESTING…' : 'TEST' }}
            </button>
            <button class="btn" @click="openEdit(p)">CONFIGURE</button>
            <button class="btn btn-danger" @click="remove(p)">DELETE</button>
          </div>
        </div>
      </div>

      <p class="mt-8 max-w-xl font-mono text-[10px] leading-relaxed tracking-[0.1em] text-faint/70">
        API KEYS ARE STORED ENCRYPTED ON THIS MACHINE AND NEVER REACH THE BROWSER.
        TEST PERFORMS A REAL REQUEST AGAINST THE PROVIDER (OR CHECKS THE CLAUDE CLI).
      </p>
    </div>

    <Modal :open="showForm" :title="editing ? 'CONFIGURE PROVIDER' : 'ADD PROVIDER'" @close="showForm = false">
      <ProviderForm :provider="editing" @saved="onSaved" @close="showForm = false" />
    </Modal>
  </div>
</template>
