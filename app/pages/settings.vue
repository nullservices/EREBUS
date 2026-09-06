<script setup lang="ts">
import type { SystemInfo } from '~~/shared/types'

const { data: info } = await useFetch<SystemInfo>('/api/system/info')

const { request } = useApi()
const passwordBusy = ref(false)
const passwordError = ref('')
const passwordDone = ref('')
const passwordForm = reactive({ current: '', next: '', confirm: '' })

async function changePassword() {
  passwordError.value = ''
  passwordDone.value = ''
  if (passwordForm.next.length < 8) {
    passwordError.value = 'New password must be at least 8 characters.'
    return
  }
  if (passwordForm.next !== passwordForm.confirm) {
    passwordError.value = 'Passwords do not match.'
    return
  }
  passwordBusy.value = true
  try {
    await request('/auth/password', {
      method: 'POST',
      body: { current: passwordForm.current, next: passwordForm.next },
    })
    passwordDone.value = 'Password updated. Other sessions were signed out.'
    passwordForm.current = ''
    passwordForm.next = ''
    passwordForm.confirm = ''
  } catch (err) {
    passwordError.value = (err as { message: string }).message
  } finally {
    passwordBusy.value = false
  }
}
</script>

<template>
  <div class="h-full overflow-y-auto">
    <div class="mx-auto max-w-2xl px-8 py-10">
      <header class="mb-8">
        <div class="label mb-1">SYSTEM</div>
        <h1 class="text-xl font-light tracking-[0.25em] text-ink">CONFIGURATION</h1>
      </header>

      <div class="space-y-8">
        <section class="panel p-6">
          <h2 class="label mb-4">SERVER</h2>
          <dl class="space-y-2 font-mono text-[11px]">
            <div class="flex justify-between gap-4">
              <dt class="text-faint">VERSION</dt>
              <dd class="text-dim">{{ info?.version ?? '—' }}</dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt class="text-faint">BIND</dt>
              <dd class="text-dim">{{ info?.host ?? '—' }}:{{ info?.port ?? '—' }}</dd>
            </div>
            <div>
              <dt class="mb-0.5 text-faint">DATA DIRECTORY</dt>
              <dd class="break-all text-[10.5px] text-dim">{{ info?.dataDir ?? '—' }}</dd>
            </div>
          </dl>
          <p class="mt-4 border-t border-line-soft pt-4 font-mono text-[10px] leading-relaxed tracking-[0.08em] text-faint">
            LAN ACCESS: START WITH
            <span class="text-ember-dim">npm run dev -- --host 0.0.0.0</span>
            THEN VISIT <span class="text-ember-dim">http://&lt;DESKTOP-IP&gt;:4521</span>
            FROM OTHER DEVICES ON THE NETWORK. KEEP THIS BOUND TO 127.0.0.1 ON
            UNTRUSTED NETWORKS. EXCLUDE THE DATA DIRECTORY FROM ONEDRIVE SYNC.
          </p>
        </section>

        <section class="panel p-6">
          <h2 class="label mb-4">OPERATOR PASSWORD</h2>
          <div class="space-y-3">
            <input
              v-model="passwordForm.current"
              type="password"
              class="field font-mono"
              placeholder="CURRENT PASSWORD"
              autocomplete="current-password"
            />
            <input
              v-model="passwordForm.next"
              type="password"
              class="field font-mono"
              placeholder="NEW PASSWORD (8+ CHARACTERS)"
              autocomplete="new-password"
            />
            <input
              v-model="passwordForm.confirm"
              type="password"
              class="field font-mono"
              placeholder="CONFIRM NEW PASSWORD"
              autocomplete="new-password"
            />
            <div v-if="passwordError" class="font-mono text-[11px] text-blood">{{ passwordError }}</div>
            <div v-if="passwordDone" class="font-mono text-[11px] text-moss">{{ passwordDone }}</div>
            <button class="btn btn-primary" :disabled="passwordBusy" @click="changePassword">
              CHANGE PASSWORD
            </button>
          </div>
        </section>

        <section class="panel p-6">
          <h2 class="label mb-4">APPEARANCE</h2>
          <p class="font-mono text-[10.5px] leading-relaxed tracking-[0.1em] text-dim">
            EREBUS RENDERS IN A SINGLE DARK SCHEME. THEME VARIANTS ARRIVE WITH
            PHASE VIII.
          </p>
        </section>
      </div>
    </div>
  </div>
</template>
