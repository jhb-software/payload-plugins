import type { Condition, FilterOptionsProps, Where } from 'payload'

import { describe, expect, test } from 'vitest'

import { composeFilterOptions, mergeFieldAdmin } from '../src/utils/fieldOverrides.js'

const filterOptionsProps = (data: Record<string, unknown> = {}) =>
  ({ data }) as unknown as FilterOptionsProps

const resolve = async (
  filterOptions: ReturnType<typeof composeFilterOptions>,
  data?: Record<string, unknown>,
): Promise<boolean | undefined | Where> =>
  typeof filterOptions === 'function'
    ? await filterOptions(filterOptionsProps(data))
    : (filterOptions ?? undefined)

const condition =
  (result: boolean): Condition =>
  () =>
    result

describe('mergeFieldAdmin', () => {
  test('returns the plugin config untouched when there is no override', () => {
    const base = { position: 'sidebar' as const, readOnly: true }

    expect(mergeFieldAdmin(base, undefined)).toEqual(base)
  })

  test('replaces a nested key without dropping its siblings', () => {
    const merged = mergeFieldAdmin(
      {
        components: { Field: 'plugin#PathField' },
        disableBulkEdit: true,
        position: 'sidebar' as const,
        readOnly: true,
      },
      { components: { Field: 'app#WrappedPathField' } },
    )

    expect(merged).toEqual({
      components: { Field: 'app#WrappedPathField' },
      disableBulkEdit: true,
      position: 'sidebar',
      readOnly: true,
    })
  })

  test('ANDs the two conditions instead of replacing the plugin one', () => {
    const args = [{}, {}, {}] as unknown as Parameters<Condition>

    expect(
      mergeFieldAdmin({ condition: condition(true) }, { condition: condition(true) }).condition?.(
        ...args,
      ),
    ).toBe(true)

    // The plugin's condition still hides the field even though the override
    // would show it.
    expect(
      mergeFieldAdmin({ condition: condition(false) }, { condition: condition(true) }).condition?.(
        ...args,
      ),
    ).toBe(false)

    expect(
      mergeFieldAdmin({ condition: condition(true) }, { condition: condition(false) }).condition?.(
        ...args,
      ),
    ).toBe(false)
  })

  test('takes the override condition when the plugin sets none', () => {
    const args = [{}, {}, {}] as unknown as Parameters<Condition>

    expect(
      mergeFieldAdmin<{ condition?: Condition }>(
        { condition: undefined },
        { condition: condition(false) },
      ).condition?.(...args),
    ).toBe(false)
  })
})

describe('composeFilterOptions', () => {
  const excludeSelf: Where = { id: { not_equals: 1 } }
  const categoriesOnly: Where = { systemRole: { equals: 'category-index' } }

  test('returns the plugin filter untouched when there is no override', async () => {
    expect(await resolve(composeFilterOptions(() => excludeSelf, undefined))).toEqual(excludeSelf)
  })

  test('returns the override when the plugin has no filter', async () => {
    expect(await resolve(composeFilterOptions(null, categoriesOnly))).toEqual(categoriesOnly)
  })

  test('ANDs two Where results', async () => {
    expect(
      await resolve(
        composeFilterOptions(
          () => excludeSelf,
          () => categoriesOnly,
        ),
      ),
    ).toEqual({
      and: [excludeSelf, categoriesOnly],
    })
  })

  test('drops an unconstrained side rather than ANDing a `true` in', async () => {
    // The plugin's own filter returns `true` before the document exists.
    expect(
      await resolve(
        composeFilterOptions(
          () => true,
          () => categoriesOnly,
        ),
      ),
    ).toEqual(categoriesOnly)
    expect(
      await resolve(
        composeFilterOptions(
          () => excludeSelf,
          () => true,
        ),
      ),
    ).toEqual(excludeSelf)
    expect(
      await resolve(
        composeFilterOptions(
          () => true,
          () => true,
        ),
      ),
    ).toBe(true)
  })

  test('a `false` from either side wins outright', async () => {
    expect(
      await resolve(
        composeFilterOptions(
          () => excludeSelf,
          () => false,
        ),
      ),
    ).toBe(false)
    expect(
      await resolve(
        composeFilterOptions(
          () => false,
          () => categoriesOnly,
        ),
      ),
    ).toBe(false)
  })

  test('awaits async filters and passes the props through to both sides', async () => {
    const composed = composeFilterOptions(
      ({ data }) => ({ id: { not_equals: data.id } }),
      async ({ data }) => Promise.resolve({ tenant: { equals: data.tenant } }),
    )

    expect(await resolve(composed, { id: 7, tenant: 3 })).toEqual({
      and: [{ id: { not_equals: 7 } }, { tenant: { equals: 3 } }],
    })
  })

  test('accepts plain Where filters on both sides', async () => {
    expect(await resolve(composeFilterOptions(excludeSelf, categoriesOnly))).toEqual({
      and: [excludeSelf, categoriesOnly],
    })
  })
})
