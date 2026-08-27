# Forge3D

[English](README.md) | [中文](README.zh-CN.md)

Open-source, self-hostable 3D asset workbench. It turns scattered 3D generation APIs into one controllable post-processing pipeline — neutral, offline-capable, and batch-ready.

Forge3D is a React + Three.js workbench for turning uploaded reference images or GLB files into a polished interactive 3D workspace. It supports live WebGL orbit controls, a left model library / center stage / right tools workbench, screenshots, GLB export, collapsed upload history, demo presentation mode, a generation queue, and optional image-to-3D providers for generating real 3D models from uploaded reference images.

> **Engine-neutral by design.** Forge3D is not tied to any single 3D vendor. Capabilities are declared in a registry, so adding an engine is a one-line change and the UI picks it up automatically. See [Capability Registry](#capability-registry) below.

## Demo

[![3D Model Studio demo](docs/demo/3DCellForge-demo-cover.jpg)](docs/demo/3DCellForge-demo-2026-05-10.mp4)

Open the demo video: [Demo MP4](docs/demo/3DCellForge-demo-2026-05-10.mp4)

## Features

- Interactive model viewer built with React Three Fiber.
- Three-column workbench: Model Library on the left, WebGL stage in the center, asset/generation tools on the right.
- Drag to rotate, scroll to zoom, isolate structure parts, inspect model details, and export the current scene.
- Object-aware inspector with inferred category, source, provider state, material focus, demo value, and tags for vehicles, aircraft, vessels, products, artifacts, and organic specimens.
- Model quality breakdown across six signals: watertightness, PBR channels, UV coverage, texture resolution, triangle budget, and topological cleanliness. Each check reports *why*, so a low score is actionable — not a mystery number.
- Demo Mode for screenshots and screen recordings: hides side panels, uses object-aware cinematic camera paths, and shows a clean presentation overlay.
- Productized Model Library drawer with source thumbnails, provider/status, task id, GLB URL actions, comparison, and delete controls.
- Saved Assets stays collapsed by default, while the active generated/imported asset stays pinned and clickable.
- Generated/imported models are restored after refresh through IndexedDB, with localStorage as a compact fallback.
- Generic part detail drawer, asset references, comparison panel, notes, gallery actions, logs, saved projects, and a compact generation queue.
- Hyper3D, Tripo, Fal.ai, Hunyuan3D, JS Depth, and Local GLB generation/import modes.
- Cached demo GLB models for offline-friendly screenshots and demos.
- Auxiliary Khronos glTF reference models for GLB loader and PBR material checks.
- API key stays server-side in `.env.local`; it is never exposed to the frontend bundle.

## Capability Registry

Instead of picking a vendor, you pick **what you want to do** and a **preference** (speed / quality / cost). The registry maps that to the best engine available.

```js
// server/providers/registry.mjs
'generate.image-to-model': {
  create: lazyCall(loadTripo, 'createTripoTask'),
  get:    lazyCall(loadTripo, 'getTripoTask'),
  perf:   { speed: 9, quality: 8, cost: 3 },
},
```

Consequences worth knowing:

- **Adding an engine is one entry.** No changes to dispatch, frontend config, or UI.
- **Routing is testable.** `route(capability, { prefer })` is pure and covered by unit tests.
- **Declared-but-unimplemented capabilities are hidden.** Registering `edit.prompt` before wiring it up won't surface a broken option in the UI.
- **Providers load lazily.** A missing SDK or a dead local server takes down that one engine, not the router.

Two HTTP endpoints expose it:

```bash
GET /api/3d/capabilities            # what can I do here, and with which engines
GET /api/3d/route?capability=generate.image-to-model&prefer=fastest
```

### Comparing engines

`scripts/compare.mjs` runs one reference image through every configured engine for a capability and prints a side-by-side table. It doubles as the acceptance test for the registry — if a provider claims a capability and misbehaves, this surfaces it immediately.

```bash
npm run compare -- --image ./reference.png
npm run compare -- --image ./reference.png --providers tripo,fal --prefer fastest
npm run compare -- --dry-run            # list candidates without calling anything
```

### Local optimization

`postprocess.optimize` runs entirely on your machine via [gltf-transform](https://gltf-transform.dev/) — **no API key, no upload, no cost**. This is the first building block of the offline-capable mode.

```bash
npm run optimize -- ./model.glb                                   # report only
npm run optimize -- ./model.glb --ratio 0.5 -o ./model.small.glb   # write result
```

Pipeline: `dedup → prune → weld → simplify → compress`. Order matters — dedup before prune, weld before simplify, compress last.

Measured on the 57.7 MB sample asset in `public/generated-models/`:

| ratio | compress | size | triangles | time |
|---|---|---|---|---|
| 1.0 | meshopt | 12.4 MB (−78%) | unchanged | 3.3s |
| 1.0 | draco | 7.5 MB (−87%) | unchanged | 5.2s |
| 0.5 | meshopt | 7.7 MB (−87%) | −50% | 3.3s |
| 0.5 | draco | **5.3 MB (−91%)** | −50% | 4.4s |
| 0.25 | meshopt | 5.2 MB (−91%) | −75% | 3.4s |

Draco compresses harder; meshopt decodes faster. Start with meshopt unless size is critical.

Texture compression (KTX2/WebP) is deliberately not enabled — it needs `sharp`, a native dependency. That's the biggest remaining win; see the TODO in `server/optimize.mjs`.

### Offline by design

Three things fetch from the network in a naive setup. All three are handled locally here:

- **Draco decoder** — drei's `useGLTF` defaults to `gstatic.com`. `npm run decoders` copies three's own decoders into `public/decoders/` (wired via `predev`/`prebuild`).
- **IBL environment** — HDRIs normally come from a CDN. Every preset in `src/viewer/environments.js` is generated from `Lightformer` geometry instead.
- **Optimization** — runs locally, as above.

### Feature flag

`CAPABILITY_ROUTER=off` in `.env.local` falls back to the original provider dispatch. The legacy path is kept intact, so the registry refactor is always one line away from being bypassed.

## Tech Stack

- React
- Vite
- Three.js
- React Three Fiber
- Drei
- Framer Motion
- Tripo API optional backend
- Fal.ai optional backend
- Hunyuan3D local API optional backend

## Quick Start

```bash
npm install
npm run dev
```

Open the Vite URL shown in the terminal.

## Workbench Workflow

The default screen is intentionally quiet:

- Pick the active generated/imported asset from the left `Model Library` rail.
- Earlier generated/imported models are tucked under `Saved Assets` until expanded.
- Use the right `Asset Source` rail to choose the generation provider or import a local `.glb` / `.gltf`.
- Watch upload/generation/import state in the left `Generation Queue` panel.
- Click `Info` or `Inspect` only when you need the part detail drawer.
- Open top-nav `Library` for the full asset catalog with previews, provider state, task ids, GLB URL copy, provider comparison, and deletion.
- Click `Demo` in the top navigation to enter a clean presentation mode for screenshots and recordings.
- Check the quality card on the stage before recording; low scores usually mean the source image or provider result is not demo-ready.
- Demo animation adapts to the model name and metadata: cars use a road push-in, aircraft use a flight pass, ships/carriers use a naval cruise, and organic/specimen assets use a studio orbit.

Useful validation commands:

```bash
npm run lint
npm run build
npm run test
npm run test:visual
```

`npm run test:visual` runs Playwright layout and screenshot regression checks for the workbench, the Model Library drawer, and Demo Mode. Use `npm run test:visual:update` only when an intentional UI change needs new screenshot baselines.

## Optional Image-to-3D Backend

To enable image-to-3D generation, create `.env.local`:

```bash
cp .env.example .env.local
```

Then set:

```bash
TRIPO_API_KEY=your_tripo_key
FAL_API_KEY=your_fal_key
RODIN_API_KEY=your_rodin_api_key
OPENAI_API_KEY=your_openai_key
API_HOST=127.0.0.1
```

`OPENAI_API_KEY` enables optional image understanding through `/api/3d/analyze`. When configured, uploads are classified by vision into asset type, material focus, inspection notes, scene profile, tags, and a better image-to-3D prompt. Without it, the app keeps using local filename/metadata heuristics.

For Hunyuan3D local backup mode, start your local Hunyuan3D API server and set:

```bash
HUNYUAN_API_BASE=http://127.0.0.1:8081
HUNYUAN_CREATE_PATH=/send
HUNYUAN_STATUS_PATH=/status
```

The 3D generation backend supports these provider paths:

```text
Hyper3D  Hyper3D Rodin cloud generation only (default)
Tripo    Tripo cloud generation only
Fal      Fal.ai queue generation; model is selected in Settings
Auto     Hyper3D first, then Tripo, Fal, Hunyuan, and JS Depth backup
Hunyuan  Local Hunyuan3D generation only
```

The upload panel exposes the full generation mode choice before picking a file:

```text
Hyper3D     Hyper3D Rodin GLB generation
Tripo       Tripo cloud GLB generation
Fal         Fal.ai queue GLB generation
Hunyuan     Local Hunyuan3D GLB generation
JS Depth    Browser-side image relief with layered PNG fallback
Auto        Hyper3D, Tripo, Fal, Hunyuan, then JS Depth fallback
Local GLB   Import an existing .glb or self-contained .gltf
```

Tripo uploads use the current STS object-storage flow (`/upload/sts/token`) before creating an `image_to_model` task.
Fal uploads use the official `@fal-ai/client` storage and queue APIs. Supported Fal models are Hunyuan3D v2, TRELLIS, TripoSR, Tripo3D v2.5, and Hyper3D Rodin. Pick the active Fal model in `Settings`.
Rodin uploads use Hyper3D's multipart `/rodin` task API, then poll `/status` and cache the GLB returned by `/download`.
Generated GLBs are cached by the Node backend under `.generated-models/`, so later views use the local copy instead of temporary provider URLs.
The frontend model library is saved in IndexedDB, so successful generated/imported model records survive page refreshes.

You can also import a local `.glb` or self-contained `.gltf` from the `New Upload` button. Imported models become custom workspace models and are served from the same local cache.

Expected Hunyuan3D local API shape:

```text
POST /send
GET  /status/:uid
```

The status response can return either a remote model URL or a base64 GLB field such as `model_base64` / `glb_base64`. Base64 GLBs are cached under `.generated-models/` and served by the Node backend.

Start the backend:

```bash
npm run dev:api
```

Then start the frontend:

```bash
npm run dev
```

The frontend talks to the local Node backend at `http://127.0.0.1:8787` by default.

## Demo Models

The repository includes cached generated GLB files under:

```text
public/generated-models/
```

These make the demo usable without spending API credits on every run.

## Reference Models

The Library panel includes remote Khronos glTF Sample Models as auxiliary references for material and loader checks:

- Transmission Test, CC0, Adobe via Khronos.
- Transmission Roughness Test, CC-BY 4.0, Ed Mackey / Analytical Graphics via Khronos.
- Mosquito In Amber, CC-BY 4.0, Loic Norgeot / Geoffrey Marchal / Sketchfab via Khronos.

These are loaded from the archived Khronos sample repository and are not bundled into this repo.

## Security

Do not put real API keys in frontend code. Keep secrets in `.env.local`, which is ignored by git.

## License

MIT
