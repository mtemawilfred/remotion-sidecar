// ── composition/index.jsx ─────────────────────────────────────────────────
// Remotion entry point. Registers the SceneComposer composition.
// Width, height, fps, and duration are all driven by the scene JSON
// passed in as inputProps — nothing is hardcoded here.

import { Composition } from 'remotion';
import { SceneComposer } from '../components/SceneComposer';

// Default props used by the Remotion Studio preview only.
// In production these are always overridden by the scene JSON from n8n.
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
  assets: {
    sound_effects: [],
  },
  transition_in:  { type: 'fade', duration_ms: 400 },
  transition_out: { type: 'fade', duration_ms: 300 },
};

export const RemotionRoot = () => {
  return (
    <Composition
      id="SceneComposer"
      component={SceneComposer}
      // Canvas spec confirmed from WF2
      width={1408}
      height={768}
      fps={24}
      // Duration is set dynamically per scene in renderer.js
      // This default is just for Studio preview
      durationInFrames={120}
      defaultProps={{ sceneJson: DEFAULT_SCENE }}
    />
  );
};
