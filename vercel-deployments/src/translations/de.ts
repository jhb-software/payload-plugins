import type { GenericTranslationsObject } from './index.js'

export const de: GenericTranslationsObject = {
  'vercel-dashboard': {
    // Deployment Info Feature
    deploymentInfoActiveDeployment: 'Aktive Veröffentlichung',
    deploymentInfoDeploymentCompletedSuccessfully:
      'Neue Veröffentlichung erfolgreich abgeschlossen',
    deploymentInfoDeploymentTriggeredFailed:
      'Die letzte Produktionsveröffentlichung konnte nicht erneut veröffentlicht werden',
    deploymentInfoDeploymentTriggeredSuccessfully:
      'Die letzte Produktionsveröffentlichung wurde erfolgreich erneut veröffentlicht',
    deploymentInfoError: 'Fehler beim Abrufen der Veröffentlichungsinformationen',
    deploymentInfoInspectDeployment: 'Veröffentlichung inspizieren',
    deploymentInfoLatestDeployment: 'Neueste Veröffentlichung',
    deploymentInfoTitle: 'Vercel Veröffentlichungen',
    deploymentInfoTriggerRedeploy: 'Letzte Produktion erneut veröffentlichen',

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
