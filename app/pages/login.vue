<script setup lang="ts">
definePageMeta({ layout: 'auth' })

const { request } = useApi()
const username = ref('')
const password = ref('')
const busy = ref(false)
const error = ref('')

onMounted(async () => {
  try {
    const status = await request<{ firstRun: boolean }>('/status')
    if (status.firstRun) await navigateTo('/setup', { replace: true })
  } catch {
    // Server unreachable — stay on this page; the error will surface on submit.
  }
})

async function submit() {
  if (!username.value.trim() || !password.value) {
    error.value = 'Enter the operator credentials.'
    return
  }
  busy.value = true
  error.value = ''
  try {
    await request('/auth/login', {
      method: 'POST',
      body: { username: username.value, password: password.value },
    })
    await navigateTo('/')
  } catch (err) {
    error.value = (err as { message: string }).message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="w-full max-w-sm">
    <div class="mb-10 text-center">
      <h1 class="text-2xl font-light tracking-[0.5em] text-ink">E R E B U S</h1>
      <p class="mt-3 font-mono text-[10px] tracking-[0.3em] text-faint">OPERATOR ACCESS</p>
    </div>

    <div class="border border-line bg-surface">
      <div class="space-y-4 px-6 py-6">
        <input
          v-model="username"
          class="field font-mono"
          placeholder="OPERATOR"
          autocomplete="username"
          @keydown.enter="submit"
        />
        <input
          v-model="password"
          type="password"
          class="field font-mono"
          placeholder="PASSWORD"
          autocomplete="current-password"
          @keydown.enter="submit"
        />
        <div v-if="error" class="font-mono text-[11px] leading-relaxed text-blood">{{ error }}</div>
        <button class="btn btn-primary w-full" :disabled="busy" @click="submit">
          ENTER SYSTEM
        </button>
      </div>
    </div>

    <p class="mt-6 text-center font-mono text-[9.5px] tracking-[0.25em] text-faint/60">
      LOCAL COMMAND PLATFORM · v0.1.0
    </p>
  </div>
</template>
