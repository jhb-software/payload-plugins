# Changelog

## 0.3.2

- fix: throw an error instead of building an invalid href for invalid URLs in custom links

## 0.3.1

- Fix: Nested ordered and unordered lists now render correctly

## 0.3.0

- Add `resolveInternalLink` config option for custom internal link resolution
- Add `slugifyHeadingId` config option for customizing heading ID generation
- Fix: Correct `LinkNode` type and internal link handling

## 0.2.1

- Fix: Only render wrapper `<div>` when `class` prop is provided
- Refactor: Extract node rendering logic into separate `RichTextNodes` component

## 0.2.0

- Add optional `class` prop for styling the wrapper div
- Add Tailwind CSS Typography usage example in README
- Remove Tailwind CSS dependencies - component now outputs pure semantic HTML
- Align types with Payload CMS generated types (optional `indent`, `direction` accepts `null`, expanded `format` values)
- Add table and nested list examples to dev demo

## 0.1.0

- Initial release
- Render Payload CMS Lexical rich text content to Astro elements
- Support for headings, paragraphs, text formatting, links, lists, quotes, tables, horizontal rules, and line breaks
- Custom `UploadRenderer` prop for rendering upload nodes
- Custom `BlockRenderer` prop for rendering block and inline block nodes
- TypeScript types for all Lexical node types
