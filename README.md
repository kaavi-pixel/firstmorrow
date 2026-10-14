# Firstmorrow

A persistent pixel-art world where an AI designs structures and a protected simulation validates their effects. This private repository contains the application source, implementation plan, hand-off, and bug tracker.

- **Application:** `application/`
- **Implementation scope:** `implementation-plan.md`
- **Current progress:** `hand-off.md`
- **Defects and fixes:** `bugtracker.md`
- **Runtime and recovery notes:** `application/README.md`

## Development

```sh
cd application
npm ci
npm test
FM_PREVIEW=1 FM_GEOGRAPHY=1 PORT=3000 node --watch server.mjs
```

The preview is isolated and makes no model calls. It uses in-memory storage and does not connect to the production world.

## Production

The existing Vercel project is `firstmorrow`, serving [firstmorrow.world](https://firstmorrow.world). Deploy from `application/`; do not create a replacement Vercel project or reset its data.

Secrets remain in Vercel configuration and must never be committed. Geography, autonomous travel, and boats have separate readiness gates; read the hand-off and bug tracker before enabling unfinished functionality.
