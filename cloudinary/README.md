# JHB Software - Cloudinary Storage Adapter for Payload CMS

This package provides a Payload CMS Storage Adapter for [Cloudinary](https://cloudinary.com/) to seamlessly integrate Cloudinary with Payload CMS for media asset management.

## Installation

```sh
pnpm add @jhb.software/payload-cloudinary-plugin @payloadcms/plugin-cloud-storage
```

`@payloadcms/plugin-cloud-storage` is a peer dependency and must be installed explicitly. Keep it on the same version as the rest of the Payload suite (`payload`, `@payloadcms/next`, …) so a single copy of `@payloadcms/ui` is resolved — a version mismatch installs a second copy and breaks the admin panel with React context errors.

## Usage

- Configure the `collections` object to specify which collections should use the Cloudinary adapter. The slug _must_ match one of your existing collection slugs.
- When enabled, this package will automatically set `disableLocalStorage` to `true` for each collection.
- When deploying to Vercel, server uploads are limited with 4.5MB. Set `clientUploads` to `true` upload directly on the client.

```ts
import { cloudinaryStorage } from '@jhb.software/payload-cloudinary-plugin'
import { Media } from './collections/Media'
import { MediaWithPrefix } from './collections/MediaWithPrefix'

export default buildConfig({
  collections: [Media, MediaWithPrefix],
  plugins: [
    cloudinaryStorage({
      collections: {
        media: true,
        'media-with-direct-urls': {
          disablePayloadAccessControl: true,
        },
        'media-with-prefix': {
          prefix: 'my-prefix',
        },
      },
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      credentials: {
        apiKey: process.env.CLOUDINARY_API_KEY,
        apiSecret: process.env.CLOUDINARY_API_SECRET,
      },
      // Optional, specifies the folder to upload files to:
      folder: 'uploads',
      // Optional, enables client uploads to bypass limits on Vercel:
      clientUploads: true,
      // Optional, enables the use of the original filename as part of the public ID:
      useFilename: true,
    }),
  ],
})
```

The plugin automatically adds a `cloudinaryPublicId` field to your upload collections. This can be used to directly access the uploaded file from Cloudinary.

## Authentication

With `clientUploads` enabled the plugin registers a signature endpoint that mints Cloudinary upload signatures for the browser. A user may only request a signature for a collection they are allowed to create documents in.

Because the default derives from collection access, an upload collection with a permissive `access.create` also opens signature minting. Projects with public sign-up or customer-facing accounts should verify what `access.create` on their upload collections actually grants, and override `clientUploads.access` when the signature endpoint needs a stricter rule than the collection:

```ts
cloudinaryStorage({
  clientUploads: {
    access: ({ collectionSlug, req }) => req.user?.role === 'admin',
  },
  // …
})
```

## Roadmap

> ⚠️ **Warning**: This plugin is actively evolving and may undergo significant changes. While it is functional, please thoroughly test before using in production environments.

Have a suggestion for the plugin? Any feedback is welcome!

## Contributing

We welcome contributions! Please open an issue to report bugs or suggest improvements, or submit a pull request with your changes.
