# Viewer Module Split

## Goal

Make future viewer features easier to add by splitting the large `viewer.ts` file into server/API, HTML shell, CSS, and browser-side client modules.

## Scope

- Keep `src/viewer.ts` focused on Fastify routes and API composition.
- Move HTML shell rendering to `src/viewer-html.ts`.
- Move CSS to `src/viewer-styles.ts`.
- Move browser-side JavaScript to `src/viewer-client.ts`.
- Add a focused test for the extracted HTML renderer.
- Keep behavior unchanged.

## Verification

- `npm.cmd test -- tests/viewer-html.test.ts`
- `npm.cmd test -- tests/viewer.test.ts`
- `npm.cmd test`
- `npm.cmd run build`
- Browser smoke test against a local dev server
