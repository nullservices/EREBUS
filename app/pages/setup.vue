<script setup lang="ts">
definePageMeta({ layout: 'auth' })

const { request } = useApi()
const busy = ref(false)
const error = ref('')

const form = reactive({
  username: '',
  password: '',
  confirm: '',
  projectName: '',
  projectDir: '',
  providerKind: '' as '' | 'claude' | 'deepseek',
  providerKey: '',
})

onMounted(async () => {
  try {
    const status = await request<{ firstRun: boolean }>('/status')
    if (!status.firstRun) await navigateTo('/login', { replace: true })
  } catch {
    // Server unreachable — stay on this page; the error will surface on submit.
  }
})

async function initialize() {
  if (form.username.trim().length < 3) {
    error.value = 'Operator name must be at least 3 characters.'
    return
  }
  if (form.password.length < 8) {
    error.value = 'Password must be at least 8 characters.'
    return
  }
  if (form.password !== form.confirm) {
    error.value = 'Passwords do not match.'
    return
  }
  busy.value = true
  error.value = ''
  try {
    await request('/auth/setup', {
      method: 'POST',
      body: {
        username: form.username,
        password: form.password,
        projectName: form.projectName,
        projectDir: form.projectDir,
        ...(form.providerKind ? { provider: { kind: form.providerKind, apiKey: form.providerKey } } : {}),
      },
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
  <div class="w-full max-w-md">
    <div class="mb-10 text-center">
      <h1 class="text-2xl font-light tracking-[0.5em] text-ink">E R E B U S</h1>
      <p class="mt-3 font-mono text-[10px] tracking-[0.3em] text-faint">INITIALIZATION</p>
    </div>

    <div class="border border-line bg-surface">
      <div class="border-b border-line px-6 py-5">
        <p class="font-mono text-[10.5px] leading-relaxed tracking-[0.1em] text-dim">
          FIRST ACTIVATION DETECTED. ESTABLISH THE OPERATOR ACCOUNT TO BRING THE
          SYSTEM ONLINE.
        </p>
      </div>

      <div class="space-y-6 px-6 py-6">
        <section class="space-y-3">
          <h2 class="label">OPERATOR ACCOUNT</h2>
          <input v-model="form.username" class="field font-mono" placeholder="OPERATOR NAME" autocomplete="username" />
          <input v-model="form.password" type="password" class="field font-mono" placeholder="PASSWORD (8+ CHARACTERS)" autocomplete="new-password" />
          <input v-model="form.confirm" type="password" class="field font-mono" placeholder="CONFIRM PASSWORD" autocomplete="new-password" />
        </section>

        <section class="space-y-3">
          <h2 class="label">FIRST PROJECT <span class="text-faint/50">(OPTIONAL)</span></h2>
          <input v-model="form.projectName" class="field" placeholder="PROJECT NAME" />
          <input v-model="form.projectDir" class="field font-mono text-[12px]" placeholder="ROOT DIRECTORY — C:\Projects\..." />
        </section>

        <section class="space-y-3">
          <h2 class="label">AI PROVIDER <span class="text-faint/50">(OPTIONAL — CONFIGURABLE LATER)</span></h2>
          <select v-model="form.providerKind" class="field font-mono">
            <option value="">— NONE FOR NOW —</option>
            <option value="claude">CLAUDE</option>
            <option value="deepseek">DEEPSEEK</option>
          </select>
          <input
            v-if="form.providerKind"
            v-model="form.providerKey"
            type="password"
            class="field font-mono"
            placeholder="API KEY — STORED ENCRYPTED ON THIS MACHINE"
            autocomplete="off"
          />
        </section>

        <div v-if="error" class="font-mono text-[11px] leading-relaxed text-blood">{{ error }}</div>

        <button class="btn btn-primary w-full" :disabled="busy" @click="initialize">
          INITIALIZE EREBUS
        </button>
      </div>
    </div>

    <p class="mt-6 text-center font-mono text-[9.5px] tracking-[0.25em] text-faint/60">
      LOCAL COMMAND PLATFORM · v0.1.0
    </p>
  </div>
</template>
