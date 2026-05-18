# Changelog

## Unreleased

> ⚠️ **Breaking changes** below — review before upgrading.

- refactor: align with `@payloadcms/storage-s3`'s stateless model. `cloudinaryPublicId` is now derived from `filename` + collection prefix + folder via a field-level `beforeChange` hook, not read from the Cloudinary upload response. The plugin no longer depends on `@payloadcms/plugin-cloud-storage` invoking `adapter.handleUpload` for client uploads — which it stopped doing in 3.82+ — so client uploads on Payload 3.82+ now persist correctly without any workaround.
- fix: admin previews no longer fail with "missing on disk" after a client upload (root cause covered by the refactor above).
- refactor: the static handler derives the Cloudinary URL from `cloudinaryPublicId` + `mimeType` instead of reading `doc.url`. Documents no longer need `doc.url` to point at a Cloudinary CDN URL for the API route to work.

### Breaking changes

- The `useFilename` config option has been removed. The plugin now always uses the original filename as the `public_id`. If you depended on `useFilename: false` (random Cloudinary IDs), migration: rename your `public_id`s in Cloudinary to match the new derivation `${folder}/${prefix}${filename without extension}`, or pin to 0.3.x.
- `adapter.handleUpload` no longer writes `cloudinaryPublicId` or `url` onto the document. Anyone reading these fields downstream still gets the same values, but the write happens through field hooks now.

## 0.3.4

- feat: broaden Next.js peer dependency to `^15.0.0 || ^16.0.0` so the plugin can be installed alongside Next.js 16

## 0.3.3

- fix: `getAdminThumbnail` now returns `undefined` instead of `false` if the `cloudinaryPublicId` or `mimeType` field is missing in the getAdminThumbnail function (e.g. during the upload process).

## 0.3.2

- fix: `thumbnailURL` now correctly points to Cloudinary in Payload 3.7X
  - The `adminThumbnail` function now generates URLs directly from `cloudinaryPublicId` instead of relying on `doc.url`
  - This ensures the thumbnail URL is correct even when Payload's `thumbnailURL` hook runs before the `url` field is regenerated
- fix: `generateURL` now does not throw an exception if the `cloudinaryPublicId` field is missing.
  - Instead, it returns `undefined` which is handled by Payload's default URL handling. This is necessary because in Payload 3.7X `generateURL` is called during upload, therefore its not possible to throw an exception, otherwise the upload would fail.

## 0.3.1

- add support for chunked uploads for files larger than 100MB
- update peer dependencies to support any minor version of Next.js 15 and Payload 3

## 0.3.0

> ⚠️ **Warning**: This release includes major breaking changes. Please read this carefully before upgrading.

- the plugin now implements the Payload Storage Adapter
- a new `clientUploads` config option has been added to allow for client-side uploads to bypass server-side upload limits on Vercel

### Breaking Changes

- the `useFilename` config option now defaults to `true` (instead of `false`)
- the custom `cloudinaryUrl` field previously added by the plugin is removed in favor of Payload's built-in `url` field. A migration might be needed to update your existing data.
- the `uploadOptions` config option has been removed. `useFilename` is now a top-level config option.
- the `cloudinary` config option has been removed. The `cloudName` and `folder` are now top-level config options.
- the `uploadCollections` config option has been renamed to `collections` to match the Storage Adapter API.
- To replicate the previous behavior of using direct URLs to Cloudinary, you must now set `disablePayloadAccessControl: true` on the collection options in your plugin configuration.

Plugin config migration example:

Before:

```ts
payloadCloudinaryPlugin({
    uploadCollections: ['images', 'videos'],
    credentials: {
        apiKey: process.env.CLOUDINARY_API_KEY!,
        apiSecret: process.env.CLOUDINARY_API_SECRET!,
    },
    cloudinary: {
        cloudName: process.env.CLOUDINARY_CLOUD_NAME!,
        folder: 'uploads',
    },
    uploadOptions: {
        useFilename: true,
    },
}),
```

After:

```ts
payloadCloudinaryPlugin({
  collections: {
    images: {
      disablePayloadAccessControl: true,
    }
    videos: {
      disablePayloadAccessControl: true,
    }
  },
  cloudName: process.env.CLOUDINARY_CLOUD_NAME!,
  folder: 'uploads',
  credentials: {
    apiKey: process.env.CLOUDINARY_API_KEY!,
    apiSecret: process.env.CLOUDINARY_API_SECRET!,
  },
  useFilename: true,
}),
```

## 0.2.0

- Initial release
