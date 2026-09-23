import type { GenericTranslationsObject } from './index.js'

export const de: GenericTranslationsObject = {
  'vercel-dashboard': {
    // Deployment Info Feature
    deploymentInfoActiveDeployment: 'Aktive Veröffentlichung',
    deploymentInfoDeploymentCompletedSuccessfully: 'Veröffentlichung abgeschlossen',
    deploymentInfoDeploymentTriggeredFailed: 'Veröffentlichung konnte nicht gestartet werden',
    deploymentInfoDeploymentTriggeredSuccessfully: 'Veröffentlichung gestartet',
    deploymentInfoError: 'Fehler beim Laden der Veröffentlichungen',
    deploymentInfoInspectDeployment: 'Details anzeigen',
    deploymentInfoLatestDeployment: 'Neueste Veröffentlichung',
    deploymentInfoNoAccess: 'Keine Berechtigung, Veröffentlichungen anzuzeigen.',
    deploymentInfoNoTarget: 'Kein Vercel-Projekt ausgewählt.',
    deploymentInfoTitle: 'Veröffentlichungen',
    deploymentInfoTriggerRedeploy: 'Neue Veröffentlichung',
    deploymentInfoWebsite: 'Website',

    // Vercel Deployment Status
    vercelDeploymentStatusBuilding: 'Wird gebaut',
    vercelDeploymentStatusCanceled: 'Abgebrochen',
    vercelDeploymentStatusDeleted: 'Gelöscht',
    vercelDeploymentStatusError: 'Fehler',
    vercelDeploymentStatusFailed: 'Fehlgeschlagen',
    vercelDeploymentStatusInitializing: 'Startet',
    vercelDeploymentStatusQueued: 'In Warteschlange',
    vercelDeploymentStatusReady: 'Bereit',
    vercelDeploymentStatusUnknown: 'Unbekannter Status',
  },
}
