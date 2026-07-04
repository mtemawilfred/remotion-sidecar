// ── composition/index.jsx ─────────────────────────────────────────────────
// Remotion entry point.
// Registers FIVE compositions:
//   1. SceneComposer       — existing: COMPOSITION and MOTION_GRAPHIC render types
//   2. ChartScene          — existing: CHART_SCENE (9:16 animated candlestick charts)
//   3. RepurposeScene      — existing: REPURPOSE_SCENE (freeze-and-explain, 9:16)
//   4. RepurposeLongForm   — NEW: REPURPOSE_LONG_FORM (freeze-and-explain, 16:9 YouTube)
//
// renderer.js routes to the correct composition based on render_type in scene_json.
// Dimensions and FPS per composition:
//   SceneComposer        — 1408×768  @ 24fps  (16:9 landscape — WF2 long-form)
//   ChartScene           — 1080×1920 @ 30fps  (9:16 vertical  — WF-B short-form)
//   RepurposeScene       — 1080×1920 @ 30fps  (9:16 vertical  — video repurposing)
//   RepurposeLongForm    — 1920×1080 @ 30fps  (16:9 landscape — long-form YouTube)

import { Composition, registerRoot } from 'remotion';
import { SceneComposer }      from '../components/SceneComposer';
import { ChartScene }         from '../components/chart/ChartScene';
import { RepurposeScene }     from '../components/RepurposeScene';
import { RepurposeLongForm }  from '../components/RepurposeLongForm';
import { VideoComposer }      from '../components/video/VideoComposer';
import { VideoComposerV2 }    from '../components/video/VideoComposerV2';

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

// ── Default props for SceneComposerVertical (Remotion Studio preview only) ──
// NARRATOR_EXPLAINER format: faceless Sovereign pose over a flat base, black
// word-by-word caption pill, top-third emphasis title, corner icons, slow push-in.
// Same scene shape as SceneComposer — only the canvas (1080×1920) differs.
const DEFAULT_SCENE_VERTICAL = {
  scene_id:    0,
  render_type: 'NARRATOR_EXPLAINER',
  duration_ms: 5000,
  brand: {
    primary:      '#1A1A1A',
    secondary:    '#F2F2F2',
    accent:       '#9B1B1B',
    danger:       '#9B1B1B',
    success:      '#166534',
    font_heading: 'Montserrat',
    font_body:    'Montserrat',
    bgm_track:    'classical_dark',
  },
  stt_timestamps: [
    { word: 'GOOD',   start_ms: 0,   end_ms: 680  },
    { word: 'PEOPLE', start_ms: 680, end_ms: 1360 },
    { word: 'ARE',    start_ms: 1400, end_ms: 1560 },
    { word: 'RARE',   start_ms: 1960, end_ms: 2560 },
  ],
  layers: {
    base:      { type: 'color', color: '#F2F2F2', motion: 'push_in' },
    character: null,
    elements: [
      { component: 'SectionTitle', mode: 'overlay', title: 'Good People Got PUNISHED', keyword: 'PUNISHED', start_ms: 200 },
      { component: 'WordByWordCaption', style: 'pill', position_y_pct: 0.5, group_size: 4 },
    ],
    text:      [],
  },
  assets: { sound_effects: [] },
  transition_in:  { type: 'fade', duration_ms: 300 },
  transition_out: { type: 'fade', duration_ms: 300 },
};

