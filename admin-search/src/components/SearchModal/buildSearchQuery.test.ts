import type { Where } from 'payload'

import { describe, expect, it } from 'vitest'

import { buildSearchQuery, buildSearchURL } from './buildSearchQuery.js'

const resolved = (filter?: Where) => ({ filter, status: 'resolved' }) as const

describe('buildSearchQuery', () => {
  it('lists everything when there is neither a query nor a base filter', () => {
    expect(buildSearchQuery({ baseFilter: resolved() })).not.toHaveProperty('where')
  })

  it('matches documents whose title contains the query', () => {
    expect(buildSearchQuery({ baseFilter: resolved(), query: 'pricing' }).where).toEqual({
      and: [{ title: { like: 'pricing' } }],
    })
  })

  it('restricts an empty query to the base filter, so an unqueried search only lists documents in scope', () => {
    expect(
      buildSearchQuery({ baseFilter: resolved({ tenant: { equals: 'acme' } }) }).where,
    ).toEqual({ and: [{ tenant: { equals: 'acme' } }] })
  })

  it('requires both the query and the base filter to match, so a document outside the scope never surfaces', () => {
    expect(
      buildSearchQuery({ baseFilter: resolved({ tenant: { equals: 'acme' } }), query: 'pricing' })
        .where,
    ).toEqual({
      and: [{ title: { like: 'pricing' } }, { tenant: { equals: 'acme' } }],
    })
  })

  it('ignores a base filter with no constraints', () => {
    expect(buildSearchQuery({ baseFilter: resolved({}), query: 'pricing' }).where).toEqual({
      and: [{ title: { like: 'pricing' } }],
    })
  })

  it('matches no document when the base filter could not be evaluated, so the query is scoped out even if it is sent', () => {
    // Every document has an id, so this constraint is unsatisfiable — the intended scope is
    // unknown, and answering with the whole collection would leak what the filter was for.
    expect(
      buildSearchQuery({ baseFilter: { status: 'unavailable' }, query: 'pricing' }).where,
    ).toEqual({ and: [{ title: { like: 'pricing' } }, { id: { exists: false } }] })
  })

  it('matches no document when the base filter could not be evaluated and nothing was typed', () => {
    expect(buildSearchQuery({ baseFilter: { status: 'unavailable' } }).where).toEqual({
      and: [{ id: { exists: false } }],
    })
  })
})

describe('buildSearchURL', () => {
  it('queries the search collection when the base filter resolved', () => {
    expect(buildSearchURL({ apiRoute: '/api', baseFilter: resolved() })).toBe('/api/search')
  })

  it('has nowhere to query when the base filter could not be resolved, so no request goes out and no document can surface', () => {
    expect(buildSearchURL({ apiRoute: '/api', baseFilter: { status: 'unavailable' } })).toBe('')
  })
})
