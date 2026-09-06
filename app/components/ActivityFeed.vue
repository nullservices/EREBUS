<script setup lang="ts">
import type { EventRecord } from '~~/shared/types'

defineProps<{ events: EventRecord[] }>()

function timeOf(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '--:--' : d.toLocaleTimeString('en-GB', { hour12: false })
}
</script>

<template>
  <div>
    <div v-if="events.length === 0">
      <EmptyState message="NO ACTIVITY RECORDED" hint="EVENTS WILL APPEAR AS THE SYSTEM ACTS" />
    </div>
    <div v-else class="divide-y divide-line-soft">
      <NuxtLink
        v-for="ev in events"
        :key="ev.id"
        :to="ev.agentId ? `/agents/${ev.agentId}` : ''"
        class="group flex items-baseline gap-4 px-1 py-2.5 transition-colors"
        :class="ev.agentId ? 'hover:bg-raised/60' : ''"
      >
        <span class="w-16 shrink-0 font-mono text-[11px] tabular-nums text-faint">
          {{ timeOf(ev.createdAt) }}
        </span>
        <span
          class="w-24 shrink-0 truncate font-mono text-[10px] tracking-[0.18em]"
          :class="ev.agentName ? 'text-arcane-dim' : 'text-faint'"
        >
          {{ ev.agentName ?? 'SYSTEM' }}
        </span>
        <span class="min-w-0 flex-1 truncate text-[13px] text-dim group-hover:text-ink">
          {{ ev.summary }}
        </span>
      </NuxtLink>
    </div>
  </div>
</template>
