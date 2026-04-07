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

## Publishing

Publishing is done via the `Release` GitHub Actions workflow (manual dispatch). Select the plugin and bump type (patch/minor/major). The workflow bumps the version in `package.json`, verifies the changelog has a matching `## <version>` heading, publishes to npm, commits the version bump, creates a git tag, and creates a GitHub release. Do not bump versions or publish manually — the changelog entry must be committed beforehand with the target version as the heading.

## Document ID Types

Document IDs must always support both `string` and `number` (MongoDB uses strings, PostgreSQL uses numbers). Use `DefaultDocumentIDType` from `'payload'`, or `number | string` when `payload` is not a dependency.

## Test-Driven Fixes and Features

For every new fix or feature, a failing test must be added **first** that succeeds once the fix/feature is in place. Do not add code changes without a corresponding test that proves the change is necessary.

## Changelog

For every `fix` or `feat` commit, add a new line to the `CHANGELOG.md` of the affected plugin. If there is no section for the upcoming version yet, add an `## Unreleased` heading at the top and list changes under it. When a version is released, the `## Unreleased` heading is replaced with the version number by the release workflow.