// ── Default props for ChartScene (Remotion Studio preview only) ────────────
const DEFAULT_CHART_SCENE = {
  scene_id:    0,
  render_type: 'CHART_SCENE',
  duration_ms: 10000,
  brand: {
    primary:      '#1B2A4A',
    accent:       '#C9A84C',
    danger:       '#991B1B',
    success:      '#166634',
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

// ── Default props for RepurposeScene (Remotion Studio preview only) ────────
// Minimal sample sequence: one live block followed by one freeze block.
const DEFAULT_REPURPOSE_SCENE = {
  render_type:      'REPURPOSE_SCENE',
  scene_id:         'preview',
  folder_name:      'preview',
  duration_ms:      8000,
  source_video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
  cta_banner_url:   '',
  fps:              30,
  canvas:           { w: 1080, h: 1920 },
  brand: {
    primary:      '#1B2A4A',
    accent:       '#C9A84C',
    font_heading: 'Oswald',
    font_body:    'Inter',
  },
  sequence: [
    { type: 'live',   start_time: 0, end_time: 3 },
    {
      type:       'freeze',
      segment_id: 1,
      timestamp:  3,
      audio_url:  '',
      duration:   5,
      event_type: 'commentary',
      show_cta:   false,
      captions: [
        { word: 'This',  start: 0.0, end: 0.4  },
        { word: 'is',    start: 0.4, end: 0.7  },
        { word: 'the',   start: 0.7, end: 1.0  },
        { word: 'setup', start: 1.0, end: 1.5  },
      ],
    },
  ],
};

// ── Default props for RepurposeLongForm (Remotion Studio preview only) ─────
const DEFAULT_REPURPOSE_LONG_FORM = {
  render_type:      'REPURPOSE_LONG_FORM',
  scene_id:         'preview_lf',
  folder_name:      'preview_lf',
  duration_ms:      8000,
  source_video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
  cta_banner_url:   '',
  fps:              30,
  canvas:           { w: 1920, h: 1080 },
  brand: {
    primary:      '#1B2A4A',
    accent:       '#C9A84C',
    font_heading: 'Oswald',
    font_body:    'Inter',
  },
  sequence: [
    { type: 'live',   start_time: 0, end_time: 3 },
    {
      type:       'freeze',
      segment_id: 1,
      timestamp:  3,
      audio_url:  '',
      duration:   5,
      event_type: 'commentary',
      show_cta:   false,
      captions: [
        { word: 'This',  start: 0.0, end: 0.4  },
        { word: 'is',    start: 0.4, end: 0.7  },
        { word: 'the',   start: 0.7, end: 1.0  },
        { word: 'setup', start: 1.0, end: 1.5  },
      ],
    },
  ],
};


// ── Default props for VideoComposer (v3 single-timeline; Studio preview only) ──
const DEFAULT_VIDEO = {
  video_id: 'preview', width: 1080, height: 1920, fps: 30, total_frames: 90,
  theme: { primary:'#1A1A1A', secondary:'#F2F2F2', accent:'#9B1B1B', title_color:'#1A1A1A', keyword_color:'#9B1B1B', caption_style:'pill', font_body:'Montserrat' },
  assets: {}, audio: { voiceover: null, bgm: null, sfx: [], master: { enabled: false } },
  layers: [
    { id:'bg', kind:'background', z:0, frameStart:0, frameEnd:90, camera_locked:false, background:{ type:'cinematic' } },
    { id:'emph', kind:'emphasis', z:80, frameStart:5, frameEnd:90, camera_locked:false, title:'GOING EXTINCT', keyword:'EXTINCT', importance:'critical', color:'#1A1A1A', keyword_color:'#9B1B1B', entrance:{ kind:'word_build', wordStaggerMs:90, perWord:'pop' } },
    { id:'cap', kind:'caption', z:90, frameStart:0, frameEnd:90, camera_locked:false, keyword_color:'#9B1B1B', groups:[{ text:'GOOD PEOPLE EXTINCT', startFrame:0, endFrame:90, words:[{word:'GOOD',startFrame:0,endFrame:30,keyword:false},{word:'PEOPLE',startFrame:30,endFrame:60,keyword:false},{word:'EXTINCT',startFrame:60,endFrame:90,keyword:true}] }] },
  ],
  camera: [{ frameStart:0, frameEnd:90, from:{scale:1,x:0}, to:{scale:1.08,x:0}, originRef:'character', easing:'easeInOutCubic' }],
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
          30fps — smoother candle animation. */}
      <Composition
        id="ChartScene"
        component={ChartScene}
        width={1080}
        height={1920}
        fps={30}
        durationInFrames={300}
        defaultProps={{ sceneJson: DEFAULT_CHART_SCENE }}
      />

      {/* ── Composition 3: SceneComposerVertical ──────────────────────────
          Handles render_type: 'NARRATOR_EXPLAINER'.
          Canvas: 1080×1920 (9:16 vertical) — RedPill faceless-narrator shorts.
          Reuses the SAME SceneComposer 4-layer engine as the landscape
          composition; only the dimensions/fps differ. 30fps for smooth push-in.
          durationInFrames=150 is a placeholder — renderer.js always overrides
          this with the real per-scene duration from duration_ms. */}
      <Composition
        id="SceneComposerVertical"
        component={SceneComposer}
        width={1080}
        height={1920}
        fps={30}
        durationInFrames={150}
        defaultProps={{ sceneJson: DEFAULT_SCENE_VERTICAL }}
      />

      {/* ── Composition 4: RepurposeScene ─────────────────────────────────
          Handles render_type: 'REPURPOSE_SCENE'.
          Canvas: 1080×1920 (9:16 vertical) — video repurposing pipeline.
          Freeze-and-explain: source video pauses at event timestamps while
          voiceover plays with karaoke captions (2 lines at a time), then resumes.
          30fps to match source video smoothness.
          durationInFrames=300 is a placeholder — renderer.js always overrides
          this with the real duration calculated from the sequence. */}
      <Composition
        id="RepurposeScene"
        component={RepurposeScene}
        width={1080}
        height={1920}
        fps={30}
        durationInFrames={300}
        defaultProps={{ sceneJson: DEFAULT_REPURPOSE_SCENE }}
      />

      {/* ── Composition 5: RepurposeLongForm ──────────────────────────────
          Handles render_type: 'REPURPOSE_LONG_FORM'.
          Canvas: 1920×1080 (16:9 landscape) — long-form YouTube repurposing.
          Same freeze-and-explain logic as RepurposeScene.
          Captions pinned to bottom (40px) — standard subtitle position.
          30fps to match source video smoothness.
          durationInFrames=300 is a placeholder — renderer.js always overrides. */}
      <Composition
        id="RepurposeLongForm"
        component={RepurposeLongForm}
        width={1920}
        height={1080}
        fps={30}
        durationInFrames={300}
        defaultProps={{ sceneJson: DEFAULT_REPURPOSE_LONG_FORM }}
      />

      {/* ── Composition 6: VideoComposer ──────────────────────────────────
          v3 SINGLE-TIMELINE NARRATOR_EXPLAINER. Renders the WHOLE video in one
          pass from Workflow B's resolved payload (one POST -> one MP4). Routed
          via the /render-video endpoint (renderer.renderVideo), NOT /render-scene.
          durationInFrames is a placeholder — renderVideo overrides with total_frames. */}
      <Composition
        id="VideoComposer"
        component={VideoComposer}
        width={1080}
        height={1920}
        fps={30}
        durationInFrames={90}
        defaultProps={{ payload: DEFAULT_VIDEO }}
      />

      {/* ── Composition 7: VideoComposerV2 ────────────────────────────────
          v2 AGENT PLATFORM (RedPill v2). Same single-timeline contract as
          VideoComposer, plus: DYNAMIC dimensions (1920×1080 longform or
          1080×1920 shortform — read from the payload via calculateMetadata),
          emphasis styles (quote/strike_correct/underline/annotation), draw-on
          annotation entrances, zoom-circle leader lines, effects (shake/glitch/
          speed_lines/fire_aura/punch_in), emoji glyphs. Routed by
          payload.composition === 'VideoComposerV2' in renderer.renderVideo. */}
      <Composition
        id="VideoComposerV2"
        component={VideoComposerV2}
        width={1080}
        height={1920}
        fps={30}
        durationInFrames={90}
        defaultProps={{ payload: DEFAULT_VIDEO }}
        calculateMetadata={({ props }) => {
          const p = (props && props.payload) || {};
          return {
            width:  p.width  || 1080,
            height: p.height || 1920,
            fps:    p.fps    || 30,
            durationInFrames: Math.max(1, p.total_frames || 90),
          };
        }}
      />
    </>
  );
};

registerRoot(RemotionRoot);