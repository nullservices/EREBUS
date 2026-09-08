<script setup lang="ts">
import type { Agent, Project, Provider } from '~~/shared/types'

const { data: agents, refresh } = await useFetch<Agent[]>('/api/agents')
const { data: projects } = await useFetch<Project[]>('/api/projects')
const { data: providers } = await useFetch<Provider[]>('/api/providers')

const showNew = ref(false)

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

async function onSaved() {
  showNew.value = false
  await refresh()
}
</script>

<template>
  <div class="h-full overflow-y-auto">
    <div class="mx-auto max-w-4xl px-8 py-10">
      <header class="mb-8 flex items-end justify-between">
        <div>
          <div class="label mb-1">ENTITIES</div>
          <h1 class="text-xl font-light tracking-[0.25em] text-ink">
            {{ agents?.length ?? 0 }} REGISTERED
          </h1>
        </div>
        <button class="btn btn-primary" @click="showNew = true">NEW ENTITY</button>
      </header>

      <div v-if="(agents?.length ?? 0) === 0">
        <EmptyState message="NO ENTITIES" hint="CREATE THE FIRST ONE — ARCHON IS THE TRADITIONAL START" />
      </div>

      <div v-else class="entity-grid">
        <NuxtLink
          v-for="agent in agents"
          :key="agent.id"
          :to="`/agents/${agent.id}`"
          class="entity-card transition-colors"
        >
          <BrandSigil />
          <StatusDot :status="agent.status" />
          <div class="w-36 min-w-0">
            <div class="truncate text-[13.5px] text-ink">{{ agent.name }}</div>
            <div class="truncate font-mono text-[9px] uppercase tracking-[0.2em] text-faint">
              {{ agent.role || 'UNASSIGNED' }}
            </div>
          </div>
          <div class="hidden w-28 truncate font-mono text-[10.5px] text-dim md:block">
            {{ agent.providerLabel ?? 'NO PROVIDER' }}
          </div>
          <div class="hidden w-32 truncate font-mono text-[10.5px] text-dim md:block">
            {{ agent.projectName ?? 'NO PROJECT' }}
          </div>
          <div v-if="agent.parentName" class="hidden font-mono text-[10px] text-faint lg:block">
            ↳ {{ agent.parentName }}
          </div>
          <div class="ml-auto flex items-center gap-3">
            <span class="font-mono text-[10px] uppercase tracking-[0.15em] text-faint">
              {{ agent.status }}
            </span>
            <span class="font-mono text-[10px] tabular-nums text-faint/70">{{ fmtDate(agent.updatedAt) }}</span>
          </div>
        </NuxtLink>
      </div>
    </div>

    <Modal :open="showNew" title="NEW ENTITY" @close="showNew = false">
      <EntityForm
        :providers="providers ?? []"
        :projects="projects ?? []"
        :agents="agents ?? []"
        @saved="onSaved"
        @close="showNew = false"
      />
    </Modal>
  </div>
</template>
