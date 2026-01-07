import type { GenericTranslationsObject } from './index.js'

export const de: GenericTranslationsObject = {
  'vercel-dashboard': {
    // Deployment Info Feature
    deploymentInfoActiveDeployment: 'Aktive Veröffentlichung',
    deploymentInfoDeploymentCompletedSuccessfully:
      'Neue Veröffentlichung erfolgreich abgeschlossen',
    deploymentInfoDeploymentTriggeredFailed: 'Neue Veröffentlichung konnte nicht erstellt werden',
    deploymentInfoDeploymentTriggeredSuccessfully: 'Neue Veröffentlichung erfolgreich erstellt',
    deploymentInfoDescription:
      'Da die Website aus Performancegründen statisch ist, muss bei Inhaltsänderungen im CMS eine neue Veröffentlichung erstellt werden, bei dem die Website mit den aktuell im CMS veröffentlichten Inhalten neu erstellt wird. Der Erstellungsprozess dauert in der Regel 1-2 Minuten.',
    deploymentInfoError: 'Fehler beim Abrufen der Veröffentlichungsinformationen',
    deploymentInfoInspectDeployment: 'Veröffentlichung inspizieren',
    deploymentInfoLatestDeployment: 'Neueste Veröffentlichung',
    deploymentInfoTitle: 'Vercel Veröffentlichungen',
    deploymentInfoTriggerRebuild: 'Neue Veröffentlichung erstellen',

    // Vercel Deployment Status
    vercelDeploymentStatusBuilding: 'Wird gebaut',
    vercelDeploymentStatusCanceled: 'Abgebrochen',
    vercelDeploymentStatusDeleted: 'Gelöscht',
    vercelDeploymentStatusError: 'Fehler',
    vercelDeploymentStatusFailed: 'Fehlgeschlagen',
    vercelDeploymentStatusInitializing: 'Wird initialisiert',
    vercelDeploymentStatusQueued: 'In Warteschlange',
    vercelDeploymentStatusReady: 'Bereit',
    vercelDeploymentStatusUnknown: 'Unbekannter Status',
  },
}
