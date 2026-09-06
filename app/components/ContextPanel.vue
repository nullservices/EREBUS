<script setup lang="ts">
import type { Agent } from '~~/shared/types'

export interface SessionInfo {
  id: string
  providerKind: string | null
  model: string
  status: string
  startedAt: string
  endedAt: string | null
  tokenUsageIn: number | null
  tokenUsageOut: number | null
}

const props = defineProps<{
  agent: Agent
  children: Agent[]
  lastSession?: SessionInfo | null
}>()

const TOOL_LABELS: Record<string, string> = {
  filesystem: 'FILESYSTEM',
  git: 'GIT',
  terminal: 'TERMINAL',
  network: 'NETWORK',
  mcp: 'MCP',
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
</script>

<template>
  <aside class="hidden w-[300px] shrink-0 overflow-y-auto border-l border-line bg-abyss px-5 py-6 lg:block">
    <div class="mb-5">
      <div class="label mb-1.5">CONTEXT</div>
      <div class="text-[15px] tracking-[0.15em] text-ink">{{ agent.name }}</div>
      <div class="font-mono text-[10px] uppercase tracking-[0.2em] text-faint">
        {{ agent.role || 'UNASSIGNED' }} · {{ agent.status }}
      </div>
    </div>

    <div class="space-y-5">
      <section v-if="agent.description">
        <div class="label mb-1.5">DESCRIPTION</div>
        <p class="text-[12.5px] leading-relaxed text-dim">{{ agent.description }}</p>
      </section>

      <section>
        <div class="label mb-1.5">ASSIGNMENT</div>
        <dl class="space-y-1.5 font-mono text-[11px]">
          <div class="flex justify-between gap-3">
            <dt class="text-faint">PROJECT</dt>
            <dd class="truncate text-dim">{{ agent.projectName ?? '—' }}</dd>
          </div>
          <div class="flex justify-between gap-3">
            <dt class="text-faint">PARENT</dt>
            <dd class="truncate text-dim">{{ agent.parentName ?? '—' }}</dd>
          </div>
          <div class="flex justify-between gap-3">
            <dt class="text-faint">CHILDREN</dt>
            <dd class="truncate text-dim">
              <span v-if="children.length">{{ children.map((c) => c.name).join(', ') }}</span>
              <span v-else>—</span>
            </dd>
          </div>
          <div class="flex justify-between gap-3">
            <dt class="text-faint">CURRENT TASK</dt>
            <dd class="truncate text-dim">—</dd>
          </div>
        </dl>
      </section>

      <section v-if="lastSession">
        <div class="label mb-1.5">SESSION</div>
        <dl class="space-y-1.5 font-mono text-[11px]">
          <div class="flex justify-between gap-3">
            <dt class="text-faint">STATE</dt>
            <dd class="text-dim">{{ lastSession.status }}</dd>
          </div>
          <div class="flex justify-between gap-3">
            <dt class="text-faint">MODEL</dt>
            <dd class="truncate text-dim">{{ lastSession.model || 'PROVIDER DEFAULT' }}</dd>
          </div>
          <div class="flex justify-between gap-3">
            <dt class="text-faint">TOKENS IN / OUT</dt>
            <dd class="text-dim">
              {{ lastSession.tokenUsageIn ?? 0 }} / {{ lastSession.tokenUsageOut ?? 0 }}
            </dd>
          </div>
          <div class="flex justify-between gap-3">
            <dt class="text-faint">SINCE</dt>
            <dd class="text-dim">{{ lastSession.startedAt.slice(11, 19) }}</dd>
          </div>
        </dl>
      </section>

      <section>
        <div class="label mb-1.5">RUNTIME</div>
        <dl class="space-y-1.5 font-mono text-[11px]">
          <div class="flex justify-between gap-3">
            <dt class="text-faint">PROVIDER</dt>
            <dd class="truncate text-dim">{{ agent.providerLabel ?? '—' }}</dd>
          </div>
          <div class="flex justify-between gap-3">
            <dt class="text-faint">MODEL</dt>
            <dd class="truncate text-dim">{{ agent.modelOverride || 'PROVIDER DEFAULT' }}</dd>
          </div>
          <div>
            <dt class="mb-0.5 text-faint">WORKING DIR</dt>
            <dd class="break-all text-[10.5px] leading-relaxed text-dim">
              {{ agent.workingDir || '—' }}
            </dd>
          </div>
        </dl>
      </section>

      <section v-if="agent.tools.length">
        <div class="label mb-1.5">TOOLS</div>
        <ul class="space-y-1 font-mono text-[10.5px] tracking-[0.12em]">
          <li v-for="tool in agent.tools" :key="tool" class="flex items-center justify-between">
            <span class="text-dim">{{ TOOL_LABELS[tool] ?? tool.toUpperCase() }}</span>
            <span class="uppercase text-faint">{{ agent.permissions[tool] ?? '—' }}</span>
          </li>
        </ul>
      </section>

      <section>
        <div class="label mb-1.5">RECORD</div>
        <dl class="space-y-1.5 font-mono text-[11px]">
          <div class="flex justify-between gap-3">
            <dt class="text-faint">CREATED</dt>
            <dd class="text-dim">{{ fmtDate(agent.createdAt) }}</dd>
          </div>
          <div class="flex justify-between gap-3">
            <dt class="text-faint">UPDATED</dt>
            <dd class="text-dim">{{ fmtDate(agent.updatedAt) }}</dd>
          </div>
        </dl>
      </section>
    </div>
  </aside>
</template>
