<script setup lang="ts">
import type { Channel, SystemInfo } from '~~/shared/types'

const { data: info } = await useFetch<SystemInfo>('/api/system/info')
const { data: channels, refresh: refreshChannels } = await useFetch<Channel[]>('/api/channels')

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

// ── Notification channels ────────────────────────────────────────────

const showChannelForm = ref(false)
const editingChannel = ref<Channel | null>(null)
const channelResults = ref<Record<string, { ok: boolean; detail: string }>>({})
const testingChannel = ref<Record<string, boolean>>({})

function openNewChannel() {
  editingChannel.value = null
  showChannelForm.value = true
}

function openEditChannel(channel: Channel) {
  editingChannel.value = channel
  showChannelForm.value = true
}

async function onChannelSaved() {
  showChannelForm.value = false
  editingChannel.value = null
  await refreshChannels()
}

async function toggleChannel(channel: Channel) {
  try {
    await request(`/channels/${channel.id}`, {
      method: 'PATCH',
      body: { enabled: !channel.enabled },
    })
    await refreshChannels()
  } catch (err) {
    window.alert((err as { message: string }).message)
  }
}

async function testChannel(channel: Channel) {
  testingChannel.value = { ...testingChannel.value, [channel.id]: true }
  delete channelResults.value[channel.id]
  try {
    const result = await request<{ ok: boolean; detail: string }>(
      `/channels/${channel.id}/test`,
      { method: 'POST' },
    )
    channelResults.value = { ...channelResults.value, [channel.id]: result }
  } catch (err) {
    channelResults.value = {
      ...channelResults.value,
      [channel.id]: { ok: false, detail: (err as { message: string }).message },
    }
  } finally {
    testingChannel.value = { ...testingChannel.value, [channel.id]: false }
  }
}

async function removeChannel(channel: Channel) {
  if (!window.confirm(`Delete notification channel ${channel.label}?`)) return
  try {
    await request(`/channels/${channel.id}`, { method: 'DELETE' })
    await refreshChannels()
  } catch (err) {
    window.alert((err as { message: string }).message)
  }
}

const EVENT_LABELS: Record<string, string> = {
  error: 'ERRORS',
  completion: 'COMPLETIONS',
  lifecycle: 'LIFECYCLE',
  message: 'MESSAGES',
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
            <span class="text-arcane-dim">npm run dev -- --host 0.0.0.0</span>
            THEN VISIT <span class="text-arcane-dim">http://&lt;DESKTOP-IP&gt;:4521</span>
            FROM OTHER DEVICES ON THE NETWORK. KEEP THIS BOUND TO 127.0.0.1 ON
            UNTRUSTED NETWORKS. EXCLUDE THE DATA DIRECTORY FROM ONEDRIVE SYNC.
          </p>
        </section>

        <section class="panel p-6">
          <div class="mb-4 flex items-center justify-between">
            <h2 class="label">NOTIFICATION CHANNELS</h2>
            <button class="btn btn-primary" @click="openNewChannel">NEW CHANNEL</button>
          </div>

          <p v-if="(channels?.length ?? 0) === 0" class="font-mono text-[10px] leading-relaxed tracking-[0.08em] text-faint">
            NO CHANNELS. ADD A DISCORD WEBHOOK, AN NTFY PUSH TOPIC, OR A GENERIC
            ENDPOINT — EREBUS DELIVERS ERRORS, COMPLETIONS AND LIFECYCLE EVENTS
            TO EVERY ENABLED CHANNEL THAT SUBSCRIBED TO THEM.
          </p>

          <div v-else class="divide-y divide-line-soft">
            <div v-for="channel in channels ?? []" :key="channel.id" class="py-3 first:pt-0 last:pb-0">
              <div class="flex items-center justify-between gap-3">
                <div class="min-w-0">
                  <div class="flex items-baseline gap-2">
                    <span class="truncate text-[13px] text-ink">{{ channel.label }}</span>
                    <span class="font-mono text-[9px] uppercase tracking-[0.15em]" :class="channel.enabled ? 'text-moss' : 'text-faint'">
                      {{ channel.kind }} · {{ channel.enabled ? 'ENABLED' : 'DISABLED' }}
                    </span>
                  </div>
                  <div class="mt-0.5 flex flex-wrap items-center gap-2 font-mono text-[9px] tracking-[0.1em] text-faint">
                    <span v-for="ev in channel.events" :key="ev">{{ EVENT_LABELS[ev] ?? ev.toUpperCase() }}</span>
                    <span v-if="channel.configHint">· {{ channel.configHint }}</span>
                  </div>
                </div>
                <div class="flex shrink-0 gap-1.5">
                  <button class="btn" :disabled="testingChannel[channel.id]" @click="testChannel(channel)">
                    {{ testingChannel[channel.id] ? '…' : 'TEST' }}
                  </button>
                  <button class="btn" @click="toggleChannel(channel)">
                    {{ channel.enabled ? 'DISABLE' : 'ENABLE' }}
                  </button>
                  <button class="btn" @click="openEditChannel(channel)">EDIT</button>
                  <button class="btn btn-danger" @click="removeChannel(channel)">DELETE</button>
                </div>
              </div>
              <div
                v-if="channelResults[channel.id]"
                class="mt-2 font-mono text-[10px] leading-relaxed"
                :class="channelResults[channel.id]?.ok ? 'text-moss' : 'text-blood'"
              >
                {{ channelResults[channel.id]?.ok ? 'DELIVERED' : 'FAILED' }} · {{ channelResults[channel.id]?.detail }}
              </div>
            </div>
          </div>
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

    <Modal
      :open="showChannelForm"
      :title="editingChannel ? 'EDIT CHANNEL' : 'NEW CHANNEL'"
      @close="showChannelForm = false"
    >
      <ChannelForm :channel="editingChannel" @saved="onChannelSaved" @close="showChannelForm = false" />
    </Modal>
  </div>
</template>
