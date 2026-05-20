# Remotion Sidecar

Brand-agnostic scene renderer for the PipsGravity video pipeline.

## What it does

Receives a complete scene JSON from n8n Workflow B via POST /render-scene.
Returns a rendered MP4 clip. Every brand value — colors, fonts, BGM track —
comes from the scene JSON. Nothing is hardcoded.

## Endpoints

```
POST /render-scene    — receives scene JSON, returns MP4 binary
GET  /health          — returns { status: 'ok' }
```

## Environment variables

None required. PORT is assigned by Railway automatically.

## Audio assets

All SFX and BGM files are baked into the Docker image at build time.
To add or change audio files, update the assets/ folder and redeploy.

```
assets/sfx/   — 13 sound effect files
assets/bgm/   — 11 background music files
```

## Deployment

Push to GitHub. Connect repo to Railway. Railway builds and deploys automatically.
The Dockerfile handles all Chromium and dependency installation.

## Canvas spec

Width: 1408px | Height: 768px | FPS: 24
Confirmed from live PipsGravity WF2 FFmpeg commands.
