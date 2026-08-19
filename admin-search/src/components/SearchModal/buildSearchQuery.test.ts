import { describe, expect, it } from 'vitest'

import { buildSearchQuery } from './buildSearchQuery.js'

describe('buildSearchQuery', () => {
  it('lists everything when there is neither a query nor a base filter', () => {
    expect(buildSearchQuery({})).not.toHaveProperty('where')
  })

  it('matches documents whose title contains the query', () => {
    expect(buildSearchQuery({ query: 'pricing' }).where).toEqual({
      and: [{ title: { like: 'pricing' } }],
    })
  })

  it('restricts an empty query to the base filter, so an unqueried search only lists documents in scope', () => {
    expect(buildSearchQuery({ baseFilter: { tenant: { equals: 'acme' } } }).where).toEqual({
      and: [{ tenant: { equals: 'acme' } }],
    })
  })

  it('requires both the query and the base filter to match, so a document outside the scope never surfaces', () => {
    expect(
      buildSearchQuery({ baseFilter: { tenant: { equals: 'acme' } }, query: 'pricing' }).where,
    ).toEqual({
      and: [{ title: { like: 'pricing' } }, { tenant: { equals: 'acme' } }],
    })
  })

  it('ignores a base filter with no constraints', () => {
    expect(buildSearchQuery({ baseFilter: {}, query: 'pricing' }).where).toEqual({
      and: [{ title: { like: 'pricing' } }],
    })
  })
})
