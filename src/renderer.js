// ── renderer.js ───────────────────────────────────────────────────────────
// Bundles the Remotion composition and renders it to an MP4 buffer.
// Called once per scene by server.js.
// Uses a cached bundle path so bundling only happens once per process start.

const path = require('path');
const os   = require('os');
const fs   = require('fs');
const { bundle }      = require('@remotion/bundler');
const { renderMedia, selectComposition } = require('@remotion/renderer');

// Cache the bundle path — only bundle once per process lifetime
let bundlePath = null;

async function getBundle() {
  if (bundlePath) return bundlePath;

  console.log('[renderer] Bundling Remotion composition — first render only...');

  bundlePath = await bundle({
    entryPoint: path.resolve(__dirname, 'composition/index.jsx'),
    // Webpack override: treat React as external so we don't bundle it twice
    webpackOverride: (config) => config,
  });

  console.log('[renderer] Bundle complete:', bundlePath);
  return bundlePath;
}

// ── Main render function ───────────────────────────────────────────────────
async function renderScene(sceneJson) {
  const bp = await getBundle();

  // Output to a temp file — we read it back as a buffer to return to n8n
  const outPath = path.join(
    os.tmpdir(),
    `scene_${sceneJson.scene_id}_${Date.now()}.mp4`
  );

  // Select the composition — we have one composition: SceneComposer
  // It reads everything it needs from the inputProps (sceneJson)
  const composition = await selectComposition({
    serveUrl:   bp,
    id:         'SceneComposer',
    inputProps: { sceneJson },
  });

  // Render to MP4
  await renderMedia({
    composition,
    serveUrl:      bp,
    codec:         'h264',
    outputLocation: outPath,
    inputProps:    { sceneJson },
    chromiumOptions: {
      // Use system Chromium installed in Dockerfile
      executablePath: process.env.REMOTION_CHROMIUM_PATH || '/usr/bin/chromium',
      // Required for running in Docker without a real display
      disableWebSecurity: true,
    },
    // Match canvas spec confirmed from WF2
    fps:    24,
    width:  1408,
    height: 768,
    // Suppress verbose Remotion logs in production
    onProgress: ({ progress }) => {
      if (Math.round(progress * 100) % 25 === 0) {
        console.log(`[renderer] Scene ${sceneJson.scene_id}: ${Math.round(progress * 100)}%`);
      }
    },
  });

  // Read the output file into a buffer and delete the temp file
  const buffer = fs.readFileSync(outPath);
  fs.unlinkSync(outPath);

  return buffer;
}

module.exports = { renderScene };
