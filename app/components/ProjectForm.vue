<script setup lang="ts">
import type { Project } from '~~/shared/types'

const props = defineProps<{ project?: Project | null }>()
const emit = defineEmits<{ saved: []; close: [] }>()

const { request } = useApi()
const busy = ref(false)
const error = ref('')

const form = reactive({
  name: props.project?.name ?? '',
  description: props.project?.description ?? '',
  rootDir: props.project?.rootDir ?? '',
})

async function submit() {
  if (!form.name.trim()) {
    error.value = 'A name is required.'
    return
  }
  busy.value = true
  error.value = ''
  try {
    await request(props.project ? `/projects/${props.project.id}` : '/projects', {
      method: props.project ? 'PATCH' : 'POST',
      body: { ...form },
    })
    emit('saved')
  } catch (err) {
    error.value = (err as { message: string }).message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <FieldBlock label="NAME">
      <input v-model="form.name" class="field" maxlength="64" />
    </FieldBlock>
    <FieldBlock label="DESCRIPTION">
      <textarea v-model="form.description" rows="3" class="field resize-y" />
    </FieldBlock>
    <FieldBlock label="ROOT DIRECTORY">
      <input
        v-model="form.rootDir"
        class="field font-mono text-[12px]"
        placeholder="C:\Projects\..."
      />
    </FieldBlock>

    <div v-if="error" class="font-mono text-[11px] text-blood">{{ error }}</div>

    <div class="flex justify-end gap-3 border-t border-line pt-4">
      <button class="btn" @click="emit('close')">CANCEL</button>
      <button class="btn btn-primary" :disabled="busy" @click="submit">
        {{ project ? 'SAVE CHANGES' : 'CREATE PROJECT' }}
      </button>
    </div>
  </div>
</template>
