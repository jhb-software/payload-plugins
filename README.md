# JHB Software - Payload CMS Plugins

This repository contains a collection of powerful plugins designed to enhance [Payload CMS](https://payloadcms.com/), a headless content management system.

> ⚠️ **Warning**: This repository is actively evolving and may undergo significant changes. While the plugins are functional, please thoroughly test before using in production environments.

## Plugins

### Admin Search Plugin

[![NPM Version](https://img.shields.io/npm/v/%40jhb.software%2Fpayload-admin-search)](https://www.npmjs.com/package/@jhb.software/payload-admin-search)

A plugin that adds a global search modal to the Payload CMS admin panel, enabling quick navigation across documents and collections with keyboard shortcuts.

<img width="659" height="489" alt="image" src="https://github.com/user-attachments/assets/ba52d56e-7365-46ee-80e3-416d07946727" />

[→ Admin Search plugin ](./admin-search)

### Alt Text Plugin

[![NPM Version](https://img.shields.io/npm/v/%40jhb.software%2Fpayload-alt-text-plugin)](https://www.npmjs.com/package/@jhb.software/payload-alt-text-plugin)

A Payload CMS plugin that adds AI-powered alt text generation for images. It automatically adds an alt text field with a button to generate the alt text to specified upload collections, and includes a bulk generation feature in the list view for processing multiple images at once.

<img width="956" height="425" alt="image" src="https://github.com/user-attachments/assets/075d9d12-9949-425d-bd7f-15fb5b2507bd" />

[→ Alt Text plugin ](./alt-text)

### Geocoding Plugin

[![NPM Version](https://img.shields.io/npm/v/%40jhb.software%2Fpayload-geocoding-plugin)](https://www.npmjs.com/package/@jhb.software/payload-geocoding-plugin)

A geocoding plugin for Payload CMS that simplifies location management in your content. This plugin allows you to easily populate coordinates in a [Payload Point Field](https://payloadcms.com/docs/fields/point) by entering an address through an autocomplete interface powered by the Google Places API.

![Screenshot showing the added autocomplete select field](https://github.com/user-attachments/assets/13e0b9f8-dc69-47de-9691-384ebf1d0868)

[→ Geocoding plugin ](./geocoding)

### Pages Plugin

[![NPM Version](https://img.shields.io/npm/v/%40jhb.software%2Fpayload-pages-plugin)](https://www.npmjs.com/package/@jhb.software/payload-pages-plugin)

The Pages plugin simplifies website building by adding essential fields like `slug`, `parent`, `path`, `breadcrumbs`, and `alternatePaths` to your collections. These fields enable hierarchical page structures and dynamic URL management.

<img width="1442" height="795" alt="Frame 1 (1)" src="https://github.com/user-attachments/assets/a066cb2f-b243-452c-8277-7a208d3494ee" />

[→ Pages plugin ](./pages)

### Cloudinary Plugin

[![NPM Version](https://img.shields.io/npm/v/%40jhb.software%2Fpayload-cloudinary-plugin)](https://www.npmjs.com/package/@jhb.software/payload-cloudinary-plugin)

This package provides a Payload CMS Storage Adapter for [Cloudinary](https://cloudinary.com/) to seamlessly integrate Cloudinary with Payload CMS for media asset management.

[→ Cloudinary plugin ](./cloudinary)

### Content Translator Plugin

[![NPM Version](https://img.shields.io/npm/v/%40jhb.software%2Fpayload-content-translator-plugin)](https://www.npmjs.com/package/@jhb.software/payload-content-translator-plugin)

A plugin that enables content translation directly within the Payload CMS admin panel, using any translation service you prefer. It supports custom translation resolvers and provides a ready-to-use integration with OpenAI.

<img width="1320" height="678" alt="image" src="https://github.com/user-attachments/assets/5fc80378-7b45-42e5-808c-8cd042e2ad14" />

[→ Content Translator plugin ](./content-translator)

### Vercel Deployments Plugin

[![NPM Version](https://img.shields.io/npm/v/%40jhb.software%2Fpayload-vercel-deployments)](https://www.npmjs.com/package/@jhb.software/payload-vercel-deployments)

A plugin for managing Vercel deployments of static websites. When your site is statically built on Vercel, content changes in the CMS require a rebuild. This plugin provides a dashboard widget with deployment status and one-click redeploy, plus authenticated REST API endpoints for triggering deployments programmatically.

[→ Vercel Deployments plugin ](./vercel-deployments)

### Chat Agent Plugin

A Payload CMS plugin that adds an AI chat agent for reading, creating, and updating content. It provides an admin panel chat view where users can interact with their content through natural language, powered by Claude and the Payload Local API.

[→ Chat Agent plugin ](./chat-agent)

### Astro Payload RichText Lexical

[![NPM Version](https://img.shields.io/npm/v/%40jhb.software%2Fastro-payload-richtext-lexical)](https://www.npmjs.com/package/@jhb.software/astro-payload-richtext-lexical)

An Astro component that renders Payload CMS Lexical rich text content. Supports dependency injection for custom Block and Upload renderers.

[→ Astro Payload RichText Lexical](./astro-payload-richtext-lexical)
