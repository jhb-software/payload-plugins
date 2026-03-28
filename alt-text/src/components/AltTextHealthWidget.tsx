import type { WidgetServerProps } from 'payload'

import type { AltTextHealthCollectionSummary } from '../utilities/altTextHealth.js'

import { getAltTextHealth } from '../utilities/altTextHealth.js'

type Status = 'green' | 'orange' | 'red'

function getCollectionStatus(collection: AltTextHealthCollectionSummary): Status {
  if (collection.error || collection.totalDocs === 0) {
    return 'green'
  }
  const missingRatio = (collection.missingDocs + collection.partialDocs) / collection.totalDocs
  if (missingRatio === 0) {
    return 'green'
  }
  if (missingRatio >= 0.5) {
    return 'red'
  }
  return 'orange'
}

const statusBadgeStyles: Record<Status, { background: string; color: string; label: string }> = {
  green: { background: '#dcfce7', color: '#15803d', label: 'statusGood' },
  orange: { background: '#fef3c7', color: '#92400e', label: 'statusSomeMissing' },
  red: { background: '#fee2e2', color: '#991b1b', label: 'statusManyMissing' },
}

export async function AltTextHealthWidget({ req }: WidgetServerProps) {
  // Plugin translation keys are not in Payload's built-in key union
  const t = req.t as (key: string) => string
  const health = await getAltTextHealth(req)

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
                <code style={{ color: 'var(--theme-text)', fontSize: '14px' }}>
                  {collection.collection}
                </code>

                {collection.error ? (
                  <span style={{ color: '#92400e', fontSize: '13px' }}>
                    {t('@jhb.software/payload-alt-text-plugin:collectionCheckFailed')}
                  </span>
                ) : (
                  <span style={{ fontSize: '13px', opacity: 0.7 }}>
                    {t('@jhb.software/payload-alt-text-plugin:coverageSummary')
                      .replace('{complete}', String(collection.completeDocs))
                      .replace('{total}', String(collection.totalDocs))}
                    {health.isLocalized && collection.partialDocs > 0 && (
                      <>
                        {' · '}
                        {t('@jhb.software/payload-alt-text-plugin:partialLocalesSummary').replace(
                          '{count}',
                          String(collection.partialDocs),
                        )}
                      </>
                    )}
                  </span>
                )}
              </div>

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
                {t(`@jhb.software/payload-alt-text-plugin:${badge.label}`)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
