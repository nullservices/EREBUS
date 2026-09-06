<script setup lang="ts">
/**
 * Unobtrusive toast center fed by the realtime socket.
 * Errors, human-input requests and completions surface here — nothing else.
 */

interface Toast {
  id: number
  severity: 'error' | 'attention' | 'success'
  title: string
  body: string
  agentId?: string
}

const { lastPayload } = useRealtime()
const router = useRouter()

const toasts = ref<Toast[]>([])
let nextId = 1

function push(severity: Toast['severity'], title: string, body: string, agentId?: string) {
  const id = nextId++
  toasts.value.push({ id, severity, title, body, agentId })
  setTimeout(() => dismiss(id), 9000)
}

function dismiss(id: number) {
  toasts.value = toasts.value.filter((t) => t.id !== id)
}

function open(toast: Toast) {
  dismiss(toast.id)
  if (toast.agentId) void router.push(`/agents/${toast.agentId}`)
}

watch(lastPayload, (payload) => {
  if (!payload || payload.kind !== 'event' || !payload.event) return
  const event = payload.event
  if (event.type === 'agent.error') {
    push('error', 'ENTITY FAILURE', event.summary, event.agentId ?? undefined)
  } else if (event.type === 'intervention.created') {
    push('attention', 'HUMAN INPUT REQUIRED', event.summary, event.agentId ?? undefined)
  } else if (event.type === 'agent.completed') {
    push('success', 'TASK COMPLETE', event.summary, event.agentId ?? undefined)
  }
})

const SEVERITY_STYLE: Record<Toast['severity'], string> = {
  error: 'border-blood/60',
  attention: 'border-arcane/60',
  success: 'border-moss/50',
}
const SEVERITY_LABEL: Record<Toast['severity'], string> = {
  error: 'text-blood',
  attention: 'text-arcane',
  success: 'text-moss',
}
</script>

<template>
  <Teleport to="body">
    <div class="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-[340px] flex-col gap-2">
      <TransitionGroup name="toast">
        <button
          v-for="toast in toasts"
          :key="toast.id"
          class="pointer-events-auto w-full cursor-pointer border bg-surface p-3 text-left shadow-[4px_4px_0_rgba(0,0,0,0.55)]"
          :class="SEVERITY_STYLE[toast.severity]"
          @click="open(toast)"
        >
          <div class="flex items-baseline justify-between gap-3">
            <span class="font-mono text-[9px] tracking-[0.2em]" :class="SEVERITY_LABEL[toast.severity]">
              {{ toast.title }}
            </span>
            <span class="font-mono text-[9px] text-faint" @click.stop="dismiss(toast.id)">✕</span>
          </div>
          <div class="mt-1 truncate text-[12px] leading-snug text-ink">{{ toast.body }}</div>
        </button>
      </TransitionGroup>
    </div>
  </Teleport>
</template>
