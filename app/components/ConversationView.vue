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

// Collapsible tool/command rows — compact by default like a dev console.
const expanded = reactive(new Set<string>())

function toggleExpanded(id: string) {
  if (expanded.has(id)) {
    expanded.delete(id)
  } else {
    expanded.add(id)
  }
}

function compactArgs(meta: Record<string, unknown> | null): string {
  const raw = typeof meta?.args === 'string' ? meta.args : null
  if (!raw) return ''
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>
    const parts = Object.entries(obj).map(
      ([key, value]) => `${key}: ${typeof value === 'string' ? JSON.stringify(value) : String(value)}`,
    )
    const joined = parts.join(' · ')
    return joined.length > 90 ? `${joined.slice(0, 90)}…` : joined
  } catch {
    return raw.length > 90 ? `${raw.slice(0, 90)}…` : raw
  }
}

function prettyMeta(meta: Record<string, unknown>): string {
  const raw = typeof meta?.args === 'string' ? meta.args : null
  if (!raw) return JSON.stringify(meta, null, 2)
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

function compactLine(line: string): string {
  const oneLine = line.replace(/\s+/g, ' ').trim()
  return oneLine.length > 120 ? `${oneLine.slice(0, 120)}…` : oneLine
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

        <!-- tool rows: one compact line, expandable -->
        <div v-else-if="message.role === 'tool'" class="border border-line bg-abyss">
          <button
            class="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-raised/60"
            @click="toggleExpanded(message.id)"
          >
            <span class="shrink-0 font-mono text-[10px] text-arcane-dim">
              {{ expanded.has(message.id) ? '▾' : '▸' }}
            </span>
            <span class="shrink-0 font-mono text-[10px] tracking-[0.12em] text-dim">
              {{ message.content }}
            </span>
            <span class="min-w-0 flex-1 truncate font-mono text-[10px] text-faint">
              {{ compactArgs(message.meta) }}
            </span>
            <span class="shrink-0 font-mono text-[9px] tabular-nums text-faint">
              {{ timeOf(message.createdAt) }}
            </span>
          </button>
          <pre
            v-if="expanded.has(message.id) && message.meta"
            class="overflow-x-auto border-t border-line px-3 py-2 font-mono text-[11px] leading-relaxed text-dim"
          >{{ prettyMeta(message.meta) }}</pre>
        </div>

        <!-- command/output rows: one compact line, expandable -->
        <div v-else-if="message.role === 'command'" class="border border-line bg-abyss">
          <button
            class="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-raised/60"
            @click="toggleExpanded(message.id)"
          >
            <span class="shrink-0 font-mono text-[10px] text-faint">
              {{ expanded.has(message.id) ? '▾' : '▸' }}
            </span>
            <span class="shrink-0 font-mono text-[10px] tracking-[0.12em] text-faint">
              {{ message.kind === 'command_output' ? 'OUTPUT' : 'COMMAND' }}
            </span>
            <span class="min-w-0 flex-1 truncate font-mono text-[10px] text-dim">
              {{ compactLine(message.content) }}
            </span>
            <span class="shrink-0 font-mono text-[9px] tabular-nums text-faint">
              {{ timeOf(message.createdAt) }}
            </span>
          </button>
          <pre
            v-if="expanded.has(message.id)"
            class="overflow-x-auto border-t border-line px-3 py-2 font-mono text-[11px] leading-relaxed text-dim"
          >{{ message.content }}</pre>
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
