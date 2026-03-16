import type { WidgetServerProps } from 'payload'

import { getAltTextHealth } from '../utilities/altTextHealth.js'

const statCardStyle = {
  background: 'var(--theme-elevation-50)',
  border: '1px solid var(--theme-border-color)',
  borderRadius: '10px',
  display: 'flex',
  flexDirection: 'column' as const,
  gap: '6px',
  minWidth: 0,
  padding: '14px 16px',
}

const labelStyle = {
  color: 'var(--theme-text)',
  fontSize: '13px',
  opacity: 0.7,
}

const valueStyle = {
  color: 'var(--theme-text)',
  fontSize: '28px',
  fontWeight: 700,
  lineHeight: 1,
}

export async function AltTextHealthWidget({ req }: WidgetServerProps) {
  const t = req.t as (key: string) => string
  const health = await getAltTextHealth(req)
  const formatNumber = (value: number): string =>
    new Intl.NumberFormat(req.locale || undefined).format(value)

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

      <div
        style={{
          display: 'grid',
          gap: '12px',
          gridTemplateColumns: health.isLocalized
            ? 'repeat(auto-fit, minmax(140px, 1fr))'
            : 'repeat(auto-fit, minmax(160px, 1fr))',
        }}
      >
        <div style={statCardStyle}>
          <span style={labelStyle}>{t('@jhb.software/payload-alt-text-plugin:totalImages')}</span>
          <span style={valueStyle}>{formatNumber(health.totalDocs)}</span>
        </div>

        <div style={statCardStyle}>
          <span style={labelStyle}>
            {t('@jhb.software/payload-alt-text-plugin:fullyCoveredImages')}
          </span>
          <span style={valueStyle}>{formatNumber(health.completeDocs)}</span>
        </div>

        <div style={statCardStyle}>
          <span style={labelStyle}>
            {t('@jhb.software/payload-alt-text-plugin:missingAltTextImages')}
          </span>
          <span style={valueStyle}>{formatNumber(health.missingDocs)}</span>
        </div>

        {health.isLocalized && (
          <div style={statCardStyle}>
            <span style={labelStyle}>
              {t('@jhb.software/payload-alt-text-plugin:imagesWithMissingLocales')}
            </span>
            <span style={valueStyle}>{formatNumber(health.partialDocs)}</span>
          </div>
        )}
      </div>

      {health.totalDocs === 0 && health.errors.length === 0 && (
        <div
          style={{
            background: 'var(--theme-elevation-50)',
            border: '1px dashed var(--theme-border-color)',
            borderRadius: '10px',
            padding: '16px',
          }}
        >
          <p style={{ color: 'var(--theme-text)', margin: 0, opacity: 0.75 }}>
            {t('@jhb.software/payload-alt-text-plugin:noImagesFound')}
          </p>
        </div>
      )}

      {health.errors.length > 0 && (
        <div
          style={{
            background: 'var(--theme-warning-100)',
            border: '1px solid var(--theme-warning-300)',
            borderRadius: '10px',
            color: 'var(--theme-warning-900)',
            padding: '12px 14px',
          }}
        >
          <p style={{ fontWeight: 600, margin: '0 0 4px 0' }}>
            {t('@jhb.software/payload-alt-text-plugin:healthCheckPartialWarning')}
          </p>
          <ul style={{ margin: 0, paddingInlineStart: '18px' }}>
            {health.errors.map((error) => (
              <li key={error.collection}>
                <code>{error.collection}</code>: {error.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {health.collections.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {health.collections.map((collection) => (
            <div
              key={collection.collection}
              style={{
                background: 'var(--theme-elevation-50)',
                border: '1px solid var(--theme-border-color)',
                borderRadius: '10px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                padding: '14px 16px',
              }}
            >
              <div
                style={{
                  alignItems: 'center',
                  display: 'flex',
                  gap: '12px',
                  justifyContent: 'space-between',
                }}
              >
                <div
                  style={{
                    alignItems: 'baseline',
                    columnGap: '8px',
                    display: 'flex',
                    flexWrap: 'wrap',
                    rowGap: '2px',
                  }}
                >
                  <span style={{ fontSize: '13px', opacity: 0.65 }}>
                    {t('@jhb.software/payload-alt-text-plugin:collectionLabel')}
                  </span>
                  <code style={{ color: 'var(--theme-text)', fontSize: '14px' }}>
                    {collection.collection}
                  </code>
                </div>

                {collection.error && (
                  <span
                    style={{
                      background: 'var(--theme-warning-150)',
                      borderRadius: '999px',
                      color: 'var(--theme-warning-900)',
                      fontSize: '12px',
                      fontWeight: 600,
                      padding: '4px 10px',
                    }}
                  >
                    {t('@jhb.software/payload-alt-text-plugin:collectionCheckFailed')}
                  </span>
                )}
              </div>

              {!collection.error ? (
                <div
                  style={{
                    display: 'grid',
                    gap: '10px',
                    gridTemplateColumns: health.isLocalized
                      ? 'repeat(auto-fit, minmax(120px, 1fr))'
                      : 'repeat(auto-fit, minmax(140px, 1fr))',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <span style={labelStyle}>
                      {t('@jhb.software/payload-alt-text-plugin:totalImages')}
                    </span>
                    <div style={{ color: 'var(--theme-text)', fontSize: '20px', fontWeight: 700 }}>
                      {formatNumber(collection.totalDocs)}
                    </div>
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <span style={labelStyle}>
                      {t('@jhb.software/payload-alt-text-plugin:fullyCoveredImages')}
                    </span>
                    <div style={{ color: 'var(--theme-text)', fontSize: '20px', fontWeight: 700 }}>
                      {formatNumber(collection.completeDocs)}
                    </div>
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <span style={labelStyle}>
                      {t('@jhb.software/payload-alt-text-plugin:missingAltTextImages')}
                    </span>
                    <div style={{ color: 'var(--theme-text)', fontSize: '20px', fontWeight: 700 }}>
                      {formatNumber(collection.missingDocs)}
                    </div>
                  </div>

                  {health.isLocalized && (
                    <div style={{ minWidth: 0 }}>
                      <span style={labelStyle}>
                        {t('@jhb.software/payload-alt-text-plugin:imagesWithMissingLocales')}
                      </span>
                      <div style={{ color: 'var(--theme-text)', fontSize: '20px', fontWeight: 700 }}>
                        {formatNumber(collection.partialDocs)}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p style={{ color: 'var(--theme-text)', margin: 0, opacity: 0.75 }}>
                  {collection.error}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
