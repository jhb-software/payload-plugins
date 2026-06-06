type LexicalNode = Record<string, unknown>

/**
 * Both hashes live in Lexical's NodeState slot (`$`) under a single namespaced
 * key so they travel with the node through copy/paste, reorder, history and
 * admin-editor saves. Kept short because this is stored inline on every
 * top-level node:
 *
 *     "$": { "translator-plugin": { "srcHash": <…>, "outHash": <…> } }
 *
 * - `srcHash` — hash of the source text this node was translated from (detects source changes)
 * - `outHash` — hash of the machine output written here (detects later manual edits)
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

export const getNodeHashes = (node: LexicalNode): NodeHashes => {
  const ns = readNamespace(node)
  const srcHash = ns?.[SRC_KEY]
  const outHash = ns?.[OUT_KEY]

  return {
    outHash: typeof outHash === 'string' ? outHash : undefined,
    srcHash: typeof srcHash === 'string' ? srcHash : undefined,
  }
}

export const setNodeHashes = (node: LexicalNode, srcHash: string, outHash: string): void => {
  const state =
    node[STATE_KEY] && typeof node[STATE_KEY] === 'object'
      ? (node[STATE_KEY] as Record<string, unknown>)
      : {}

  state[NS_KEY] = { [OUT_KEY]: outHash, [SRC_KEY]: srcHash }
  node[STATE_KEY] = state
}
