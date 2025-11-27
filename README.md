# JHB Software - Payload CMS Plugins

This repository contains a collection of powerful plugins designed to enhance [Payload CMS](https://payloadcms.com/), a headless content management system.

> ⚠️ **Warning**: This repository is actively evolving and may undergo significant changes. While the plugins are functional, please thoroughly test before using in production environments.

## Plugins

### Admin Search Plugin

[![NPM Version](https://img.shields.io/npm/v/%40jhb.software%2Fpayload-admin-search)](https://www.npmjs.com/package/@jhb.software/payload-admin-search)

A plugin that adds a global search modal to the Payload admin panel, enabling quick navigation across documents and collections with keyboard shortcuts (`Cmd + K` / `Ctrl + K`).

<img width="659" height="489" alt="image" src="https://github.com/user-attachments/assets/ba52d56e-7365-46ee-80e3-416d07946727" />

[Learn more about the Admin Search plugin →](./admin-search)

### Alt Text Plugin

[![NPM Version](https://img.shields.io/npm/v/%40jhb.software%2Fpayload-alt-text-plugin)](https://www.npmjs.com/package/@jhb.software/payload-alt-text-plugin)

A minimal plugin to generate image alt texts using OpenAI's Vision API. Automatically adds an alt text field with AI-generation capability to upload collections, including a bulk generation feature for processing multiple images at once.

[Learn more about the Alt Text plugin →](./alt-text)

### Geocoding Plugin

[![NPM Version](https://img.shields.io/npm/v/%40jhb.software%2Fpayload-geocoding-plugin)](https://www.npmjs.com/package/@jhb.software/payload-geocoding-plugin)

The geocoding plugin simplifies location management in your content by adding a autocomplete search field that allows you to easily populate coordinates in a [Payload Point Field](https://payloadcms.com/docs/fields/point) by entering an address powered by the Google Places API.

![Screenshot showing the added autocomplete select field](https://github.com/user-attachments/assets/13e0b9f8-dc69-47de-9691-384ebf1d0868)

[Learn more about the Geocoding plugin →](./geocoding)

### Pages Plugin

[![NPM Version](https://img.shields.io/npm/v/%40jhb.software%2Fpayload-pages-plugin)](https://www.npmjs.com/package/@jhb.software/payload-pages-plugin)

The Pages plugin simplifies website building by adding essential fields like `slug`, `parent`, `path`, `breadcrumbs`, and `alternatePaths` to your collections. These fields enable hierarchical page structures and dynamic URL management.

[Learn more about the Pages plugin →](./pages)

### Cloudinary Plugin

[![NPM Version](https://img.shields.io/npm/v/%40jhb.software%2Fpayload-cloudinary-plugin)](https://www.npmjs.com/package/@jhb.software/payload-cloudinary-plugin)

Seamlessly integrate [Cloudinary](https://cloudinary.com/) with Payload CMS for media asset management. This plugin enables direct uploading your media files through Cloudinary's platform.

[Learn more about the Cloudinary plugin →](./cloudinary)

### SEO Plugin

[![NPM Version](https://img.shields.io/npm/v/%40jhb.software%2Fpayload-seo-plugin)](https://www.npmjs.com/package/@jhb.software/payload-seo-plugin)

Extends the official [SEO plugin](https://payloadcms.com/docs/plugins/seo) with additional features:

- AI-powered meta description generation for compelling search results
- Focus keyword tracking with intelligent warnings when keywords are missing from crucial elements (title, description, content)
- Multi-keyword support with content usage analytics

[Learn more about the SEO plugin →](./seo)


