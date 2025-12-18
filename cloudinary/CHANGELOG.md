# Changelog

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