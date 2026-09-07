# 3D Model Studio

[English](README.md) | [中文](README.zh-CN.md)

AI-powered interactive 3D model generation, inspection, and presentation studio.

3D Model Studio is a React + Three.js prototype for turning uploaded reference images or GLB files into a polished interactive 3D workspace. It supports live WebGL orbit controls, a left model library / center stage / right tools workbench, screenshots, GLB export, collapsed upload history, demo presentation mode, a generation queue, and optional image-to-3D providers for generating real 3D models from uploaded reference images.

## Demo

[![3D Model Studio demo](docs/demo/3DCellForge-demo-cover.jpg)](docs/demo/3DCellForge-demo-2026-05-10.mp4)

Open the demo video: [Demo MP4](docs/demo/3DCellForge-demo-2026-05-10.mp4)

## Features

- Interactive model viewer built with React Three Fiber.
- Three-column workbench: Model Library on the left, WebGL stage in the center, asset/generation tools on the right.
- Drag to rotate, scroll to zoom, isolate structure parts, inspect model details, and export the current scene.
- Object-aware inspector with inferred category, source, provider state, material focus, demo value, and tags for vehicles, aircraft, vessels, products, artifacts, and organic specimens.
- Model quality score for generated GLBs, including file size, triangle count, texture count, and demo readiness.
- Demo Mode for screenshots and screen recordings: hides side panels, uses object-aware cinematic camera paths, and shows a clean presentation overlay.
- Productized Model Library drawer with source thumbnails, provider/status, task id, GLB URL actions, comparison, and delete controls.
- Saved Assets stays collapsed by default, while the active generated/imported asset stays pinned and clickable.
- Generated/imported models are restored after refresh through IndexedDB, with localStorage as a compact fallback.
- Generic part detail drawer, asset references, comparison panel, notes, gallery actions, logs, saved projects, and a compact generation queue.
- Hyper3D, Tripo, Fal.ai, Hunyuan3D, JS Depth, and Local GLB generation/import modes.
- Optional Atlas Cloud Hunyuan3D image-to-3D generation with server-side credentials.
- Cached demo GLB models for offline-friendly screenshots and demos.
- Auxiliary Khronos glTF reference models for GLB loader and PBR material checks.
- API key stays server-side in `.env.local`; it is never exposed to the frontend bundle.

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
ATLASCLOUD_API_KEY=your_atlascloud_key
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
Atlas    Atlas Cloud Hunyuan3D GLB generation only
Tripo    Tripo cloud generation only
Fal      Fal.ai queue generation; model is selected in Settings
Auto     Hyper3D first, then Tripo, Fal, Hunyuan, and JS Depth backup
Hunyuan  Local Hunyuan3D generation only
```

The upload panel exposes the full generation mode choice before picking a file:

```text
Hyper3D     Hyper3D Rodin GLB generation
Atlas       Atlas Cloud Hunyuan3D GLB generation
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
