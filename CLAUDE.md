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

Document IDs must always support both `string` and `number` (MongoDB uses strings, PostgreSQL uses numbers). Use `DefaultDocumentIDType` from `'payload'`, or `number | string` when `payload` is not a dependency.

## Plugin Endpoints

Plugin endpoints must be **REST-style** and **agent-friendly**.

### Path Convention

Endpoint paths must follow `/<package-slug>/<resource>`:

- `alt-text`: `/alt-text/generate`, `/alt-text/generate/bulk`, `/alt-text/health`
- `content-translator`: `/content-translator/translate`
- `cloudinary`: `/cloudinary/generate-signature`

### Request Validation

All endpoints must validate request bodies with **Zod schemas**. Define the schema inline in the handler and call `.parse(data)` on the request body.

### Error Response Structure

All endpoints must return a consistent JSON error shape using `Response.json()`:

```json
{ "error": "Human-readable message" }
```

For validation errors (400), include a `details` array:

```json
{
  "error": "Validation failed",
  "details": [{ "path": "fieldName", "message": "Expected string, received number" }]
}
```

Standard status codes:
- `400` — validation errors (Zod) or bad request
- `401` — unauthorized (access check failed)
- `403` — forbidden
- `404` — resource not found
- `500` — server/internal errors

**Do not** use `throw new APIError(...)` in endpoint handlers — always return `Response.json(...)` explicitly for a predictable, agent-parseable response.

### Error Handling Pattern

```typescript
try {
  // access check
  if (!(await access({ req }))) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // parse & validate
  const data = await req.json?.()
  const { field } = schema.parse(data)
  // ... business logic ...
  return Response.json(result)
} catch (error) {
  if (error instanceof ZodError) {
    return Response.json(
      { error: 'Validation failed', details: error.issues.map(e => ({ path: e.path.join('.'), message: e.message })) },
      { status: 400 },
    )
  }
  return Response.json(
    { error: error instanceof Error ? error.message : 'Unknown error' },
    { status: 500 },
  )
}
```

## Test-Driven Fixes and Features

For every new fix or feature, a failing test must be added **first** that succeeds once the fix/feature is in place. Do not add code changes without a corresponding test that proves the change is necessary.
