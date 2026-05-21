// ── server.js ─────────────────────────────────────────────────────────────
const express  = require('express');
const path     = require('path');
const { renderScene } = require('./renderer');

const app  = express();
const PORT = process.env.PORT || 3000;

// Parse large JSON bodies — scene JSON includes base64 pose PNGs
app.use(express.json({ limit: '50mb' }));

// Serve BGM and SFX assets to the Remotion browser renderer.
// Remotion components reference audio as /public/assets/bgm/track.mp3
// This maps that path to the /assets/ folder baked into the Docker image.
app.use('/public/assets', express.static(path.join(__dirname, '../assets')));

// ── Health check ───────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0', service: 'remotion-sidecar' });
});

// ── Main render endpoint ───────────────────────────────────────────────────
app.post('/render-scene', async (req, res) => {
  const { scene_json } = req.body;
  if (!scene_json) {
    return res.status(400).json({ error: 'Missing scene_json in request body' });
  }
  console.log(`[render] Scene ${scene_json.scene_id} | Type: ${scene_json.render_type} | Duration: ${scene_json.duration_ms}ms`);
  try {
    const mp4Buffer = await renderScene(scene_json);
    res.set('Content-Type', 'video/mp4');
    res.set('Content-Disposition', `attachment; filename="scene_${String(scene_json.scene_id).padStart(3,'0')}.mp4"`);
    res.send(mp4Buffer);
    console.log(`[render] Scene ${scene_json.scene_id} complete — ${mp4Buffer.length} bytes`);
  } catch (err) {
    console.error(`[render] Scene ${scene_json.scene_id} failed:`, err.message);
    res.status(500).json({
      error:    'Render failed',
      message:  err.message,
      scene_id: scene_json.scene_id
    });
  }
});

app.listen(PORT, () => {
  console.log(`Remotion sidecar running on port ${PORT}`);
});
