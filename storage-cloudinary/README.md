# Cloudinary Storage for Payload

This package provides a simple way to use [Cloudinary](https://cloudinary.com/) storage with Payload.

## Usage

- Configure the `collections` object to specify which collections should use the Cloudinary adapter. The slug _must_ match one of your existing collection slugs.
- When enabled, this package will automatically set `disableLocalStorage` to `true` for each collection.
- When deploying to Vercel, server uploads are limited with 4.5MB. Set `clientUploads` to `true` to do uploads directly on the client.

```ts
import { cloudinaryStorage } from '@jhb.software/payload-storage-cloudinary'
import { Media } from './collections/Media'
import { MediaWithPrefix } from './collections/MediaWithPrefix'

export default buildConfig({
  collections: [Media, MediaWithPrefix],
  plugins: [
    cloudinaryStorage({
      collections: {
        media: true,
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
    }),
  ],
})
```

The plugin automatically adds a `cloudinaryPublicId` field to your upload collections. This can be used to directly access the uploaded file from Cloudinary.

## Roadmap

> ⚠️ **Warning**: This plugin is actively evolving and may undergo significant changes. While it is functional, please thoroughly test before using in production environments.

Have a suggestion for the plugin? Any feedback is welcome!

## Contributing

We welcome contributions! Please open an issue to report bugs or suggest improvements, or submit a pull request with your changes.
