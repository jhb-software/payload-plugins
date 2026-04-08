import { describe, expect, it } from 'vitest'

import { hasDeploymentDataChanged } from './hasDeploymentDataChanged.js'

describe('hasDeploymentDataChanged', () => {
  it('returns true when previous data is null (first poll)', () => {
    expect(hasDeploymentDataChanged(null, '{"uid":"dep-1"}')).toBe(true)
  })

  it('returns false when data has not changed', () => {
    const json = JSON.stringify({
      lastReadyDeployment: { status: 'READY', uid: 'dep-1' },
      latestDeployment: { status: 'READY', uid: 'dep-1' },
    })
    expect(hasDeploymentDataChanged(json, json)).toBe(false)
  })

  it('returns true when deployment status changes', () => {
    const prev = JSON.stringify({
      lastReadyDeployment: { status: 'READY', uid: 'dep-1' },
      latestDeployment: { status: 'READY', uid: 'dep-1' },
    })
    const next = JSON.stringify({
      lastReadyDeployment: { status: 'READY', uid: 'dep-1' },
      latestDeployment: { status: 'BUILDING', uid: 'dep-2' },
    })
    expect(hasDeploymentDataChanged(prev, next)).toBe(true)
  })

  it('returns true when a new deployment appears', () => {
    const prev = JSON.stringify({
      lastReadyDeployment: { uid: 'dep-1' },
      latestDeployment: { uid: 'dep-1' },
    })
    const next = JSON.stringify({
      lastReadyDeployment: { uid: 'dep-1' },
      latestDeployment: { uid: 'dep-2' },
    })
    expect(hasDeploymentDataChanged(prev, next)).toBe(true)
  })

  it('returns false for identical single-deployment responses', () => {
    const json = JSON.stringify({ id: 'dep-1', status: 'BUILDING' })
    expect(hasDeploymentDataChanged(json, json)).toBe(false)
  })

  it('returns true when single-deployment status transitions', () => {
    const prev = JSON.stringify({ id: 'dep-1', status: 'BUILDING' })
    const next = JSON.stringify({ id: 'dep-1', status: 'READY' })
    expect(hasDeploymentDataChanged(prev, next)).toBe(true)
  })
})
