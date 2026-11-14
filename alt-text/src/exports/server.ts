export { AltTextHealthWidget } from '../components/AltTextHealthWidget.js'

/**
 * @deprecated Import `getAltTextHealth` from the package root
 * (`@jhb.software/payload-alt-text-plugin`) instead. This entrypoint re-exports
 * the admin widget, which pulls in `@payloadcms/ui`/`.scss`, so importing the
 * util from here breaks `payload generate:*` and any non-bundler consumer.
 */
export { getAltTextHealth } from '../utilities/altTextHealth.js'
export type {
  AltTextHealthError,
  AltTextHealthErrorCode,
  AltTextHealthScan,
  AltTextHealthScanCollection,
} from '../utilities/altTextHealth.js'
