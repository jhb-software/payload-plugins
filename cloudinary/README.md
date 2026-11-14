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
- Since Payload 3.90, server uploads are capped at 20MB per file and 50MB per request by default. Raise `upload.limits.fileSize` and `upload.requestSizeLimit` in `buildConfig` for larger files such as videos, or enable `clientUploads`, which bypasses both limits.

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

With `clientUploads` enabled the plugin registers a signature endpoint that mints Cloudinary upload signatures for the browser. Like Payload's official storage adapters, it requires an authenticated user who may create or update documents in the target collection, and then applies `clientUploads.access` (default: any authenticated user).

Because the baseline derives from collection access, an upload collection with a permissive `access.create` or `access.update` also opens signature minting. Projects with public sign-up or customer-facing accounts should verify what those rules actually grant, and set `clientUploads.access` when the signature endpoint needs a stricter rule than the collection:

```ts
cloudinaryStorage({
  clientUploads: {
    access: ({ collectionSlug, req }) => req.user?.role === 'admin',
  },
  // …
})
```

The browser sends `{ filename, mimeType, size }` to the signature endpoint. The server checks the file type against the collection (SVG and XML only with `allowRestrictedFileTypes`), mints the public ID (with a random suffix, so uploads never collide), signs it with `overwrite=false`, and returns the upload parameters plus a pending receipt. After uploading with exactly those parameters, the browser sends Cloudinary's response and the pending receipt to a second endpoint (`/cloudinary-confirm-upload`, same access rule). The server verifies Cloudinary's response signature with the API secret, checks that the public ID is the one it minted for this user and collection, builds the file URL itself, and returns a Payload receipt. Payload rejects client uploads without a valid receipt, so a confirmed upload proves the asset exists in this cloud under an ID the server minted for this user and collection.

Response signatures are verified with the Cloudinary SDK's global `signature_algorithm` (SHA-1 by default). Accounts configured for SHA-256 must set it via `cloudinary.config({ signature_algorithm: 'sha256' })`.

The `cloudinaryPublicId` field is written only by the plugin and cannot be set through the API.

When Payload re-encodes a client-uploaded image on the server (`resizeOptions`, `formatOptions`, `trimOptions`, or animated GIF/WebP with `sharp` configured), the processed file is uploaded from the server under the same public ID, replacing the browser upload. Generated `imageSizes` are always uploaded from the server.

## Roadmap

> ⚠️ **Warning**: This plugin is actively evolving and may undergo significant changes. While it is functional, please thoroughly test before using in production environments.

Have a suggestion for the plugin? Any feedback is welcome!

## Contributing

We welcome contributions! Please open an issue to report bugs or suggest improvements, or submit a pull request with your changes.
