<script setup lang="ts">
const props = defineProps<{ status: string }>()

const STATUS_COLORS: Record<string, string> = {
  OFFLINE: 'bg-faint',
  STARTING: 'bg-dim',
  IDLE: 'bg-dim',
  THINKING: 'bg-arcane',
  WORKING: 'bg-arcane',
  WAITING: 'bg-arcane-dim',
  BLOCKED: 'bg-blood',
  ERROR: 'bg-blood',
  COMPLETED: 'bg-moss',
  STOPPING: 'bg-dim',
}

const active = computed(() => props.status === 'WORKING' || props.status === 'THINKING')
</script>

<template>
  <span class="relative inline-flex h-1.5 w-1.5 shrink-0">
    <span
      v-if="active"
      class="absolute inline-flex h-full w-full animate-ping rounded-full opacity-40"
      :class="STATUS_COLORS[status] ?? 'bg-faint'"
    />
    <span
      class="relative inline-flex h-1.5 w-1.5 rounded-full"
      :class="STATUS_COLORS[status] ?? 'bg-faint'"
    />
  </span>
</template>
