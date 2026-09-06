<script setup lang="ts">
defineProps<{ label: string }>()
</script>

<template>
  <label class="block">
    <span class="label mb-1.5 block">{{ label }}</span>
    <slot />
  </label>
</template>
