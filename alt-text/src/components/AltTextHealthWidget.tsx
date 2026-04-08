import type { TFunction } from '@payloadcms/translations'
import type { WidgetServerProps } from 'payload'

import { Pill } from '@payloadcms/ui/elements/Pill'

import type { PluginAltTextTranslationKeys } from '../translations/index.js'

import { getAltTextHealthWidgetData } from '../utilities/altTextHealth.js'
import { getAltTextHealthWidgetDisplayState } from '../utilities/altTextHealthWidgetDisplay.js'
import { getCollectionLabel } from '../utilities/getCollectionLabel.js'
import { ArrowRightIcon } from './icons/ArrowRightIcon.js'
import { CheckIcon } from './icons/CheckIcon.js'
import { ImageIcon } from './icons/ImageIcon.js'

export async function AltTextHealthWidget({ req }: WidgetServerProps) {
  const t = req.t as TFunction<PluginAltTextTranslationKeys>
  const { collections, errors, isLocalized, localeCount, totalDocs } =
    await getAltTextHealthWidgetData(req)

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
        <div style={{ alignItems: 'center', display: 'flex', gap: '0.5rem' }}>
          <div style={{ color: 'var(--theme-elevation-500)' }}>
            <ImageIcon />
          </div>
          <h3 style={{ margin: 0 }}>
            {t('@jhb.software/payload-alt-text-plugin:altTextHealthWidget')}
          </h3>
        </div>
        <p style={{ color: 'var(--theme-text)', fontSize: '14px', margin: 0, opacity: 0.75 }}>
          {t('@jhb.software/payload-alt-text-plugin:altTextHealthDescription')}
        </p>
      </div>

      {totalDocs === 0 && errors.length === 0 && (
        <p style={{ color: 'var(--theme-text)', margin: 0, opacity: 0.75 }}>
          {t('@jhb.software/payload-alt-text-plugin:noImagesFound')}
        </p>
      )}

      {errors.length > 0 && (
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
                borderRadius: 'var(--style-radius-m)',
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
                  {getCollectionLabel(
                    collection.collection,
                    req.payload.config.collections,
                    req.locale,
                  )}
                </a>

                {displayState === 'unavailable' ? (
                  <span style={{ color: '#92400e', fontSize: '13px' }}>
                    {t('@jhb.software/payload-alt-text-plugin:collectionCheckFailed')}
                  </span>
                ) : (
                  <span style={{ fontSize: '13px', opacity: 0.7 }}>
                    <span style={{ whiteSpace: 'nowrap' }}>
                      {t('@jhb.software/payload-alt-text-plugin:totalImageCount', {
                        count: collection.totalDocs,
                      })}
                    </span>
                    {isLocalized && (
                      <>
                        {' · '}
                        <span style={{ whiteSpace: 'nowrap' }}>
                          {t('@jhb.software/payload-alt-text-plugin:localeCount', {
                            count: localeCount,
                          })}
                        </span>
                      </>
                    )}
                  </span>
                )}
              </div>

              {displayState === 'unhealthy' &&
              collection.invalidDocIds &&
              collection.invalidDocIds.length > 0 ? (
                <Pill
                  pillStyle="error"
                  size="small"
                  to={`${req.payload.config.routes.admin}/collections/${collection.collection}?where[id][in]=${collection.invalidDocIds.join(',')}`}
                >
                  <div style={{ alignItems: 'center', display: 'flex', gap: '0.25rem' }}>
                    {t('@jhb.software/payload-alt-text-plugin:statusUnhealthy', {
                      count: collection.missingDocs + collection.partialDocs,
                    })}
                    <ArrowRightIcon height="12" width="12" />
                  </div>
                </Pill>
              ) : displayState === 'healthy' ? (
                <Pill pillStyle="success" size="small">
                  <div style={{ alignItems: 'center', display: 'flex', gap: '0.25rem' }}>
                    {t('@jhb.software/payload-alt-text-plugin:statusHealthy')}
                    <CheckIcon height="12" width="12" />
                  </div>
                </Pill>
              ) : displayState === 'unhealthy' ? (
                <Pill pillStyle="error" size="small">
                  {t('@jhb.software/payload-alt-text-plugin:statusUnhealthy', {
                    count: collection.missingDocs + collection.partialDocs,
                  })}
                </Pill>
              ) : (
                <Pill pillStyle="warning" size="small">
                  {t('@jhb.software/payload-alt-text-plugin:collectionCheckFailed')}
                </Pill>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
