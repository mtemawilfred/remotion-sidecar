// ── renderer.js ───────────────────────────────────────────────────────────
// Bundles the Remotion compositions and renders a scene_json to MP4.
// Routes to the correct composition based on render_type:
//   CHART_SCENE    → ChartScene  (1080×1920, 30fps, 9:16 vertical)
//   COMPOSITION    → SceneComposer (1408×768, 24fps, 16:9)
//   MOTION_GRAPHIC → SceneComposer (1408×768, 24fps, 16:9)
//   anything else  → SceneComposer (safe fallback)

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
  return {
    id:     'SceneComposer',
    width:  sceneJson.width  || 1408,
    height: sceneJson.height || 768,
    fps:    sceneJson.fps    || 24,
  };
}

// ── Main render function ───────────────────────────────────────────────────
async function renderScene(sceneJson) {
  const bp   = await getBundle();
  const spec = getCompositionSpec(sceneJson);

  // ── WHY THE DURATION WAS ALWAYS 10 SECONDS ────────────────────────────
  // The compositions in index.jsx have hardcoded durationInFrames values
  // (e.g. ChartScene has durationInFrames={300} = 10s at 30fps).
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
  const durationInFrames = Math.ceil((sceneJson.duration_ms / 1000) * spec.fps);

  console.log(
    `[renderer] Scene ${sceneJson.scene_id} | Type: ${sceneJson.render_type} | ` +
    `Composition: ${spec.id} | Canvas: ${spec.width}×${spec.height} @ ${spec.fps}fps | ` +
    `Duration: ${sceneJson.duration_ms}ms = ${durationInFrames} frames`
  );

  const outPath = path.join(
    os.tmpdir(),
    `scene_${sceneJson.scene_id}_${Date.now()}.mp4`
  );

  // selectComposition returns composition metadata from index.jsx.
  // The durationInFrames here is the hardcoded preview default — ignore it.
  const composition = await selectComposition({
    serveUrl:   bp,
    id:         spec.id,
    inputProps: { sceneJson },
  });

  await renderMedia({
    // Override durationInFrames on the composition object.
    // Remotion reads duration from here during rendering.
    composition: {
      ...composition,
      durationInFrames,
    },
    serveUrl:   bp,
    codec:      'h264',
    outputLocation: outPath,
    inputProps: { sceneJson },
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
        console.log(`[renderer] Scene ${sceneJson.scene_id} (${spec.id}): ${pct}%`);
      }
    },
  });

  const buffer = fs.readFileSync(outPath);
  fs.unlinkSync(outPath);
  console.log(`[renderer] Scene ${sceneJson.scene_id} complete — ${buffer.length} bytes`);
  return buffer;
}

module.exports = { renderScene };