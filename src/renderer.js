// ── renderer.js ───────────────────────────────────────────────────────────
// Bundles the Remotion compositions and renders a scene_json to MP4.
// Routes to the correct composition based on render_type:
//   CHART_SCENE          → ChartScene          (1080×1920, 30fps, 9:16 vertical)
//   NARRATOR_EXPLAINER   → SceneComposerVertical(1080×1920, 30fps, 9:16 vertical)
//   REPURPOSE_SCENE      → RepurposeScene       (1080×1920, 30fps, 9:16 vertical)
//   REPURPOSE_LONG_FORM  → RepurposeLongForm    (1920×1080, 30fps, 16:9 landscape)
//   COMPOSITION          → SceneComposer        (1408×768,  24fps, 16:9)
//   MOTION_GRAPHIC       → SceneComposer        (1408×768,  24fps, 16:9)
//   anything else        → SceneComposer        (safe fallback)
//
// REPURPOSE_SCENE / REPURPOSE_LONG_FORM FILE HANDLING:
//   The scene_json for both repurpose types contains base64-encoded files
//   (source video, audio chunks, CTA banner, BGM) because n8n and this
//   sidecar are separate Railway services with no shared filesystem.
//   setupRepurposeFiles() decodes those files into a temp dir under
//   /app/tmp_renders/, which is served statically by server.js.
//   It then rewrites the scene_json with http://localhost:PORT/... URLs
//   so Remotion's OffthreadVideo and Audio components can fetch them.
//   The temp dir is deleted immediately after the render completes.
//
// BGM STRATEGY — two-tier:
//   Primary:  bg_music_b64 in payload (picked from Google Drive by n8n)
//   Fallback: random file from local assets/bgm/ (baked into Docker image)
//   If both fail, video renders without background music (non-fatal).

const path = require('path');
const os   = require('os');
const fs   = require('fs');

const { bundle }                         = require('@remotion/bundler');
const { renderMedia, selectComposition } = require('@remotion/renderer');

// ── Bundle cache ──────────────────────────────────────────────────────────
// Bundle once per process lifetime. All compositions live in the same bundle
// so this is safe. Routing to the right composition happens at
// selectComposition time, not at bundle time.
let bundlePath = null;

async function getBundle() {
  if (bundlePath) return bundlePath;

  console.log('[renderer] Bundling Remotion compositions — first render only...');

  const assetsPath = path.resolve(__dirname, '../assets');
  console.log('[renderer] Assets check:', {
    assetsExists: fs.existsSync(assetsPath),
    bgmFiles: fs.existsSync(`${assetsPath}/bgm`)
      ? fs.readdirSync(`${assetsPath}/bgm`)
      : 'MISSING',
    sfxFiles: fs.existsSync(`${assetsPath}/sfx`)
      ? fs.readdirSync(`${assetsPath}/sfx`)
      : 'MISSING',
  });

  bundlePath = await bundle({
    entryPoint:      path.resolve(__dirname, 'composition/index.jsx'),
    webpackOverride: (config) => config,
    publicDir:       path.resolve(__dirname, '../'),
  });

  console.log('[renderer] Bundle complete:', bundlePath);
  return bundlePath;
}

// ── Composition routing ───────────────────────────────────────────────────
function getCompositionSpec(sceneJson) {
  if (sceneJson.render_type === 'CHART_SCENE') {
    return {
      id:     'ChartScene',
      width:  sceneJson.width  || 1080,
      height: sceneJson.height || 1920,
      fps:    sceneJson.fps    || 30,
    };
  }
  if (sceneJson.render_type === 'REPURPOSE_SCENE') {
    return {
      id:     'RepurposeScene',
      width:  sceneJson.canvas?.w || 1080,
      height: sceneJson.canvas?.h || 1920,
      fps:    sceneJson.fps       || 30,
    };
  }
  if (sceneJson.render_type === 'REPURPOSE_LONG_FORM') {
    return {
      id:     'RepurposeLongForm',
      width:  sceneJson.canvas?.w || 1920,
      height: sceneJson.canvas?.h || 1080,
      fps:    sceneJson.fps       || 30,
    };
  }
  // NARRATOR_EXPLAINER (RedPill faceless-narrator short-form) → vertical 9:16.
  // Reuses the SceneComposer 4-layer engine but at 1080×1920 @ 30fps via the
  // dedicated SceneComposerVertical composition registered in composition/index.jsx.
  // IMPORTANT: routing keys on render_type (NOT orientation) — this matches the
  // existing router pattern and what Workflow B's Build Scene Payload actually sends.
  if (sceneJson.render_type === 'NARRATOR_EXPLAINER') {
    return {
      id:     'SceneComposerVertical',
      width:  sceneJson.width  || 1080,
      height: sceneJson.height || 1920,
      fps:    sceneJson.fps    || 30,
    };
  }
  // Default: SceneComposer handles COMPOSITION, MOTION_GRAPHIC, and anything else
  return {
    id:     'SceneComposer',
    width:  sceneJson.width  || 1408,
    height: sceneJson.height || 768,
    fps:    sceneJson.fps    || 24,
  };
}

