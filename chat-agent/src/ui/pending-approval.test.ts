import type { UIMessage } from 'ai'

import { describe, expect, it } from 'vitest'

import { hasPendingApproval } from './pending-approval.js'

// A `ToolUIPart` in the AI SDK carries a discriminator shape
// `{ type: 'tool-<name>', state, input, approval? }`. We construct the
// minimum the helper actually reads — the real type tree is deep enough
// that a literal-typed stand-in stays the same size and doesn't bring in
// any more signal.
function toolPart(overrides: {
  approvalId?: string
  approved?: boolean
  state: string
  toolName?: string
}): UIMessage['parts'][number] {
  const { approvalId = 'approve_1', approved, state, toolName = 'find' } = overrides
  const approval = approvalId ? { id: approvalId, approved } : undefined
  return {
    type: `tool-${toolName}`,
    approval,
    input: { q: 'X' },
    state,
    toolCallId: 'call_1',
  } as unknown as UIMessage['parts'][number]
}

function assistant(parts: UIMessage['parts']): UIMessage {
  return { id: `a-${Math.random()}`, parts, role: 'assistant' } as UIMessage
}

function user(text: string): UIMessage {
  return {
    id: `u-${Math.random()}`,
    parts: [{ type: 'text', text }],
    role: 'user',
  } as UIMessage
}

describe('hasPendingApproval', () => {
  it('returns false for an empty conversation', () => {
    expect(hasPendingApproval([])).toBe(false)
  })

  it('returns false when no tool parts exist', () => {
    expect(hasPendingApproval([user('hi'), assistant([{ type: 'text', text: 'hello' }])])).toBe(
      false,
    )
  })

  // The state a `needsApproval` tool enters while waiting for Allow / Deny
  // from the user. Sending a new message in this state is exactly the bug
  // we are blocking.
  it('returns true when the last assistant message has a tool part in state "approval-requested"', () => {
    expect(
      hasPendingApproval([
        user('delete the draft'),
        assistant([toolPart({ approvalId: 'a1', state: 'approval-requested' })]),
      ]),
    ).toBe(true)
  })

  it('returns false once the tool part has moved past approval-requested', () => {
    // Any non-`approval-requested` state means the user has acted (approved,
    // denied, or the tool already executed). The composer should unblock.
    for (const state of ['input-available', 'output-available', 'output-error', 'output-denied']) {
      expect(
        hasPendingApproval([
          user('do it'),
          assistant([toolPart({ approvalId: 'a1', approved: true, state })]),
        ]),
        `state=${state} should not block the composer`,
      ).toBe(false)
    }
  })

  it('returns true even when the pending approval is buried among other parts', () => {
    expect(
      hasPendingApproval([
        user('do a and b'),
        assistant([
          { type: 'text', text: 'running both' },
          toolPart({ approvalId: 'a1', state: 'output-available', toolName: 'find' }),
          toolPart({ approvalId: 'a2', state: 'approval-requested', toolName: 'delete' }),
        ]),
      ]),
    ).toBe(true)
  })

  it('ignores pending approvals in earlier turns once the assistant has moved on', () => {
    // Conservative contract: we only block on pending approvals in the last
    // assistant message. A historical approval-requested part (that somehow
    // survived without transitioning) is already poisoning the transcript;
    // the sanitizer handles that — the composer gate is only for the live
    // decision in front of the user.
    expect(
      hasPendingApproval([
        user('first thing'),
        assistant([toolPart({ approvalId: 'old', state: 'approval-requested' })]),
        user('never mind'),
        assistant([{ type: 'text', text: 'understood' }]),
      ]),
    ).toBe(false)
  })
})
