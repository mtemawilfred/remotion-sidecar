// ── server.js ─────────────────────────────────────────────────────────────
const express  = require('express');
const path     = require('path');
const fs       = require('fs');
const { renderScene, renderVideo } = require('./renderer');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Body size limit ─────────────────────────────────────────────────────────
// Large because REPURPOSE payloads can carry base64 assets. With the source
// video now passed by GCS URL (see setupRepurposeFiles), payloads are small,
// but the headroom is harmless.
app.use(express.json({ limit: '500mb', type: '*/*' }));

// ── Static asset routes ────────────────────────────────────────────────────
app.use('/public/assets', express.static(path.join(__dirname, '../assets')));
app.use('/public/tmp_renders', express.static(path.join(__dirname, '../tmp_renders')));

// ── Health check ───────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0', service: 'remotion-sidecar' });
});

// ── Main render endpoint (SYNCHRONOUS) ──────────────────────────────────────
// Kept for short clips / backward compatibility. Long renders should use the
// async endpoints below so they don't hit Railway's HTTP proxy timeout.
app.post('/render-scene', async (req, res) => {
  const { scene_json } = req.body;
  if (!scene_json) {
    return res.status(400).json({ error: 'Missing scene_json in request body' });
  }
  console.log(
    `[render] Scene ${scene_json.scene_id} | ` +
    `Type: ${scene_json.render_type} | ` +
    `Duration: ${scene_json.duration_ms}ms`
  );
  try {
    const mp4Buffer = await renderScene(scene_json);
    res.set('Content-Type', 'video/mp4');
    res.set('Content-Disposition', `attachment; filename="scene_${String(scene_json.scene_id).padStart(3, '0')}.mp4"`);
    res.send(mp4Buffer);
    console.log(`[render] Scene ${scene_json.scene_id} complete — ${mp4Buffer.length} bytes`);
  } catch (err) {
    console.error(`[render] Scene ${scene_json.scene_id} failed:`, err.message);
    res.status(500).json({ error: 'Render failed', message: err.message, scene_id: scene_json.scene_id });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// ASYNC RENDER  — submit → poll → download
// Long renders exceed Railway's HTTP proxy timeout when held open as one request.
// These run the render in the BACKGROUND: n8n submits and gets a job_id instantly,
// polls /render-status, then downloads from /render-result.
// Jobs are in-memory; a restart mid-render loses the job (poll returns 404).
// ════════════════════════════════════════════════════════════════════════════
const renderJobs = {}; // job_id -> { status:'running'|'done'|'error', file, bytes, error }
const RENDERS_DIR = path.join(__dirname, '../tmp_renders');

// Delete finished MP4s older than 24h (safety net for orphaned/errored jobs).
function sweepOldRenders() {
  try {
    const now = Date.now();
    for (const f of fs.readdirSync(RENDERS_DIR)) {
      if (!f.endsWith('_final.mp4')) continue;
      const p = path.join(RENDERS_DIR, f);
      if (now - fs.statSync(p).mtimeMs > 24 * 60 * 60 * 1000) fs.unlinkSync(p);
    }
  } catch (e) {}
}

// POST /render-scene-async → { job_id } immediately, renders in background
app.post('/render-scene-async', (req, res) => {
  const { scene_json } = req.body;
  if (!scene_json) {
    return res.status(400).json({ error: 'Missing scene_json in request body' });
  }
  sweepOldRenders();
  const jobId = `${scene_json.folder_name || scene_json.scene_id || 'job'}_${Date.now()}`;
  renderJobs[jobId] = { status: 'running', startedAt: Date.now() };
  res.status(202).json({ job_id: jobId });
  console.log(`[async] ${jobId} queued | Type: ${scene_json.render_type} | Duration: ${scene_json.duration_ms}ms`);

  (async () => {
    try {
      const buf = await renderScene(scene_json);
      const outPath = path.join(RENDERS_DIR, `${jobId}_final.mp4`);
      fs.writeFileSync(outPath, buf);
      renderJobs[jobId] = { status: 'done', file: outPath, bytes: buf.length };
      console.log(`[async] ${jobId} done — ${buf.length} bytes`);
    } catch (err) {
      renderJobs[jobId] = { status: 'error', error: err.message };
      console.error(`[async] ${jobId} failed: ${err.message}`);
    }
  })();
});

// GET /render-status/:id → { status, error, bytes }
app.get('/render-status/:id', (req, res) => {
  const j = renderJobs[req.params.id];
  if (!j) return res.status(404).json({ status: 'unknown' });
  res.json({ status: j.status, error: j.error || null, bytes: j.bytes || null });
});

// GET /render-result/:id → streams the finished MP4, then DELETES it (lean).
// Long-term review is via Drive (Telegram links to it); the service only keeps a
// render until n8n downloads it. Orphans are removed after 24h by sweepOldRenders.
// Set KEEP_RENDERS=1 to keep files for in-browser review at
//   /public/tmp_renders/<id>_final.mp4  (uses more disk).
app.get('/render-result/:id', (req, res) => {
  const j = renderJobs[req.params.id];
  const file = (j && j.file) || path.join(RENDERS_DIR, `${req.params.id}_final.mp4`);
  if (!fs.existsSync(file)) {
    return res.status(409).json({ error: 'not ready', status: j ? j.status : 'unknown' });
  }
  res.set('Content-Type', 'video/mp4');
  res.set('Content-Disposition', `attachment; filename="${req.params.id}_final.mp4"`);
  const stream = fs.createReadStream(file);
  stream.pipe(res);
  stream.on('close', () => {
    if (process.env.KEEP_RENDERS === '1') return;
    try { fs.unlinkSync(file); } catch (e) {}
    delete renderJobs[req.params.id];
    console.log(`[async] ${req.params.id} delivered + cleaned up`);
  });
  stream.on('error', (e) => console.error(`[async] result stream error: ${e.message}`));
});

// GET /renders → list finished videos (only meaningful with KEEP_RENDERS=1)
app.get('/renders', (req, res) => {
  let files = [];
  try {
    files = fs.readdirSync(RENDERS_DIR)
      .filter(f => f.endsWith('_final.mp4'))
      .map(f => {
        const st = fs.statSync(path.join(RENDERS_DIR, f));
        return { file: f, size_mb: +(st.size / 1024 / 1024).toFixed(1), modified: st.mtime, view_url: `/public/tmp_renders/${f}` };
      })
      .sort((a, b) => new Date(b.modified) - new Date(a.modified));
  } catch (e) {}
  res.json({ count: files.length, renders: files });
});

// ── v3 single-timeline render endpoint (unchanged) ──────────────────────────
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

// POST /render-video-async → { job_id } immediately, renders VideoComposerV2 in background
app.post('/render-video-async', (req, res) => {
  const payload = req.body && (req.body.render_payload || req.body);
  if (!payload || !Array.isArray(payload.layers)) {
    return res.status(400).json({ error: 'Missing/invalid render_payload (need layers[])' });
  }
  sweepOldRenders();
  const jobId = `${payload.folder_name || payload.video_id || 'video'}_${Date.now()}`;
  renderJobs[jobId] = { status: 'running', startedAt: Date.now() };
  res.status(202).json({ job_id: jobId });
  console.log(`[async] ${jobId} queued | video-render | ${payload.layers.length} layers`);

  (async () => {
    try {
      const mp4 = await renderVideo(payload);
      const outPath = path.join(RENDERS_DIR, `${jobId}_final.mp4`);
      fs.writeFileSync(outPath, mp4);
      renderJobs[jobId] = { status: 'done', file: outPath, bytes: mp4.length };
      console.log(`[async] ${jobId} done — ${mp4.length} bytes`);
    } catch (err) {
      renderJobs[jobId] = { status: 'error', error: err.message };
      console.error(`[async] ${jobId} failed: ${err.message}`);
    }
  })();
});

app.listen(PORT, () => {
  console.log(`Remotion sidecar running on port ${PORT}`);
});