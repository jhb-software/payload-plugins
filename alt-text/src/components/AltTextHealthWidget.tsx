import type { WidgetServerProps } from 'payload'

import type { AltTextHealthCollectionSummary } from '../utilities/altTextHealth.js'

import { getAltTextHealth } from '../utilities/altTextHealth.js'

type Status = 'healthy' | 'unhealthy'

function getCollectionStatus(collection: AltTextHealthCollectionSummary): Status {
  if (collection.error || collection.totalDocs === 0) {
    return 'healthy'
  }
  if (collection.missingDocs + collection.partialDocs > 0) {
    return 'unhealthy'
  }
  return 'healthy'
}

const statusBadgeStyles: Record<Status, { background: string; color: string; label: string }> = {
  healthy: { background: '#dcfce7', color: '#15803d', label: 'statusHealthy' },
  unhealthy: { background: '#fee2e2', color: '#991b1b', label: 'statusUnhealthy' },
}

function getCollectionLabel(
  slug: string,
  req: WidgetServerProps['req'],
): string {
  const collectionConfig = req.payload.config.collections.find((c) => c.slug === slug)
  if (!collectionConfig?.labels?.plural) {
    return slug
  }
  const label = collectionConfig.labels.plural
  if (typeof label === 'string') {
    return label
  }
  if (typeof label === 'function') {
    return slug
  }
  const record = label as Record<string, string>
  return record[req.locale as string] ?? record[Object.keys(record)[0]] ?? slug
}

export async function AltTextHealthWidget({ req }: WidgetServerProps) {
  // Plugin translation keys are not in Payload's built-in key union
  const t = req.t as (key: string) => string
  const health = await getAltTextHealth(req)
  const localeCount = req.payload.config.localization
    ? req.payload.config.localization.localeCodes.length
    : 0

  return (
    <div
      className="card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        height: '100%',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>
          {t('@jhb.software/payload-alt-text-plugin:altTextHealthWidget')}
        </h3>
        <p style={{ color: 'var(--theme-text)', fontSize: '14px', margin: 0, opacity: 0.75 }}>
          {t('@jhb.software/payload-alt-text-plugin:altTextHealthDescription')}
        </p>
      </div>

      {health.collections.length === 0 && health.errors.length === 0 && (
        <p style={{ color: 'var(--theme-text)', margin: 0, opacity: 0.75 }}>
          {t('@jhb.software/payload-alt-text-plugin:noImagesFound')}
        </p>
      )}

      {health.errors.length > 0 && (
        <p style={{ color: '#92400e', fontSize: '13px', margin: 0 }}>
          {t('@jhb.software/payload-alt-text-plugin:healthCheckPartialWarning')}
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {health.collections.map((collection) => {
          const status = getCollectionStatus(collection)
          const badge = statusBadgeStyles[status]

          return (
            <div
              key={collection.collection}
              style={{
                alignItems: 'center',
                background: 'var(--theme-elevation-50)',
                border: '1px solid var(--theme-border-color)',
                borderRadius: '10px',
                display: 'flex',
                gap: '12px',
                justifyContent: 'space-between',
                padding: '12px 16px',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                <a
                  href={`${req.payload.config.routes.admin}/collections/${collection.collection}`}
                  style={{ color: 'var(--theme-text)', fontSize: '14px', fontWeight: 500, textDecoration: 'none' }}
                >
                  {getCollectionLabel(collection.collection, req)}
                </a>

                {collection.error ? (
                  <span style={{ color: '#92400e', fontSize: '13px' }}>
                    {t('@jhb.software/payload-alt-text-plugin:collectionCheckFailed')}
                  </span>
                ) : (
                  <span style={{ fontSize: '13px', opacity: 0.7 }}>
                    {t('@jhb.software/payload-alt-text-plugin:totalImageCount').replace(
                      '{count}',
                      String(collection.totalDocs),
                    )}
                    {health.isLocalized && (
                      <>
                        {' · '}
                        {t('@jhb.software/payload-alt-text-plugin:localeCount').replace(
                          '{count}',
                          String(localeCount),
                        )}
                      </>
                    )}
                  </span>
                )}
              </div>

              {status === 'unhealthy' && collection.invalidDocIds?.length > 0 ? (
                <a
                  href={`${req.payload.config.routes.admin}/collections/${collection.collection}?where[id][in]=${collection.invalidDocIds.join(',')}`}
                  style={{
                    background: badge.background,
                    borderRadius: '999px',
                    color: badge.color,
                    flexShrink: 0,
                    fontSize: '12px',
                    fontWeight: 600,
                    padding: '4px 10px',
                    textDecoration: 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {collection.missingDocs + collection.partialDocs}{' '}
                  {t('@jhb.software/payload-alt-text-plugin:statusUnhealthy')} →
                </a>
              ) : (
                <span
                  style={{
                    background: badge.background,
                    borderRadius: '999px',
                    color: badge.color,
                    flexShrink: 0,
                    fontSize: '12px',
                    fontWeight: 600,
                    padding: '4px 10px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t('@jhb.software/payload-alt-text-plugin:statusHealthy')}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
