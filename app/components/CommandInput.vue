<script setup lang="ts">
const props = defineProps<{ agentId: string; agentStatus: string }>()
const emit = defineEmits<{ sent: [] }>()

const { request } = useApi()
const text = ref('')
const busy = ref(false)
const error = ref('')

async function send() {
  const content = text.value.trim()
  if (!content || busy.value) return
  busy.value = true
  error.value = ''
  try {
    await request(`/agents/${props.agentId}/messages`, {
      method: 'POST',
      body: { content },
    })
    text.value = ''
    emit('sent')
  } catch (err) {
    error.value = (err as { message: string }).message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="shrink-0 border-t border-line bg-surface px-4 py-3">
    <div v-if="error" class="mb-2 font-mono text-[11px] text-blood">{{ error }}</div>
    <div class="flex items-center gap-3">
      <span class="select-none font-mono text-arcane">❯</span>
      <textarea
        v-model="text"
        rows="1"
        class="max-h-32 min-w-0 flex-1 resize-none bg-transparent py-1 text-[13.5px] text-ink outline-none placeholder:text-faint"
        placeholder="Send instruction..."
        @keydown.enter.exact.prevent="send"
      />
      <button class="btn btn-primary" :disabled="busy || !text.trim()" @click="send">
        SEND
      </button>
    </div>
    <div class="mt-1.5 flex items-center gap-2 pl-6">
      <StatusDot :status="agentStatus" />
      <span class="font-mono text-[9.5px] tracking-[0.18em] text-faint">
        {{
          agentStatus === 'OFFLINE'
            ? 'OFFLINE — START THE RUNTIME TO EXECUTE INSTRUCTIONS'
            : agentStatus === 'IDLE'
              ? 'IDLE — READY FOR INSTRUCTIONS'
              : `${agentStatus} — INSTRUCTIONS ARE QUEUED`
        }}
      </span>
    </div>
  </div>
</template>
