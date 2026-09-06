<script setup lang="ts">
import type { DashboardStats, Project } from '~~/shared/types'

const { data: stats } = await useFetch<DashboardStats>('/api/dashboard')
const { data: projects } = await useFetch<Project[]>('/api/projects')

const working = computed(
  () => (stats.value?.agents.byStatus.WORKING ?? 0) + (stats.value?.agents.byStatus.THINKING ?? 0),
)
const waiting = computed(
  () =>
    (stats.value?.agents.byStatus.WAITING ?? 0) +
    (stats.value?.agents.byStatus.BLOCKED ?? 0),
)

const today = new Date().toLocaleDateString('en-GB', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
})
</script>

<template>
  <div class="h-full overflow-y-auto">
    <div class="mx-auto max-w-5xl px-8 py-10">
      <header class="mb-10">
        <div class="label mb-2">SYSTEM</div>
        <h1 class="text-3xl font-light tracking-[0.25em] text-ink">E R E B U S</h1>
        <div class="mt-2 font-mono text-[10.5px] tracking-[0.2em] text-faint">
          {{ today.toUpperCase() }} · LOCAL AUTONOMOUS OPERATIONS
        </div>
      </header>

      <div class="mb-10 grid grid-cols-2 gap-4 md:grid-cols-5">
        <StatTile label="ENTITIES" :value="stats?.agents.total ?? 0" :sub="`${stats?.agents.online ?? 0} ONLINE`" />
        <StatTile label="WORKING" :value="working" sub="ACTIVE RUNTIMES" />
        <StatTile label="WAITING" :value="waiting" sub="OR BLOCKED" />
        <StatTile label="PROJECTS" :value="stats?.projects ?? 0" sub="REGISTERED" />
        <StatTile label="TASKS" value="—" sub="PHASE IV" />
      </div>

      <div class="grid gap-8 lg:grid-cols-[1fr_320px]">
        <section>
          <div class="label mb-3">RECENT ACTIVITY</div>
          <ActivityFeed :events="stats?.recentEvents ?? []" />
        </section>

        <aside class="space-y-6">
          <section>
            <div class="label mb-3">PROJECTS</div>
            <div v-if="(projects?.length ?? 0) === 0">
              <EmptyState message="NO PROJECTS" hint="CREATE ONE TO ORGANIZE YOUR ENTITIES" />
            </div>
            <div v-else class="space-y-2">
              <NuxtLink
                v-for="p in projects"
                :key="p.id"
                to="/projects"
                class="panel block px-4 py-3 transition-colors hover:border-arcane/40"
              >
                <div class="flex items-baseline justify-between">
                  <span class="text-[13.5px] text-ink">{{ p.name }}</span>
                  <span class="font-mono text-[10px] text-faint">{{ p.agentCount ?? 0 }} ENTITIES</span>
                </div>
                <div v-if="p.rootDir" class="mt-1 truncate font-mono text-[10px] text-faint/70">
                  {{ p.rootDir }}
                </div>
              </NuxtLink>
            </div>
          </section>
        </aside>
      </div>
    </div>
  </div>
</template>
