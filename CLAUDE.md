# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Vite dev server for the React frontend.
- `npm run dev:api` — Node backend (`server.mjs`) on port 8787. Required only for image-to-3D generation; the frontend boots fine without it because two cached GLBs in `public/generated-models/` are seeded into the cell list (`SEEDED_GENERATED_CELLS` in `src/App.jsx`).
- `npm run build` — Production Vite build to `dist/`.
- `npm run lint` — ESLint flat config (`eslint.config.js`), JS/JSX only. No test runner is configured.
- `npm run preview` — Serve the built bundle.

Backend secrets live in `.env.local` (gitignored, copied from `.env.example`). The frontend never sees these — `server.mjs` reads `.env.local` itself via `loadLocalEnv()`. Frontend-side, `MODEL_API_BASE` (default `http://127.0.0.1:8787`) can be overridden with `VITE_MODEL_API_BASE`.

## Architecture

### Two-process split

The app is a Vite React SPA that talks to a separate Node HTTP backend. The split exists so the Tripo API key never reaches the browser bundle. The frontend calls only `/api/3d/*` routes; everything provider-specific (Tripo STS uploads, AWS sigv4 signing, Hunyuan polling, GLB caching) lives in `server.mjs`.

Frontend → backend contract (`server.mjs`):
- `POST /api/3d/generate` — body `{ provider, imageDataUrl, fileName, prompt? }`, returns `{ taskId, provider, raw }`.
- `GET  /api/3d/status/:taskId?provider=...` — returns `{ status, progress, modelUrl, rawModelUrl, ... }` where `modelUrl` is always a backend-proxied URL safe for the browser (`/api/3d/model?url=...` for remote, `/api/3d/local-model/:id.glb` for cached).
- `GET  /api/3d/model?url=...` — streams remote GLBs with the Tripo bearer if needed; only allows HTTPS or localhost URLs.
- `GET  /api/3d/local-model/:id.glb` — serves Hunyuan base64 GLBs that were cached to `LOCAL_MODEL_DIR` (default `.generated-models/`, gitignored).
- `GET  /api/3d/health` — provider configuration probe.

### Provider model

Two image-to-3D providers, selected from Settings (`generationProvider` in localStorage `bio-demo-settings`):
- `tripo` — Cloud only. Flow: `/upload/sts/token` → AWS sigv4 PUT to S3 (signing implemented inline in `uploadToTripoObjectStorage`) → `POST /task` with `image_to_model` → poll `GET /task/:id`.
- `hunyuan` — Local server (default `http://127.0.0.1:8081`). Flow: `POST /send` with base64 image → poll `GET /status/:uid`. If the response contains `model_base64`/`glb_base64`, the backend writes it to `LOCAL_MODEL_DIR` and serves it from `/api/3d/local-model/`.
- `auto` — Frontend-side fallback chain (see `getProviderPlan` in `src/App.jsx`): try Tripo, then Hunyuan on failure. The retry happens client-side, not in the backend.

`HTTPS_PROXY`/`HTTP_PROXY` env vars install an undici `ProxyAgent` for outbound calls; localhost requests skip the proxy via `shouldUseProxy`.

### Frontend layout

`src/App.jsx` is intentionally a single ~2600-line file containing constants, pure helpers, all React components, the React Three Fiber scene, and the top-level `App` container. There is no component directory. When editing, search by function name (e.g. `CellScene`, `CenterStage`, `WorkspaceDrawer`, `generateCustomCellModel`).

Important shape:
- **Cell catalog** — `CELL_TYPES` (built-ins), `SEEDED_GENERATED_CELLS` (committed demo GLBs), and user-uploaded custom cells stored in localStorage (`bio-demo-custom-cells`). `getAllCells` merges them in display order.
- **Custom cells fall back to procedural geometry.** Each custom cell has a `template` field pointing at a built-in cell id; until a real GLB URL is set on `cell.generation.modelUrl`, `CellScene` renders the procedural `CellModel` for that template instead. See `getModelCellId` and the `GeneratedGlbModel` vs `CellModel` branch inside `CellScene`.
- **Procedural cell rendering** — `CellModel` + `CellSpecificStructures` + `PlantCellModel` build different organelle arrangements based on `cellId`. `CELL_BODY` defines outer shell color/scale/kind. Selection is propagated via `ClickableGroup`'s `id` prop.
- **GLB export** — `exportObjectAsGlb` uses `GLTFExporter` from `three/examples/jsm`. The scene exposes its root through `SceneExportBridge` → `onExporterReady`, and `App.handleExport` invokes the captured exporter.
- **Persistence** — All user state goes through `loadStoredValue`/`storeValue` against localStorage. Keys: `bio-demo-settings`, `bio-demo-custom-cells`, `bio-demo-gallery`, `bio-demo-notes`, `bio-demo-label-visible`. Settings are versioned via `SETTINGS_STORAGE_VERSION` and migrated by `normalizeSettings`.
- **Generation lifecycle** — `App.generateCustomCellModel` orchestrates the provider chain, calling `create3dGeneration` → `waitFor3dModel` and patching the custom cell's `generation` field at each transition (`uploading` → `processing` → `success`/`failed`). `handleRetryGeneration` re-runs the same flow against the cell's stored `imageUrl`.

### Cached demo models

`public/generated-models/*.glb` are committed and referenced by `SEEDED_GENERATED_CELLS` so the demo works without API credits. Do not confuse this directory with `.generated-models/` (gitignored runtime cache for Hunyuan base64 outputs on the backend).
