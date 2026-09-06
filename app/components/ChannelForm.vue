<script setup lang="ts">
import type { Channel } from '~~/shared/types'

const props = defineProps<{ channel?: Channel | null }>()
const emit = defineEmits<{ saved: []; close: [] }>()

const { request } = useApi()
const busy = ref(false)
const error = ref('')

const KINDS = [
  { id: 'discord', label: 'DISCORD' },
  { id: 'ntfy', label: 'NTFY' },
  { id: 'generic', label: 'GENERIC' },
] as const

const EVENT_OPTIONS = [
  { id: 'error', label: 'ERRORS' },
  { id: 'completion', label: 'COMPLETIONS' },
  { id: 'lifecycle', label: 'LIFECYCLE' },
  { id: 'message', label: 'MESSAGES' },
] as const

const form = reactive({
  kind: (props.channel?.kind ?? 'discord') as Channel['kind'],
  label: props.channel?.label ?? '',
  enabled: props.channel?.enabled ?? true,
  events: [...(props.channel?.events ?? ['error', 'completion', 'lifecycle'])],
  url: '',
  topic: '',
  server: '',
})

const KIND_NOTES: Record<string, string> = {
  discord:
    'CREATE A WEBHOOK IN YOUR DISCORD SERVER (CHANNEL SETTINGS → INTEGRATIONS). THE URL IS THE SECRET — IT IS STORED ENCRYPTED HERE.',
  ntfy: 'PUSH NOTIFICATIONS TO YOUR PHONE. INSTALL THE NTFY APP AND SUBSCRIBE TO THE SAME TOPIC. SERVER DEFAULTS TO NTFY.SH.',
  generic: 'ANY HTTP ENDPOINT RECEIVING JSON — SLACK INCOMING WEBHOOKS, TELEGRAM BOT BRIDGES, CUSTOM BRIDGES.',
}

function toggleEvent(id: string) {
  if (form.events.includes(id)) {
    form.events = form.events.filter((e) => e !== id)
  } else {
    form.events = [...form.events, id]
  }
}

async function submit() {
  if (!form.label.trim()) {
    error.value = 'A label is required.'
    return
  }
  if (form.events.length === 0) {
    error.value = 'Select at least one event category.'
    return
  }
  busy.value = true
  error.value = ''
  try {
    const config =
      form.kind === 'ntfy'
        ? { topic: form.topic, server: form.server }
        : { url: form.url }
    await request(props.channel ? `/channels/${props.channel.id}` : '/channels', {
      method: props.channel ? 'PATCH' : 'POST',
      body: {
        kind: form.kind,
        label: form.label,
        enabled: form.enabled,
        events: form.events,
        ...(props.channel && props.channel.kind !== form.kind ? {} : { config }),
      },
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
    <div class="grid grid-cols-2 gap-4">
      <FieldBlock label="KIND">
        <select v-model="form.kind" class="field font-mono" :disabled="Boolean(channel)">
          <option v-for="k in KINDS" :key="k.id" :value="k.id">{{ k.label }}</option>
        </select>
      </FieldBlock>
      <FieldBlock label="LABEL">
        <input v-model="form.label" class="field" maxlength="64" placeholder="e.g. COMMAND ROOM" />
      </FieldBlock>
    </div>

    <div class="border border-line bg-abyss px-3 py-2.5 font-mono text-[9.5px] leading-relaxed tracking-[0.08em] text-faint">
      {{ KIND_NOTES[form.kind] }}
    </div>

    <template v-if="form.kind === 'discord' || form.kind === 'generic'">
      <FieldBlock :label="form.kind === 'discord' ? 'WEBHOOK URL' : 'ENDPOINT URL'">
        <input
          v-model="form.url"
          class="field font-mono text-[12px]"
          placeholder="https://…"
          autocomplete="off"
        />
      </FieldBlock>
    </template>
    <template v-else>
      <div class="grid grid-cols-2 gap-4">
        <FieldBlock label="TOPIC">
          <input v-model="form.topic" class="field font-mono" placeholder="my-erebus" />
        </FieldBlock>
        <FieldBlock label="SERVER (OPTIONAL)">
          <input v-model="form.server" class="field font-mono text-[12px]" placeholder="https://ntfy.sh" />
        </FieldBlock>
      </div>
    </template>

    <div>
      <span class="label mb-2 block">EVENT CATEGORIES</span>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="ev in EVENT_OPTIONS"
          :key="ev.id"
          class="btn"
          :class="form.events.includes(ev.id) ? 'btn-primary' : ''"
          @click="toggleEvent(ev.id)"
        >
          {{ ev.label }}
        </button>
      </div>
    </div>

    <label class="flex cursor-pointer items-center gap-2.5 font-mono text-[11px] tracking-[0.12em] text-dim">
      <input v-model="form.enabled" type="checkbox" class="accent-[var(--color-arcane)]" />
      ENABLED
    </label>

    <div v-if="error" class="font-mono text-[11px] text-blood">{{ error }}</div>

    <div class="flex justify-end gap-3 border-t border-line pt-4">
      <button class="btn" @click="emit('close')">CANCEL</button>
      <button class="btn btn-primary" :disabled="busy" @click="submit">
        {{ channel ? 'SAVE CHANGES' : 'ADD CHANNEL' }}
      </button>
    </div>
  </div>
</template>
