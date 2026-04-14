# Development Guidelines

## Dev Servers

Each plugin has a Next.js test app in its `dev/` directory. Start with `pnpm dev` from there (or use `PORT=<port> pnpm --filter <test-app-name> dev` from the root). Use different ports to run multiple plugins simultaneously.

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

## UI Components and Styling

Plugin custom components should use Payload's built-in UI components (e.g. `Pill`, `Button` from `@payloadcms/ui`) and CSS variables (e.g. `var(--style-radius-m)`, `var(--theme-elevation-500)`) instead of custom styles wherever possible. This ensures visual consistency with the Payload admin panel.

## Icons

All icons used in custom Payload components must come from the [Geist icon set](https://github.com/jarvis394/geist-icons/tree/main/source). Copy the SVG markup from the source files, replace `fill="white"` with `fill="currentColor"`, and wrap it in a React component. Do not use custom or third-party icon SVGs.

## Document ID Types

Document IDs must always support both `string` and `number` (MongoDB uses strings, PostgreSQL uses numbers). Use `DefaultDocumentIDType` from `'payload'`, or `number | string` when `payload` is not a dependency.

## Test-Driven Fixes and Features

For every new fix or feature, a failing test must be added **first** that succeeds once the fix/feature is in place. For bug fixes, the failing test must reproduce the bug as a user would observe it (wrong response, wrong UI state, wrong DB row) — not merely exercise the line being changed.

Every test must justify its existence by verifying meaningful behavior. A test earns its place only if **all** of these hold:

- It describes a user- or API-visible behavior, not an implementation detail.
- Inverting the implementation (flipping a branch, returning the opposite, deleting a guard) would make it fail.
- It survives a reasonable refactor of the code under test.
- It does not restate what TypeScript, a schema, or a constant already guarantees.

**Do not add** render-without-crashing smoke tests, prop-passthrough assertions, tests whose assertions only check that a mock was called, or tests added to hit a coverage number.

Default to integration tests against real Payload / real React rendering. Reach for unit tests only for pure logic with non-trivial branches. Only stub external boundaries: network, filesystem, time, randomness, LLM providers, third-party SDKs. If a test requires mocking the module under test's close collaborators, test at a higher level instead.

Name each test by the behavior it protects in one sentence (*"rejects a confirmation when the tool call id is unknown"*), not by the method it calls (*"calls handleConfirm with false"*).

## Changelog

For every `fix` or `feat` commit, add a new line to the `CHANGELOG.md` of the affected plugin. If there is no section for the upcoming version yet, add an `## Unreleased` heading at the top and list changes under it. When a version is released, the `## Unreleased` heading is replaced with the version number by the release workflow.
