/**
 * Agent communication protocol.
 *
 * Agents direct the system through lines in their output:
 *
 *   @ENTITYNAME instruction   — send an instruction to another entity
 *                              (recorded in its conversation; queued to its
 *                              runtime when it is started)
 *   @OPERATOR question        — pause and ask the operator; the entity waits
 *                              (WAITING_FOR_HUMAN) until the operator answers,
 *                              and the answer is injected into its history
 *
 * Parsing is exact and line-anchored — only lines that begin with the
 * mention count. Everything else in the output stays plain text.
 */

export interface ParsedDirectives {
  mentions: { targetId: string; content: string }[]
  operatorQuestions: string[]
}

export function parseDirectives(
  text: string,
  knownAgents: { id: string; name: string }[],
): ParsedDirectives {
  const mentions: ParsedDirectives['mentions'] = []
  const operatorQuestions: string[] = []

  const idByName = new Map(knownAgents.map((a) => [a.name.toUpperCase(), a.id]))

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    const match = /^@([A-Za-z0-9_-]+)\s+(.+)$/.exec(line)
    if (!match) continue

    const name = match[1]
    const content = match[2]?.trim()
    if (!name || !content) continue

    if (name.toUpperCase() === 'OPERATOR') {
      operatorQuestions.push(content)
      continue
    }
    const targetId = idByName.get(name.toUpperCase())
    if (targetId) {
      mentions.push({ targetId, content })
    }
  }

  return { mentions, operatorQuestions }
}
