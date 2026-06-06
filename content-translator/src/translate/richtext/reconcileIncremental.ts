import { hashNode, hashText, nodePlainText } from './hashNode.js'
import { getNodeHashes, inheritSrcHashes, setNodeHashes } from './nodeState.js'

type LexicalNode = Record<string, unknown>

export type ReconcileResult = {
  /** The merged target children, in source order. */
  children: LexicalNode[]
  /** Number of units left untouched because their source changed under a hand-edited translation. */
  conflictCount: number
  /** Deferred hash stamps to run after the translation values have been applied. */
  stamps: Array<() => void>
}

/**
 * Merge a source lexical tree's top-level nodes into an existing target tree,
 * translating only new or changed units and preserving everything else.
 *
 * Identity is content-addressed: each source unit hashes to `h`, and the target
 * nodes are indexed by the `srcHash` they were translated from for this source
 * locale. A match means the source is unchanged → the target node is reused
 * as-is (manual edits preserved, no translation). A miss means new or changed:
 *
 * - if the paired prior target still holds untouched machine output → retranslate
 * - if it was hand-edited → leave it in place and count it as needing review
 *
 * Target nodes whose `srcHash` no longer appears in the source are deletions and
 * are dropped. The result follows source order, so inserts and reorders land in
 * the right place.
 */
export const reconcileIncremental = ({
  collectUnitTexts,
  localeFrom,
  sourceChildren,
  targetChildren,
}: {
  /** Push the unit node's translatable text into valuesToTranslate (translated in place). */
  collectUnitTexts: (unitNode: LexicalNode) => void
  /** Source locale of this run; selects which per-locale srcHash to join on. */
  localeFrom: string
  sourceChildren: LexicalNode[]
  targetChildren: LexicalNode[]
}): ReconcileResult => {
  // Content-addressed index: stored srcHash (for this source locale) -> queue of
  // target nodes (queued so duplicate-text units are consumed in order rather
  // than colliding).
  const targetsBySrcHash = new Map<string, LexicalNode[]>()
  for (const targetNode of targetChildren) {
    const { srcHash } = getNodeHashes(targetNode, localeFrom)
    if (srcHash) {
      const queue = targetsBySrcHash.get(srcHash) ?? []
      queue.push(targetNode)
      targetsBySrcHash.set(srcHash, queue)
    }
  }

  // Pass 1: reuse content-matched units, set aside the rest as work.
  const consumed = new Set<LexicalNode>()
  const plan: Array<
    { node: LexicalNode; type: 'reuse' } | { sourceNode: LexicalNode; type: 'work' }
  > = []

  for (const sourceNode of sourceChildren) {
    const match = targetsBySrcHash.get(hashNode(sourceNode))?.shift()
    if (match) {
      consumed.add(match)
      plan.push({ type: 'reuse', node: match })
    } else {
      plan.push({ type: 'work', sourceNode })
    }
  }

  // Unconsumed targets, in original order — paired positionally with changed
  // source units to decide retranslate vs. review-conflict.
  const leftoverTargets = targetChildren.filter((node) => !consumed.has(node))
  let leftoverIndex = 0

  const stamps: Array<() => void> = []
  let conflictCount = 0
  const children: LexicalNode[] = []

  for (const step of plan) {
    if (step.type === 'reuse') {
      children.push(step.node)
      continue
    }

    const prior =
      leftoverIndex < leftoverTargets.length ? leftoverTargets[leftoverIndex++] : undefined

    if (prior) {
      const { outHash } = getNodeHashes(prior, localeFrom)
      const priorEdited = outHash !== undefined && outHash !== hashText(nodePlainText(prior))

      if (priorEdited) {
        // Source moved under a hand-tuned translation: keep the human's version.
        conflictCount += 1
        children.push(prior)
        continue
      }
    }

    // New unit, or changed source over untouched machine output: translate a
    // fresh clone of the source so its text is overwritten and re-stamped. If it
    // replaces a prior translation, inherit that node's per-locale source hashes
    // so a later run from a different source locale can still reuse it.
    const clone = structuredClone(step.sourceNode)
    const srcHash = hashNode(clone)
    collectUnitTexts(clone)
    stamps.push(() => {
      if (prior) {
        inheritSrcHashes(clone, prior)
      }
      setNodeHashes(clone, localeFrom, srcHash, hashText(nodePlainText(clone)))
    })
    children.push(clone)
  }

  return { children, conflictCount, stamps }
}
