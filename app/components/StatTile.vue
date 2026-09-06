<script setup lang="ts">
defineProps<{ label: string; value: number | string; sub?: string }>()
</script>

<template>
  <div class="panel px-5 py-4">
    <div class="label mb-2">{{ label }}</div>
    <div class="text-3xl font-light tabular-nums tracking-wide text-ink">{{ value }}</div>
    <div v-if="sub" class="mt-1 font-mono text-[10px] tracking-[0.15em] text-faint">{{ sub }}</div>
  </div>
</template>
