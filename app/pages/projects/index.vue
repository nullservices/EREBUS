<script setup lang="ts">
import type { Project } from '~~/shared/types'

const { data: projects, refresh } = await useFetch<Project[]>('/api/projects')

const showForm = ref(false)
const editing = ref<Project | null>(null)

function openNew() {
  editing.value = null
  showForm.value = true
}

function openEdit(project: Project) {
  editing.value = project
  showForm.value = true
}

async function onSaved() {
  showForm.value = false
  editing.value = null
  await refresh()
}

async function remove(project: Project) {
  if (!window.confirm(`Delete project ${project.name}? Its entities keep existing, unassigned.`)) {
    return
  }
  try {
    const { request } = useApi()
    await request(`/projects/${project.id}`, { method: 'DELETE' })
    await refresh()
  } catch (err) {
    window.alert((err as { message: string }).message)
  }
}
</script>

<template>
  <div class="h-full overflow-y-auto">
    <div class="mx-auto max-w-4xl px-8 py-10">
      <header class="mb-8 flex items-end justify-between">
        <div>
          <div class="label mb-1">PROJECTS</div>
          <h1 class="text-xl font-light tracking-[0.25em] text-ink">
            {{ projects?.length ?? 0 }} REGISTERED
          </h1>
        </div>
        <button class="btn btn-primary" @click="openNew">NEW PROJECT</button>
      </header>

      <div v-if="(projects?.length ?? 0) === 0">
        <EmptyState message="NO PROJECTS" hint="A PROJECT BINDS ENTITIES TO A DIRECTORY AND A REPOSITORY" />
      </div>

      <div v-else class="grid gap-4 md:grid-cols-2">
        <div v-for="p in projects" :key="p.id" class="panel p-5">
          <div class="flex items-baseline justify-between">
            <h2 class="text-[15px] tracking-[0.1em] text-ink">{{ p.name }}</h2>
            <span class="font-mono text-[10px] text-faint">{{ p.agentCount ?? 0 }} ENTITIES</span>
          </div>
          <p v-if="p.description" class="mt-2 text-[12.5px] leading-relaxed text-dim">
            {{ p.description }}
          </p>
          <div v-if="p.rootDir" class="mt-3 truncate border-t border-line-soft pt-3 font-mono text-[10.5px] text-faint">
            {{ p.rootDir }}
          </div>
          <div class="mt-4 flex gap-2">
            <button class="btn" @click="openEdit(p)">EDIT</button>
            <button class="btn btn-danger" @click="remove(p)">DELETE</button>
          </div>
        </div>
      </div>
    </div>

    <Modal :open="showForm" :title="editing ? 'EDIT PROJECT' : 'NEW PROJECT'" @close="showForm = false">
      <ProjectForm :project="editing" @saved="onSaved" @close="showForm = false" />
    </Modal>
  </div>
</template>
