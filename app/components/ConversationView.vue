<script setup lang="ts">
import type { Agent, Message } from '~~/shared/types'

const props = defineProps<{ agent: Agent; messages: Message[] }>()

function timeOf(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? '--:--:--'
    : d.toLocaleTimeString('en-GB', { hour12: false })
}

const META_LABELS: Record<string, string> = {
  user: 'OPERATOR',
  agent: props.agent.name,
  system: 'SYSTEM',
  tool: 'TOOL',
  command: 'COMMAND',
  error: 'ERROR',
}

function labelFor(message: Message): string {
  if (message.role === 'agent' && message.senderAgentName) {
    return `${message.senderAgentName} → ${props.agent.name}`
  }
  return META_LABELS[message.role] ?? message.role.toUpperCase()
}

function isMetaRow(message: Message): boolean {
  return message.kind === 'event' || message.role === 'system'
}
</script>

<template>
  <div class="min-h-0 flex-1 overflow-y-auto px-6 py-6">
    <div v-if="messages.length === 0" class="h-full">
      <EmptyState
        :message="`NO TRAFFIC WITH ${agent.name.toUpperCase()}`"
        hint="INSTRUCTIONS SENT TO THIS ENTITY WILL BE RECORDED HERE"
      />
    </div>

    <div v-else class="mx-auto max-w-3xl space-y-5">
      <div v-for="message in messages" :key="message.id">
        <!-- system / event rows: centered, faint -->
        <div v-if="isMetaRow(message)" class="py-1 text-center font-mono text-[10px] tracking-[0.2em] text-faint">
          ◆ {{ message.content }}
        </div>

        <!-- tool rows: framed mono block -->
        <div v-else-if="message.role === 'tool'" class="border border-line bg-abyss">
          <div class="flex items-center justify-between border-b border-line px-3 py-1.5">
            <span class="font-mono text-[10px] tracking-[0.2em] text-arcane-dim">
              TOOL · {{ message.content }}
            </span>
            <span class="font-mono text-[10px] tabular-nums text-faint">{{ timeOf(message.createdAt) }}</span>
          </div>
          <pre v-if="message.meta" class="overflow-x-auto px-3 py-2 font-mono text-[11px] leading-relaxed text-dim">{{ JSON.stringify(message.meta, null, 2) }}</pre>
        </div>

        <!-- command rows: mono block -->
        <div v-else-if="message.role === 'command'" class="border border-line bg-abyss px-3 py-2">
          <div class="mb-1 flex items-center justify-between">
            <span class="font-mono text-[10px] tracking-[0.2em] text-faint">COMMAND</span>
            <span class="font-mono text-[10px] tabular-nums text-faint">{{ timeOf(message.createdAt) }}</span>
          </div>
          <pre class="overflow-x-auto font-mono text-[12px] text-ink">$ {{ message.content }}</pre>
        </div>

        <!-- error rows -->
        <div v-else-if="message.role === 'error'" class="border-l-2 border-blood py-1 pl-4">
          <div class="mb-0.5 flex items-baseline justify-between">
            <span class="font-mono text-[10px] tracking-[0.2em] text-blood">ERROR</span>
            <span class="font-mono text-[10px] tabular-nums text-faint">{{ timeOf(message.createdAt) }}</span>
          </div>
          <div class="whitespace-pre-wrap text-[13px] text-dim">{{ message.content }}</div>
        </div>

        <!-- operator / entity text rows -->
        <div v-else>
          <div class="mb-1 flex items-baseline justify-between">
            <span
              class="font-mono text-[10px] tracking-[0.22em]"
              :class="message.role === 'user' ? 'text-arcane-dim' : 'text-dim'"
            >
              {{ labelFor(message) }}
            </span>
            <span class="font-mono text-[10px] tabular-nums text-faint">{{ timeOf(message.createdAt) }}</span>
          </div>
          <div class="whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink">
            {{ message.content }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
