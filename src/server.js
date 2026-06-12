// ── server.js ─────────────────────────────────────────────────────────────
const express  = require('express');
const path     = require('path');
const { renderScene, renderVideo } = require('./renderer');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Body size limit: 200mb ─────────────────────────────────────────────────
// Increased from 50mb to handle REPURPOSE_SCENE payloads.
// A typical 5-min forex chart tutorial video at ~50MB = ~67MB of base64.
// Plus audio chunks (~2MB total), we need headroom for larger source videos.
app.use(express.json({ limit: '200mb', type: '*/*' }));

// ── Static asset routes ────────────────────────────────────────────────────

// BGM and SFX files baked into the Docker image at build time.
// Remotion components reference audio as /public/assets/bgm/track.mp3
app.use('/public/assets', express.static(path.join(__dirname, '../assets')));

// Temp render files for REPURPOSE_SCENE.
// renderer.js writes decoded source videos, audio chunks, and CTA banners
// here before each render. Remotion's OffthreadVideo and Audio components
// fetch them via http://localhost:PORT/public/tmp_renders/... URLs.
// Files are deleted by renderer.js immediately after each render completes.
// express.static serves current directory contents — files written after
// server start ARE served correctly.
app.use('/public/tmp_renders', express.static(path.join(__dirname, '../tmp_renders')));

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

  // Log the scene. For REPURPOSE_SCENE, duration_ms is computed by n8n from
  // the sequence. For other types, duration_ms comes directly in scene_json.
  console.log(
    `[render] Scene ${scene_json.scene_id} | ` +
    `Type: ${scene_json.render_type} | ` +
    `Duration: ${scene_json.duration_ms}ms`
  );

  try {
    const mp4Buffer = await renderScene(scene_json);
    res.set('Content-Type', 'video/mp4');
    res.set(
      'Content-Disposition',
      `attachment; filename="scene_${String(scene_json.scene_id).padStart(3, '0')}.mp4"`
    );
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


// ── v3 single-timeline render endpoint ─────────────────────────────────────
// Workflow B v3 POSTs ONE fully-resolved render_payload here and gets ONE MP4.
// The sidecar fetches+caches the URL assets, then renders VideoComposer in a
// single pass (no per-scene loop, no ffmpeg stitch).
app.post('/render-video', async (req, res) => {
  const payload = req.body && (req.body.render_payload || req.body);
  if (!payload || !Array.isArray(payload.layers)) {
    return res.status(400).json({ error: 'Missing/invalid render_payload (need layers[])' });
  }
  console.log(`[render-video] ${payload.video_id} | ${payload.total_frames} frames | ${payload.layers.length} layers`);
  try {
    const mp4 = await renderVideo(payload);
    res.set('Content-Type', 'video/mp4');
    res.set('Content-Disposition', `attachment; filename="${(payload.video_id||'video')}_final.mp4"`);
    res.send(mp4);
    console.log(`[render-video] ${payload.video_id} complete — ${mp4.length} bytes`);
  } catch (err) {
    console.error(`[render-video] ${payload.video_id} failed:`, err.message);
    res.status(500).json({ error: 'Render failed', message: err.message, video_id: payload.video_id });
  }
});

app.listen(PORT, () => {
  console.log(`Remotion sidecar running on port ${PORT}`);
});