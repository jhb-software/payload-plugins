import type { WidgetServerProps } from 'payload'

import { getAltTextHealthWidgetData } from '../utilities/altTextHealth.js'
import { getAltTextHealthWidgetDisplayState } from '../utilities/altTextHealthWidgetDisplay.js'
import { getCollectionLabel } from '../utilities/getCollectionLabel.js'

const badgeStyles = {
  healthy: { background: '#dcfce7', color: '#15803d' },
  unhealthy: { background: '#fee2e2', color: '#991b1b' },
}

export async function AltTextHealthWidget({ req }: WidgetServerProps) {
  // Plugin translation keys are not in Payload's built-in key union
  const t = req.t as (key: string) => string
  const { collections, contract } = await getAltTextHealthWidgetData(req)
  const localeCount = contract.summary.localeCount

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

      {contract.summary.totalDocs === 0 && contract.errors.length === 0 && (
        <p style={{ color: 'var(--theme-text)', margin: 0, opacity: 0.75 }}>
          {t('@jhb.software/payload-alt-text-plugin:noImagesFound')}
        </p>
      )}

      {contract.errors.length > 0 && (
        <p style={{ color: '#92400e', fontSize: '13px', margin: 0 }}>
          {t('@jhb.software/payload-alt-text-plugin:healthCheckPartialWarning')}
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {collections.map((collection) => {
          const displayState = getAltTextHealthWidgetDisplayState(collection)

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
                  style={{
                    color: 'var(--theme-text)',
                    fontSize: '14px',
                    fontWeight: 500,
                    textDecoration: 'none',
                  }}
                >
                  {getCollectionLabel(collection.collection, req.payload.config.collections, req.locale)}
                </a>

                {displayState === 'unavailable' ? (
                  <span style={{ color: '#92400e', fontSize: '13px' }}>
                    {t('@jhb.software/payload-alt-text-plugin:collectionCheckFailed')}
                  </span>
                ) : (
                  <span style={{ fontSize: '13px', opacity: 0.7 }}>
                    {t('@jhb.software/payload-alt-text-plugin:totalImageCount').replace(
                      '{count}',
                      String(collection.totalDocs),
                    )}
                    {contract.summary.isLocalized && (
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

              {displayState === 'unhealthy' &&
              collection.invalidDocIds &&
              collection.invalidDocIds.length > 0 ? (
                <a
                  href={`${req.payload.config.routes.admin}/collections/${collection.collection}?where[id][in]=${collection.invalidDocIds.join(',')}`}
                  style={{
                    background: badgeStyles.unhealthy.background,
                    borderRadius: '999px',
                    color: badgeStyles.unhealthy.color,
                    flexShrink: 0,
                    fontSize: '12px',
                    fontWeight: 600,
                    padding: '4px 10px',
                    textDecoration: 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {collection.invalidDocCount}{' '}
                  {t('@jhb.software/payload-alt-text-plugin:statusUnhealthy')} →
                </a>
              ) : displayState === 'healthy' ? (
                <span
                  style={{
                    background: badgeStyles.healthy.background,
                    borderRadius: '999px',
                    color: badgeStyles.healthy.color,
                    flexShrink: 0,
                    fontSize: '12px',
                    fontWeight: 600,
                    padding: '4px 10px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t('@jhb.software/payload-alt-text-plugin:statusHealthy')}
                </span>
              ) : displayState === 'unhealthy' ? (
                <span
                  style={{
                    background: badgeStyles.unhealthy.background,
                    borderRadius: '999px',
                    color: badgeStyles.unhealthy.color,
                    flexShrink: 0,
                    fontSize: '12px',
                    fontWeight: 600,
                    padding: '4px 10px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {collection.invalidDocCount}{' '}
                  {t('@jhb.software/payload-alt-text-plugin:statusUnhealthy')}
                </span>
              ) : (
                <span
                  style={{
                    color: '#92400e',
                    flexShrink: 0,
                    fontSize: '12px',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t('@jhb.software/payload-alt-text-plugin:collectionCheckFailed')}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
