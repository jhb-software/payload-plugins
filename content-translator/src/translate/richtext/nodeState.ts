type LexicalNode = Record<string, unknown>

/**
 * Both hashes live in Lexical's NodeState slot (`$`) under a single namespaced
 * key so they travel with the node through copy/paste, reorder, history and
 * admin-editor saves. Stored inline on every top-level node:
 *
 *     "$": { "translator-plugin": { "srcHash": { "<sourceLocale>": <hash> }, "outHash": <hash> } }
 *
 * - `srcHash` — per source locale, the hash of the source text this node was
 *   translated from. Keyed by locale because the source language is chosen per
 *   run: translating the same target from EN vs. DE produces different source
 *   text, so each gets its own entry and switching sources does not falsely
 *   invalidate the other.
 * - `outHash` — hash of the machine output written here (detects later manual
 *   edits). Single value: it hashes the target's own text, independent of which
 *   source produced it.
 */
const STATE_KEY = '$'
const NS_KEY = 'translator-plugin'
const SRC_KEY = 'srcHash'
const OUT_KEY = 'outHash'

type NodeHashes = {
  outHash?: string
  srcHash?: string
}

const readNamespace = (node: LexicalNode): Record<string, unknown> | undefined => {
  const state = node[STATE_KEY]
  if (!state || typeof state !== 'object') {
    return undefined
  }
  const ns = (state as Record<string, unknown>)[NS_KEY]
  return ns && typeof ns === 'object' ? (ns as Record<string, unknown>) : undefined
}

/** Read the hashes relevant to a run translating from `sourceLocale`. */
export const getNodeHashes = (node: LexicalNode, sourceLocale: string): NodeHashes => {
  const ns = readNamespace(node)
  const srcMap = ns?.[SRC_KEY]
  const srcHash =
    srcMap && typeof srcMap === 'object'
      ? (srcMap as Record<string, unknown>)[sourceLocale]
      : undefined
  const outHash = ns?.[OUT_KEY]

  return {
    outHash: typeof outHash === 'string' ? outHash : undefined,
    srcHash: typeof srcHash === 'string' ? srcHash : undefined,
  }
}

/**
 * Copy the per-locale `srcHash` map from one node onto another (without the
 * `outHash`, which describes the target text and is set fresh on translate).
 * Used when a paragraph is retranslated from a new source locale: the fresh
 * clone inherits the source hashes of the locales it was previously translated
 * from, so a later run from one of those locales can still reuse it instead of
 * retranslating.
 */
export const inheritSrcHashes = (target: LexicalNode, source: LexicalNode): void => {
  const srcMap = readNamespace(source)?.[SRC_KEY]
  if (!srcMap || typeof srcMap !== 'object') {
    return
  }

  const state =
    target[STATE_KEY] && typeof target[STATE_KEY] === 'object'
      ? (target[STATE_KEY] as Record<string, unknown>)
      : {}
  const existingNs = state[NS_KEY]
  const ns =
    existingNs && typeof existingNs === 'object' ? (existingNs as Record<string, unknown>) : {}

  // Target's own per-locale hashes win over inherited ones.
  const merged = { ...srcMap }
  const existingMap = ns[SRC_KEY]
  if (existingMap && typeof existingMap === 'object') {
    Object.assign(merged, existingMap)
  }

  ns[SRC_KEY] = merged
  state[NS_KEY] = ns
  target[STATE_KEY] = state
}

export const setNodeHashes = (
  node: LexicalNode,
  sourceLocale: string,
  srcHash: string,
  outHash: string,
): void => {
  const state =
    node[STATE_KEY] && typeof node[STATE_KEY] === 'object'
      ? (node[STATE_KEY] as Record<string, unknown>)
      : {}

  const existingNs = state[NS_KEY]
  const ns =
    existingNs && typeof existingNs === 'object' ? (existingNs as Record<string, unknown>) : {}

  const existingSrcMap = ns[SRC_KEY]
  // Keep other locales' source hashes so a later run from a different source
  // can still reuse an unchanged paragraph instead of retranslating it.
  const srcMap =
    existingSrcMap && typeof existingSrcMap === 'object'
      ? (existingSrcMap as Record<string, unknown>)
      : {}
  srcMap[sourceLocale] = srcHash

  ns[SRC_KEY] = srcMap
  ns[OUT_KEY] = outHash
  state[NS_KEY] = ns
  node[STATE_KEY] = state
}
