import type { I18nClient, TFunction } from '@payloadcms/translations'
import type { PillProps } from '@payloadcms/ui/elements/Pill'

import { Pill } from '@payloadcms/ui/elements/Pill'
import { Suspense } from 'react'

import type { DeploymentsInfo } from '../endpoints/getDeployments.js'
import type { VercelDeploymentsTranslationKeys } from '../translations/index.js'
import type { VercelDeploymentsPluginConfig } from '../types.js'
import type { VercelDeployment } from '../utilities/vercelApiClient.js'

import { Card } from './Card.js'
import { DeploymentStatusPoller } from './DeploymentStatusPoller.js'
import { FormattedDate } from './FormattedDate.js'
import { CloudIcon } from './icons/cloud.js'
import { ClockIcon } from './icons/clock.js'
import { ClockDashedIcon } from './icons/clock-dashed.js'
import { GlobeIcon } from './icons/globe.js'
import { SpinnerIcon } from './icons/spinner.js'
import { TriggerFrontendDeploymentButton } from './TriggerDeploymentButton.js'

export function DeploymentInfoCard({
  i18n,
  pluginConfig,
}: {
  i18n: I18nClient
  pluginConfig: VercelDeploymentsPluginConfig
}) {
  const t = i18n.t as TFunction<VercelDeploymentsTranslationKeys>

  const description = resolveDescription(pluginConfig.widget?.description, i18n.language)

  return (
    <DeploymentStatusPoller>
      <Card
        actions={<TriggerFrontendDeploymentButton />}
        icon={<CloudIcon />}
        title={t('vercel-dashboard:deploymentInfoTitle')}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {pluginConfig.widget?.websiteUrl ? (
            <div
              style={{
                alignItems: 'center',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.5rem 0.75rem',
              }}
            >
              <span style={{ alignItems: 'center', display: 'flex', gap: '0.375rem' }}>
                <GlobeIcon />
                <span style={{ fontWeight: 500 }}>
                  {t('vercel-dashboard:deploymentInfoWebsite')}:
                </span>
              </span>
              <a
                href={pluginConfig.widget.websiteUrl}
                rel="noopener noreferrer"
                style={{
                  color: 'var(--theme-text)',
                  textDecoration: 'none',
                }}
                target="_blank"
              >
                {pluginConfig.widget.websiteUrl.replace(/^https?:\/\//, '')}
              </a>
            </div>
          ) : null}

          <Suspense fallback={<DeploymentInfoSkeleton />}>
            <DeploymentInfo i18n={i18n} pluginConfig={pluginConfig} />
          </Suspense>

          {description ? (
            <p style={{ color: 'var(--theme-elevation-500)', fontSize: '0.875rem', margin: 0 }}>
              {description}
            </p>
          ) : null}
        </div>
      </Card>
    </DeploymentStatusPoller>
  )
}

function resolveDescription(
  description: Record<string, string> | string | undefined,
  language: string,
): string | undefined {
  if (!description) {
    return undefined
  }
  if (typeof description === 'string') {
    return description
  }
  return description[language] ?? description['en'] ?? Object.values(description)[0]
}

export default async function DeploymentInfo({
  i18n,
  pluginConfig,
}: {
  i18n: I18nClient
  pluginConfig: VercelDeploymentsPluginConfig
}) {
  const t = i18n.t as TFunction<VercelDeploymentsTranslationKeys>

  let lastReadyDeployment: DeploymentsInfo['lastReadyDeployment'] = undefined
  let latestDeployment: DeploymentsInfo['latestDeployment'] = undefined
  let error: string | undefined = undefined

  try {
    const { VercelApiClient } = await import('../utilities/vercelApiClient.js')
    const vercelClient = new VercelApiClient(pluginConfig.vercel.apiToken)

    const deploymentsResponse = await vercelClient.getDeployments({
      limit: 10,
      projectId: pluginConfig.vercel.projectId,
      target: 'production',
      teamId: pluginConfig.vercel.teamId,
    })

    const readyDeployment = deploymentsResponse.deployments.find(
      (deployment) => deployment.state === 'READY',
    )
    const latest = deploymentsResponse.deployments.at(0)

    lastReadyDeployment = readyDeployment
      ? {
          inspectorUrl: readyDeployment.inspectorUrl,
          readyAt: new Date(
            typeof readyDeployment.ready === 'number'
              ? readyDeployment.ready
              : readyDeployment.created,
          ).toISOString(),
          status: 'READY',
          uid: readyDeployment.uid,
        }
      : undefined

    latestDeployment =
      latest && latest.state
        ? {
            createdAt: new Date(latest.created).toISOString(),
            inspectorUrl: latest.inspectorUrl,
            status: latest.state,
            uid: latest.uid,
          }
        : undefined
  } catch (e) {
    error = e instanceof Error ? e.message : 'Unknown error'
  }

  if (error) {
    return (
      <div
        style={{
          alignItems: 'center',
          color: 'var(--theme-error-500)',
          display: 'flex',
          gap: '0.5rem',
        }}
      >
        <span>
          {t('vercel-dashboard:deploymentInfoError')}: {error}
        </span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <DeploymentInfoRow
        deploymentInfo={lastReadyDeployment}
        i18n={i18n}
        icon={<ClockIcon />}
        label={t('vercel-dashboard:deploymentInfoActiveDeployment')}
      />
      {latestDeployment && latestDeployment?.uid !== lastReadyDeployment?.uid ? (
        <DeploymentInfoRow
          deploymentInfo={latestDeployment}
          i18n={i18n}
          icon={<ClockDashedIcon />}
          label={t('vercel-dashboard:deploymentInfoLatestDeployment')}
        />
      ) : null}
    </div>
  )
}

function DeploymentInfoSkeleton() {
  return (
    <div
      style={{
        animation: 'pulse 2s infinite',
        backgroundColor: 'var(--theme-elevation-100)',
        borderRadius: '0.25rem',
        height: '1.25rem',
        maxWidth: '22.5rem',
      }}
    />
  )
}

function DeploymentInfoRow({
  deploymentInfo,
  i18n,
  icon,
  label,
}: {
  deploymentInfo: DeploymentsInfo['lastReadyDeployment'] | DeploymentsInfo['latestDeployment']
  i18n: I18nClient
  icon: React.ReactNode
  label: string
}) {
  const t = i18n.t as TFunction<VercelDeploymentsTranslationKeys>

  const deploymentStatusToPillStyle = (
    status: VercelDeployment['status'],
  ): PillProps['pillStyle'] => {
    switch (status) {
      case 'BUILDING':
        return 'warning'
      case 'CANCELED':
      case 'DELETED':
      case 'QUEUED':
        return 'light-gray'
      case 'ERROR':
        return 'error'
      case 'INITIALIZING':
        return 'warning'
      case 'READY':
        return 'success'
    }
  }

  return (
    <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '0.5rem 0.75rem' }}>
      <span style={{ alignItems: 'center', display: 'flex', gap: '0.375rem' }}>
        {icon}
        <span style={{ fontWeight: 500 }}>{label}:</span>
      </span>
      <span style={{ alignItems: 'center', display: 'flex', gap: '0.5rem' }}>
        {deploymentInfo ? (
          <FormattedDate
            date={
              new Date(
                'readyAt' in deploymentInfo ? deploymentInfo.readyAt : deploymentInfo.createdAt,
              )
            }
            dateFNSKey={i18n.dateFNSKey}
          />
        ) : null}
        <a
          aria-label={t('vercel-dashboard:deploymentInfoInspectDeployment')}
          href={deploymentInfo?.inspectorUrl ?? undefined}
          rel="noopener noreferrer"
          target="_blank"
          title={t('vercel-dashboard:deploymentInfoInspectDeployment')}
        >
          <Pill
            pillStyle={
              deploymentInfo?.status
                ? deploymentStatusToPillStyle(deploymentInfo.status as VercelDeployment['status'])
                : 'light-gray'
            }
            size="small"
          >
            <div style={{ alignItems: 'center', display: 'flex', gap: '0.25rem' }}>
              {deploymentInfo?.status
                ? t(
                    'vercel-dashboard:vercelDeploymentStatus' +
                      (deploymentInfo.status.charAt(0).toUpperCase() +
                        deploymentInfo.status.slice(1).toLowerCase()),
                  )
                : t('vercel-dashboard:vercelDeploymentStatusUnknown')}
              {deploymentInfo?.status === 'BUILDING' ? <SpinnerIcon /> : null}
            </div>
          </Pill>
        </a>
      </span>
    </div>
  )
}
