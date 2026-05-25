// ── composition/index.jsx ─────────────────────────────────────────────────
// Remotion entry point.
// Registers two compositions:
//   1. SceneComposer — existing composition for COMPOSITION and MOTION_GRAPHIC
//   2. ChartScene    — new composition for CHART_SCENE (full-frame forex charts)
//
// The renderer.js routes to the correct composition based on render_type
// in the incoming scene_json.

import { Composition, registerRoot } from 'remotion';
import { SceneComposer } from '../components/SceneComposer';
import { ChartScene }    from '../components/chart/ChartScene';

// ── Default props for SceneComposer (Remotion Studio preview only) ─────────
const DEFAULT_SCENE = {
  scene_id:    0,
  duration_ms: 5000,
  render_type: 'MOTION_GRAPHIC',
  brand: {
    primary:      '#1B2A4A',
    secondary:    '#FFFFFF',
    accent:       '#C9A84C',
    danger:       '#991B1B',
    success:      '#166534',
    font_heading: 'Oswald',
    font_body:    'Inter',
    bgm_track:    'ambient_calm',
  },
  layers: {
    base:      { type: 'color', color: '#1B2A4A' },
    character: null,
    elements:  [],
    text:      [],
  },
  assets: { sound_effects: [] },
  transition_in:  { type: 'fade', duration_ms: 400 },
  transition_out: { type: 'fade', duration_ms: 300 },
};

// ── Default props for ChartScene (Remotion Studio preview only) ────────────
// These generate a sample bullish chart so the composition is previewable
// in Remotion Studio without a real scene_json from n8n.
const DEFAULT_CHART_SCENE = {
  scene_id:    0,
  render_type: 'CHART_SCENE',
  duration_ms: 10000,
  brand: {
    primary:      '#1B2A4A',
    accent:       '#C9A84C',
    danger:       '#991B1B',
    success:      '#166534',
    font_heading: 'Oswald',
    font_body:    'Inter',
  },
  stt_timestamps: [
    { word: 'THIS',   start_ms: 200,  end_ms: 450  },
    { word: 'CANDLE', start_ms: 450,  end_ms: 900  },
    { word: 'SHOWS',  start_ms: 900,  end_ms: 1200 },
    { word: 'YOU',    start_ms: 1200, end_ms: 1500 },
    { word: 'THE',    start_ms: 1500, end_ms: 1700 },
    { word: 'MARKET', start_ms: 1700, end_ms: 2200 },
  ],
  chart: {
    // Sample uptrend with 14 candles — enough to show the panning behaviour
    candles: [
      { o: 1.0800, h: 1.0825, l: 1.0785, c: 1.0820 },
      { o: 1.0820, h: 1.0845, l: 1.0810, c: 1.0838 },
      { o: 1.0838, h: 1.0842, l: 1.0815, c: 1.0820 },
      { o: 1.0820, h: 1.0830, l: 1.0800, c: 1.0808 },
      { o: 1.0808, h: 1.0855, l: 1.0800, c: 1.0850 },
      { o: 1.0850, h: 1.0875, l: 1.0840, c: 1.0870 },
      { o: 1.0870, h: 1.0880, l: 1.0855, c: 1.0860 },
      { o: 1.0860, h: 1.0865, l: 1.0835, c: 1.0840 },
      { o: 1.0840, h: 1.0890, l: 1.0835, c: 1.0885 },
      { o: 1.0885, h: 1.0910, l: 1.0878, c: 1.0905 },
      { o: 1.0905, h: 1.0920, l: 1.0895, c: 1.0912 },
      { o: 1.0912, h: 1.0918, l: 1.0890, c: 1.0895 },
      { o: 1.0895, h: 1.0940, l: 1.0888, c: 1.0935 },
      { o: 1.0935, h: 1.0960, l: 1.0928, c: 1.0955 },
    ],
    candle_interval_ms: 500,
    visible_count:      10,
    background:         'white',
  },
  overlays: [
    { type: 'demand_zone',    y_top_pct: 0.72, y_bottom_pct: 0.82, x_start_pct: 0, x_end_pct: 0.95, label: '4H DEMAND', start_ms: 5000 },
    { type: 'floating_label', text: 'Buy Here', x_pct: 0.65, y_pct: 0.65, start_ms: 7000 },
  ],
  assets: { sound_effects: [] },
  transition_in:  { type: 'fade', duration_ms: 300 },
  transition_out: { type: 'fade', duration_ms: 300 },
};

export const RemotionRoot = () => {
  return (
    <>
      {/* ── Composition 1: SceneComposer ──────────────────────────────────
          Handles render_type: 'COMPOSITION' and 'MOTION_GRAPHIC'.
          Canvas: 1408×768 (16:9 landscape) — confirmed working in WF2.
          DO NOT change these dimensions — WF-A and WF-B depend on them. */}
      <Composition
        id="SceneComposer"
        component={SceneComposer}
        width={1408}
        height={768}
        fps={24}
        durationInFrames={120}
        defaultProps={{ sceneJson: DEFAULT_SCENE }}
      />

      {/* ── Composition 2: ChartScene ─────────────────────────────────────
          Handles render_type: 'CHART_SCENE'.
          Canvas: 1080×1920 (9:16 vertical) — short-form forex chart videos.
          30fps — smoother candle animation at this frame rate. */}
      <Composition
        id="ChartScene"
        component={ChartScene}
        width={1080}
        height={1920}
        fps={30}
        durationInFrames={300}
        defaultProps={{ sceneJson: DEFAULT_CHART_SCENE }}
      />
    </>
  );
};

registerRoot(RemotionRoot);