// ── REPURPOSE file setup ──────────────────────────────────────────────────
// Called for both REPURPOSE_SCENE and REPURPOSE_LONG_FORM.
//
// WHY THIS IS NEEDED:
//   n8n and this sidecar are separate Railway services — no shared /tmp.
//   The payload carries source_video_b64, cta_banner_b64, audio_b64 per
//   freeze segment, and optionally bg_music_b64. We decode all of those
//   into a temp dir, serve them via the Express static route
//   /public/tmp_renders (configured in server.js), and rewrite the
//   scene_json with http://localhost:PORT/... URLs for Remotion.
//
// CLEANUP:
//   The temp dir is returned as cleanupDir and deleted in renderScene()
//   immediately after the MP4 buffer is read.
//
// Returns:
//   { sceneJson: transformedSceneJson, cleanupDir: '/app/tmp_renders/...' }
async function setupRepurposeFiles(sceneJson) {
  const PORT = process.env.PORT || 3000;

  // Unique temp dir: folder_name + timestamp to avoid collisions under
  // N8N_CONCURRENCY_PRODUCTION_LIMIT=3 (up to 3 concurrent renders)
  const dirName = `${sceneJson.folder_name}_${Date.now()}`;
  const tmpDir  = path.resolve(__dirname, '../tmp_renders', dirName);
  const baseUrl = `http://localhost:${PORT}/public/tmp_renders/${dirName}`;

  fs.mkdirSync(tmpDir, { recursive: true });

  console.log(`[renderer] ${sceneJson.render_type} file setup → ${tmpDir}`);

  // ── Decode source video ─────────────────────────────────────────────────
  const srcVideoPath = path.join(tmpDir, 'source.mp4');
  fs.writeFileSync(srcVideoPath, Buffer.from(sceneJson.source_video_b64, 'base64'));
  const srcVideoMB = (fs.statSync(srcVideoPath).size / 1024 / 1024).toFixed(1);
  console.log(`[renderer] Source video written: ${srcVideoMB} MB`);

  // ── Decode CTA banner ───────────────────────────────────────────────────
  const ctaPath = path.join(tmpDir, 'cta_banner.png');
  fs.writeFileSync(ctaPath, Buffer.from(sceneJson.cta_banner_b64, 'base64'));

  // ── Decode audio chunks and rewrite sequence ────────────────────────────
  // Each freeze segment carries audio_b64 (a WAV file encoded as base64).
  // We decode it to disk and replace audio_b64 with audio_url.
  const transformedSequence = sceneJson.sequence.map(seg => {
    if (seg.type !== 'freeze') return seg;

    const audioFileName = `audio_${seg.segment_id}.wav`;
    const audioPath     = path.join(tmpDir, audioFileName);
    fs.writeFileSync(audioPath, Buffer.from(seg.audio_b64, 'base64'));

    // Replace base64 payload with a URL Remotion can fetch
    const { audio_b64, ...rest } = seg;
    return {
      ...rest,
      audio_url: `${baseUrl}/${audioFileName}`,
    };
  });

  // ── BGM: primary from payload, fallback to local assets/bgm/ ───────────
  //
  // Primary: n8n picks a track from Google Drive and passes it as
  //   bg_music_b64. We decode it into tmpDir and serve it via Express.
  //
  // Fallback: if the payload has no BGM (Drive pick failed, node skipped,
  //   or n8n connection issue), we pick a random track from the local
  //   assets/bgm/ folder baked into the Docker image.
  //
  // If both fail, bg_music_url stays null and the composition renders
  //   the video without background music — non-fatal.
  let bg_music_url = null;

  if (sceneJson.bg_music_b64) {
    // ── Primary: decode BGM from payload ───────────────────────────────────
    try {
      const bgmExt      = (sceneJson.bg_music_name || 'track.mp3').split('.').pop().toLowerCase();
      const bgmFileName = `bg_music.${bgmExt}`;
      const bgmFilePath = path.join(tmpDir, bgmFileName);
      fs.writeFileSync(bgmFilePath, Buffer.from(sceneJson.bg_music_b64, 'base64'));
      bg_music_url = `${baseUrl}/${bgmFileName}`;
      console.log(`[renderer] BGM from Drive: ${sceneJson.bg_music_name || bgmFileName}`);
    } catch (err) {
      console.warn(`[renderer] BGM decode failed — trying local fallback: ${err.message}`);
    }
  }

  if (!bg_music_url) {
    // ── Fallback: pick random from local assets/bgm/ ───────────────────────
    try {
      const bgmDir   = path.resolve(__dirname, '../assets/bgm');
      const bgmFiles = fs.readdirSync(bgmDir).filter(f => f.endsWith('.mp3'));
      if (bgmFiles.length > 0) {
        const randomBgm = bgmFiles[Math.floor(Math.random() * bgmFiles.length)];
        bg_music_url    = `http://localhost:${PORT}/public/assets/bgm/${encodeURIComponent(randomBgm)}`;
        console.log(`[renderer] BGM fallback (local): ${randomBgm}`);
      } else {
        console.log('[renderer] No local BGM files found — rendering without background music');
      }
    } catch (err) {
      console.warn(`[renderer] BGM local fallback failed (non-fatal): ${err.message}`);
    }
  }

  // ── Build transformed scene_json ────────────────────────────────────────
  // Strip all large base64 fields — they have been written to disk.
  // Replace with http:// URLs that Remotion's OffthreadVideo / Audio / Img
  // components can fetch from the Express static server.
  const { source_video_b64, cta_banner_b64, bg_music_b64, bg_music_name, ...rest } = sceneJson;
  const transformedSceneJson = {
    ...rest,
    source_video_url: `${baseUrl}/source.mp4`,
    cta_banner_url:   `${baseUrl}/cta_banner.png`,
    bg_music_url,     // null if both primary and fallback failed — handled in composition
    sequence:         transformedSequence,
  };

  console.log(`[renderer] File setup complete. URLs rooted at: ${baseUrl}`);

  return {
    sceneJson:  transformedSceneJson,
    cleanupDir: tmpDir,
  };
}

