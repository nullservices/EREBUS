<script setup lang="ts">
defineProps<{ open: boolean; title: string }>()
const emit = defineEmits<{ close: [] }>()

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center"
      @keydown="onKeydown"
    >
      <div class="absolute inset-0 bg-black/70" @click="emit('close')" />
      <div
        class="relative max-h-[85vh] w-full max-w-xl overflow-y-auto border border-line bg-surface shadow-[0_0_80px_rgba(0,0,0,0.7)]"
      >
        <div class="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface px-5 py-3">
          <h2 class="label">{{ title }}</h2>
          <button
            class="cursor-pointer font-mono text-sm text-faint transition-colors hover:text-ink"
            @click="emit('close')"
          >
            ✕
          </button>
        </div>
        <div class="px-5 py-4">
          <slot />
        </div>
      </div>
    </div>
  </Teleport>
</template>
