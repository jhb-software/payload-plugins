import type { ClientUploadsConfig, CollectionOptions } from '@payloadcms/plugin-cloud-storage/types'
import type { UploadCollectionSlug } from 'payload'

export type DeliveryType = 'authenticated' | 'upload'

export type CloudinaryStorageOptions = {
  /**
   * Do uploads directly on the client, to bypass limits on Vercel.
   */
  clientUploads?: ClientUploadsConfig

  /**
   * Cloudinary cloud name.
   */
  cloudName: string

  /**
   * Collections to apply the Cloudinary storage adapter to
   */
  collections: Partial<Record<UploadCollectionSlug, Omit<CollectionOptions, 'adapter'> | true>>

  /**
   * Cloudinary client configuration.
   */
  credentials: {
    apiKey: string
    apiSecret: string
  }

  /**
   * Cloudinary delivery type of uploaded assets. `authenticated` assets are only delivered through
   * URLs signed with the API secret, which the plugin generates whenever it builds a URL.
   * @default 'upload'
   */
  deliveryType?: DeliveryType

  /**
   * Whether or not to enable the plugin
   *
   * @default true
   */
  enabled?: boolean

  /**
   * Folder name to upload files to.
   */
  folder?: string

  /**
   * Whether to use the original filename as part of the public ID. Client uploads append a random
   * suffix to it.
   * @default true
   */
  useFilename?: boolean
}
