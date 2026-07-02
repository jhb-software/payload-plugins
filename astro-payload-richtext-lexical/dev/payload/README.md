# Payload authoring app

A minimal Payload + Next.js app used to preview the Astro Lexical renderer against
**real Payload output** instead of hand-authored Lexical JSON. Build tables (and other
rich text) in the actual Lexical editor here, then render them with the Astro `dev/astro` app.

Uses SQLite (`payload.db`, created on first run) so no database server is required.

## Run the preview

1. Start this Payload app (serves the REST API and admin on port 3000):

   ```sh
   pnpm --filter astro-payload-richtext-lexical-payload-app dev
   ```

   On first run it seeds a "Table rendering demo" document covering a header row, a
   row-header column, and `colspan`/`rowspan`. Edit it (or add documents) in the admin
   at <http://localhost:3000/admin> — auto-login is enabled.

2. In a second terminal, start the Astro `dev/astro` app and point it at Payload:

   ```sh
   cd ../astro && PAYLOAD_URL=http://localhost:3000 pnpm dev
   ```

   Open <http://localhost:4321> to see every document rendered through the plugin, or
   <http://localhost:4321/preview/1> for a single document. Editing in Payload reloads the
   open preview automatically (Live Preview), or use the editor's Preview button.

If Payload starts on a different port (e.g. 3000 is taken), pass that port via
`PAYLOAD_URL` to the Astro app.
