<script setup lang="ts">
defineProps<{ message: string; hint?: string }>()
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-2 py-16 text-center">
    <div class="font-mono text-[11px] tracking-[0.3em] text-faint">{{ message }}</div>
    <div v-if="hint" class="font-mono text-[10px] tracking-[0.15em] text-faint/60">{{ hint }}</div>
  </div>
</template>
