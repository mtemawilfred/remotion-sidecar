// ── renderer.js ───────────────────────────────────────────────────────────
// Bundles the Remotion compositions and renders a scene_json to MP4.
// Routes to the correct composition based on render_type:
//   CHART_SCENE              → ChartScene  (1080×1920, 30fps, 9:16 vertical)
//   COMPOSITION              → SceneComposer (1408×768, 24fps, 16:9)
//   MOTION_GRAPHIC           → SceneComposer (1408×768, 24fps, 16:9)
//   anything else            → SceneComposer (safe fallback)

const path = require('path');
const os   = require('os');
const fs   = require('fs');

const { bundle }                         = require('@remotion/bundler');
const { renderMedia, selectComposition } = require('@remotion/renderer');

// ── Bundle cache ──────────────────────────────────────────────────────────
// Bundle once per process lifetime. Subsequent renders reuse the bundle.
// This is safe because the bundle contains ALL compositions — routing
// happens at selectComposition time, not at bundle time.
let bundlePath = null;

async function getBundle() {
  if (bundlePath) return bundlePath;

  console.log('[renderer] Bundling Remotion compositions — first render only...');

  // ── Diagnostic: confirm assets exist in Docker image ──────────────────
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
    entryPoint: path.resolve(__dirname, 'composition/index.jsx'),
    webpackOverride: (config) => config,
    // publicDir at repo root so /public/assets/bgm/... resolves correctly
    publicDir: path.resolve(__dirname, '../'),
  });

  console.log('[renderer] Bundle complete:', bundlePath);
  return bundlePath;
}

// ── Composition routing ───────────────────────────────────────────────────
// Returns the Remotion composition ID and canvas spec for a given scene_json.
function getCompositionSpec(sceneJson) {
  if (sceneJson.render_type === 'CHART_SCENE') {
    return {
      id:     'ChartScene',
      width:  sceneJson.width  || 1080,
      height: sceneJson.height || 1920,
      fps:    sceneJson.fps    || 30,
    };
  }

  // SceneComposer handles COMPOSITION, MOTION_GRAPHIC, and anything else.
  // WF-MG injects width:1280, height:720 for motion graphics.
  // WF-A / WF-B do not set width/height — fall back to 1408×768.
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

  console.log(
    `[renderer] Scene ${sceneJson.scene_id} | Type: ${sceneJson.render_type} | ` +
    `Composition: ${spec.id} | Canvas: ${spec.width}×${spec.height} @ ${spec.fps}fps`
  );

  const outPath = path.join(
    os.tmpdir(),
    `scene_${sceneJson.scene_id}_${Date.now()}.mp4`
  );

  const composition = await selectComposition({
    serveUrl:   bp,
    id:         spec.id,
    inputProps: { sceneJson },
  });

  await renderMedia({
    composition,
    serveUrl:       bp,
    codec:          'h264',
    outputLocation: outPath,
    inputProps:     { sceneJson },
    chromiumOptions: {
      executablePath: process.env.REMOTION_CHROMIUM_PATH || '/usr/bin/chromium',
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

module.exports = { renderScene };git