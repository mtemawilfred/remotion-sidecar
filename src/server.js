// ── server.js ─────────────────────────────────────────────────────────────
// Remotion sidecar service.
// Receives a complete scene JSON from n8n Workflow B.
// Returns a rendered MP4 clip.
// Brand-agnostic — all colors, fonts, and assets come from the scene JSON.

const express  = require('express');
const { renderScene } = require('./renderer');

const app  = express();
const PORT = process.env.PORT || 3000;

// Parse large JSON bodies — scene JSON includes base64 pose PNGs
app.use(express.json({ limit: '50mb' }));

// ── Health check ───────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0', service: 'remotion-sidecar' });
});

// ── Main render endpoint ───────────────────────────────────────────────────
// POST /render-scene
// Body: { scene_json: { ...complete scene package } }
// Response: MP4 binary
app.post('/render-scene', async (req, res) => {
  const { scene_json } = req.body;

  if (!scene_json) {
    return res.status(400).json({ error: 'Missing scene_json in request body' });
  }

  console.log(`[render] Scene ${scene_json.scene_id} | Type: ${scene_json.render_type} | Duration: ${scene_json.duration_ms}ms`);

  try {
    const mp4Buffer = await renderScene(scene_json);

    // Return the MP4 binary directly
    res.set('Content-Type', 'video/mp4');
    res.set('Content-Disposition', `attachment; filename="scene_${String(scene_json.scene_id).padStart(3,'0')}.mp4"`);
    res.send(mp4Buffer);

    console.log(`[render] Scene ${scene_json.scene_id} complete — ${mp4Buffer.length} bytes`);

  } catch (err) {
    console.error(`[render] Scene ${scene_json.scene_id} failed:`, err.message);
    res.status(500).json({
      error:   'Render failed',
      message: err.message,
      scene_id: scene_json.scene_id
    });
  }
});

app.listen(PORT, () => {
  console.log(`Remotion sidecar running on port ${PORT}`);
});
