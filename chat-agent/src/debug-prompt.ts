/**
 * Debug helpers for inspecting what's actually shipped to the model provider.
 *
 * Enabled by setting `CHAT_AGENT_DEBUG_PROMPT=1`. Off the hot path otherwise.
 *
 * On every turn: logs an approximate token breakdown for system prompt, tool
 * definitions, and conversation history. The estimate uses ~4 chars/token for
 * prose and ~3 chars/token for the dense JSON of tool schemas — close enough
 * to the provider's actual `inputTokens` for back-of-the-envelope tuning.
 *
 * On the first turn of a conversation (messages.length <= 1): also writes
 * the resolved system prompt + serialized tool schemas to
 * `<cwd>/.chat-agent-debug/`. The directory is created on demand.
 */
import type { ModelMessage, ToolSet } from 'ai'

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'

const DEBUG_DIR = '.chat-agent-debug'

/**
 * Rough tokens-from-chars heuristic. Anthropic's tokenizer hits ~4 chars/token
 * on prose and ~3 chars/token on dense JSON. The two-ratio split closes most
 * of the gap with `usage.inputTokens` from the actual provider response.
 */
function approxTokensProse(s: string): number {
  return Math.round(s.length / 4)
}
function approxTokensJson(s: string): number {
  return Math.round(s.length / 3)
}

/**
 * Convert a zod schema to JSON Schema for human inspection. Several tool
 * params use `z.unknown()` / `z.record(z.string(), z.unknown())` which zod 4
 * considers unrepresentable in JSON Schema and throws on by default — pass
 * `unrepresentable: 'any'` so they emit `{}` instead of failing the whole dump.
 */
function toJsonSchema(schema: unknown): unknown {
  if (!schema || typeof schema !== 'object') {
    return schema
  }
  try {
    return z.toJSONSchema(schema as z.ZodType, { unrepresentable: 'any' })
  } catch {
    return schema
  }
}

/**
 * Build the plain object that mirrors what's shipped to the provider for
 * tools. Stringification is left to the caller so the same object can be
 * measured (compact, for token estimation) and dumped (pretty, for humans).
 */
function buildToolsObject(tools: ToolSet): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [name, tool] of Object.entries(tools)) {
    const t = tool as { description?: string; inputSchema?: unknown }
    out[name] = {
      description: t.description,
      inputSchema: toJsonSchema(t.inputSchema),
    }
  }
  return out
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US')
}

function formatRow(label: string, tokens: number, suffix = ''): string {
  const labelCol = label.padEnd(10, ' ')
  const tokCol = `~${formatNumber(tokens)} tok`.padStart(12, ' ')
  return `  ${labelCol}${tokCol}${suffix}`
}

export async function debugLogPromptIfEnabled(args: {
  messages: ModelMessage[]
  systemPrompt: string
  tools: ToolSet
}): Promise<void> {
  if (process.env.CHAT_AGENT_DEBUG_PROMPT !== '1') {
    return
  }

  const { messages, systemPrompt, tools } = args
  const toolsObj = buildToolsObject(tools)
  // Compact for the size estimate — whitespace in the HTTP body isn't
  // tokenized by the provider, so measuring the pretty form would
  // systematically over-count.
  const toolsCompact = JSON.stringify(toolsObj)
  const messagesCompact = JSON.stringify(messages)

  const sysTokens = approxTokensProse(systemPrompt)
  const toolsTokens = approxTokensJson(toolsCompact)
  const msgsTokens = approxTokensProse(messagesCompact)
  const total = sysTokens + toolsTokens + msgsTokens

  const toolNames = Object.keys(tools)
  const toolList =
    toolNames.length <= 6
      ? toolNames.join(', ')
      : `${toolNames.slice(0, 6).join(', ')}, … (+${toolNames.length - 6})`

  const lines = [
    '[chat-agent] approx request size (chars / 4)',
    formatRow('system', sysTokens),
    formatRow('tools', toolsTokens, `  ·  ${toolNames.length} tools: ${toolList}`),
    formatRow(
      'messages',
      msgsTokens,
      `  ·  ${messages.length} message${messages.length === 1 ? '' : 's'}`,
    ),
    `  ${'─'.repeat(22)}`,
    formatRow('total', total),
  ]
  // eslint-disable-next-line no-console
  console.log(lines.join('\n'))

  // Only dump to disk on the first turn — that's when system+tools are most
  // worth inspecting, and writing on every turn would clobber the file.
  if (messages.length > 1) {
    return
  }

  try {
    const dir = join(process.cwd(), DEBUG_DIR)
    await mkdir(dir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const promptPath = join(dir, `system-prompt-${stamp}.md`)
    const toolsPath = join(dir, `tools-${stamp}.json`)
    await writeFile(promptPath, systemPrompt, 'utf8')
    // Pretty-printed for human inspection — file size doesn't affect tokens.
    await writeFile(toolsPath, JSON.stringify(toolsObj, null, 2), 'utf8')
    // eslint-disable-next-line no-console
    console.log(`[chat-agent] wrote debug files:\n  ${promptPath}\n  ${toolsPath}`)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[chat-agent] failed to write debug prompt files:', err)
  }
}
