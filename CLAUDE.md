# Development Guidelines

## Conventional Commits

All commit messages **must** follow the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <description>
```

- **Types**: `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `release`, `refactor`, `revert`, `style`, `test`
- **Scopes** (optional): `admin-search`, `alt-text`, `astro-payload-richtext-lexical`, `cloudinary`, `content-translator`, `geocoding`, `pages`
- **Description**: lowercase, imperative mood, no period at the end

Examples:
- `feat(pages): add breadcrumb navigation`
- `fix(cloudinary): handle missing API key gracefully`
- `chore: update dependencies`
- `docs(alt-text): improve README examples`

This is enforced by a `commit-msg` git hook via commitlint. PR titles follow the same format (enforced by CI).

## Document ID Types

All document IDs **must** support both `string` and `number` to ensure compatibility with MongoDB (string ObjectIds) and PostgreSQL (numeric IDs). Never type a document ID as only `string` or only `number`.

- **Prefer** using the `DefaultDocumentIDType` type exported from `'payload'` (e.g., `import type { DefaultDocumentIDType } from 'payload'`)
- **Fallback** to `number | string` when `payload` is not a dependency (e.g., in the `astro-payload-richtext-lexical` package)
- This applies to all ID fields: document IDs, relationship values, array/block item IDs, and any other references to Payload document IDs

## Test-Driven Fixes and Features

For every new fix or feature, a failing test must be added **first** that succeeds once the fix/feature is in place. Do not add code changes without a corresponding test that proves the change is necessary.
