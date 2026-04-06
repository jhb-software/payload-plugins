/// <reference types="google.maps" />

let mapsLoadPromise: null | Promise<void> = null

/**
 * Loads the Google Maps Places library. Uses a module-level singleton
 * so concurrent callers share the same load. Resets on error to allow retry.
 */
export function loadGoogleMapsPlaces(apiKey: string): Promise<void> {
  if (mapsLoadPromise) {
    return mapsLoadPromise
  }

  if (typeof google !== 'undefined' && typeof google.maps?.importLibrary === 'function') {
    mapsLoadPromise = google.maps.importLibrary('places').then(() => {})
    return mapsLoadPromise
  }

  mapsLoadPromise = new Promise<void>((resolve, reject) => {
    const w = window as unknown as { google: { maps: Record<string, unknown> } }
    const g = w.google || (w.google = {} as { maps: Record<string, unknown> })
    g.maps || (g.maps = {})

    const script = document.createElement('script')
    const params = new URLSearchParams({
      callback: '__gmcb',
      key: apiKey,
      libraries: 'places',
    })
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`
    script.async = true
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).__gmcb = () => {
      resolve()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).__gmcb
    }
    script.onerror = () => {
      mapsLoadPromise = null
      reject(new Error('Failed to load Google Maps API'))
    }
    document.head.appendChild(script)
  })

  return mapsLoadPromise
}