// ── Main render function ───────────────────────────────────────────────────
async function renderScene(sceneJson) {
  const bp   = await getBundle();
  const spec = getCompositionSpec(sceneJson);

  // ── REPURPOSE types: decode base64 files into temp dir ─────────────────
  // Both REPURPOSE_SCENE and REPURPOSE_LONG_FORM share the same file setup
  // logic — same base64 payload format, same temp dir / static serving pattern.
  // All other render types pass through unchanged.
  let activeSceneJson = sceneJson;
  let cleanupDir      = null;

  if (
    sceneJson.render_type === 'REPURPOSE_SCENE' ||
    sceneJson.render_type === 'REPURPOSE_LONG_FORM'
  ) {
    const setup     = await setupRepurposeFiles(sceneJson);
    activeSceneJson = setup.sceneJson;
    cleanupDir      = setup.cleanupDir;
  }

  // ── WHY THE DURATION WAS ALWAYS 10 SECONDS ────────────────────────────
  // The compositions in index.jsx have hardcoded durationInFrames values
  // (e.g. RepurposeScene has durationInFrames={300} = 10s at 30fps).
  // These are PREVIEW defaults for Remotion Studio only.
  //
  // selectComposition() returns that hardcoded value on the composition object.
  // If you pass that object to renderMedia() unchanged, it uses the hardcoded
  // 300 frames — ignoring duration_ms from scene_json completely.
  //
  // The fix requires TWO things:
  //   1. Override durationInFrames ON the composition object (spread + override)
  //   2. Pass durationInFrames as a top-level param to renderMedia
  // Both are required. Doing only one still produces the wrong duration.
  const durationInFrames = Math.ceil(
    (activeSceneJson.duration_ms / 1000) * spec.fps
  );

  console.log(
    `[renderer] Scene ${activeSceneJson.scene_id} | Type: ${activeSceneJson.render_type} | ` +
    `Composition: ${spec.id} | Canvas: ${spec.width}×${spec.height} @ ${spec.fps}fps | ` +
    `Duration: ${activeSceneJson.duration_ms}ms = ${durationInFrames} frames`
  );

  const outPath = path.join(
    os.tmpdir(),
    `scene_${activeSceneJson.scene_id}_${Date.now()}.mp4`
  );

  // selectComposition returns composition metadata from index.jsx.
  // The durationInFrames here is the hardcoded preview default — ignore it.
  const composition = await selectComposition({
    serveUrl:   bp,
    id:         spec.id,
    inputProps: { sceneJson: activeSceneJson },
  });

  await renderMedia({
    // Override durationInFrames on the composition object.
    // Remotion reads duration from here during rendering.
    composition: {
      ...composition,
      durationInFrames,
    },
    serveUrl:        bp,
    codec:           'h264',
    outputLocation:  outPath,
    inputProps:      { sceneJson: activeSceneJson },
    // Also pass as top-level param — both are required.
    durationInFrames,
    chromiumOptions: {
      executablePath:     process.env.REMOTION_CHROMIUM_PATH || '/usr/bin/chromium',
      disableWebSecurity: true,
    },
    fps:    spec.fps,
    width:  spec.width,
    height: spec.height,
    onProgress: ({ progress }) => {
      const pct = Math.round(progress * 100);
      if (pct % 25 === 0) {
        console.log(`[renderer] Scene ${activeSceneJson.scene_id} (${spec.id}): ${pct}%`);
      }
    },
  });

  const buffer = fs.readFileSync(outPath);
  fs.unlinkSync(outPath);

  // ── Clean up repurpose temp files ────────────────────────────────────────
  // Source video + audio chunks + BGM can be large. Delete immediately after
  // the render buffer is in memory to avoid filling the Railway volume.
  if (cleanupDir) {
    try {
      fs.rmSync(cleanupDir, { recursive: true, force: true });
      console.log(`[renderer] Temp files cleaned up: ${cleanupDir}`);
    } catch (err) {
      console.warn(`[renderer] Temp dir cleanup failed (non-fatal): ${err.message}`);
    }
  }

  console.log(`[renderer] Scene ${activeSceneJson.scene_id} complete — ${buffer.length} bytes`);
  return buffer;
}

module.exports = { renderScene };