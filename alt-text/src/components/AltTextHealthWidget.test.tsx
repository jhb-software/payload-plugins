// @vitest-environment jsdom
import type { WidgetServerProps } from 'payload'

import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../utilities/altTextHealth.js', () => ({
  getAltTextHealthWidgetData: vi.fn(() =>
    Promise.resolve({
      collections: [
        {
          collection: 'media',
          completeDocs: 1,
          invalidDocIds: ['doc-1', 'doc-2'],
          missingDocs: 2,
          partialDocs: 0,
          totalDocs: 3,
        },
      ],
      errors: [],
      isLocalized: false,
      localeCount: 0,
      totalDocs: 3,
    }),
  ),
}))

vi.mock('../utilities/getCollectionLabel.js', () => ({
  getCollectionLabel: (slug: string) => slug,
}))

vi.mock('@payloadcms/ui/elements/Pill', () => ({
  Pill: ({ children, to }: { children: React.ReactNode; to?: string }) =>
    to ? <a href={to}>{children}</a> : <span>{children}</span>,
}))

const { AltTextHealthWidget } = await import('./AltTextHealthWidget.js')

function createReq(adminRoute: string): WidgetServerProps['req'] {
  return {
    i18n: { language: 'en' },
    locale: undefined,
    payload: {
      config: {
        collections: [{ slug: 'media' }],
        routes: { admin: adminRoute },
      },
    },
    t: (key: string) => key,
  } as unknown as WidgetServerProps['req']
}

describe('AltTextHealthWidget', () => {
  beforeEach(() => {
    // noop
  })

  afterEach(() => {
    cleanup()
  })

  it('links to /admin when the default admin route is configured', async () => {
    const element = await AltTextHealthWidget({ req: createReq('/admin') } as WidgetServerProps)
    const { container } = render(element)

    const anchors = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'))
    expect(anchors).toContain('/admin/collections/media')
    expect(
      anchors.some((href) =>
        href?.startsWith('/admin/collections/media?where[id][in]=doc-1,doc-2'),
      ),
    ).toBe(true)
  })

  it('links to the custom admin route when one is configured', async () => {
    const element = await AltTextHealthWidget({ req: createReq('/cms') } as WidgetServerProps)
    const { container } = render(element)

    const anchors = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'))
    expect(anchors).toContain('/cms/collections/media')
    expect(
      anchors.some((href) => href?.startsWith('/cms/collections/media?where[id][in]=doc-1,doc-2')),
    ).toBe(true)
  })
})
