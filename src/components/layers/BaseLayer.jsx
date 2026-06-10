// ── layers/BaseLayer.jsx ──────────────────────────────────────────────────
// Layer 1 — the scene background.
//
// KEY FIX: COMPOSITION scenes default to light background
// The reference video uses a light blue-grey (#E8ECF4) background for all
// character scenes. Previously this defaulted to brand.secondary (#FFFFFF)
// but Claude Call 2 was overriding with base.color = '#1B2A4A' (dark navy).
//
// New rule applied here:
//   COMPOSITION → light background (#E8ECF4) unless base.color explicitly set
//   MOTION_GRAPHIC → dark background (brand.primary #1B2A4A) unless overridden
//   IMAGE → renders the Gemini-generated scene image
//   ICON_ANIMATION → light background

import React from 'react';
import {
  AbsoluteFill,
  Img,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from 'remotion';

// Light background used by all COMPOSITION scenes (matches reference video)
const LIGHT_BG = '#E8ECF4';

export const BaseLayer = ({ sceneJson, brand }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const base       = sceneJson.layers?.base || {};
  const renderType = sceneJson.render_type;

  // ── Camera push-in / parallax on the base layer ──────────────────────────
  // Mirrors CharacterLayer.motion so the whole frame breathes together.
  //   'push_in'  → 1.00→1.03 zoom across the scene
  //   'parallax' → slightly stronger drift for image backgrounds
  // Absent → static (scale 1.0). Applied to the layer wrapper below.
  let baseScale = 1.0;
  if (base.motion === 'push_in') {
    baseScale = interpolate(frame, [0, durationInFrames], [1.0, 1.03],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  } else if (base.motion === 'parallax') {
    baseScale = interpolate(frame, [0, durationInFrames], [1.0, 1.06],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  }

  // ── Blur effect ─────────────────────────────────────────────────────────
  let blurAmount = 0;
  if (base.blur_amount && base.blur_start_ms !== undefined) {
    const blurStartFrame = Math.round((base.blur_start_ms / 1000) * fps);
    const blurTransFrame = Math.round(((base.blur_transition_ms || 400) / 1000) * fps);
    blurAmount = interpolate(
      frame,
      [blurStartFrame, blurStartFrame + blurTransFrame],
      [0, base.blur_amount],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );
  }

  // ── IMAGE scene — Gemini-generated illustration ──────────────────────────
  // Fires when EITHER the render_type is IMAGE (legacy) OR the base layer is
  // explicitly typed 'image' (NARRATOR_EXPLAINER cinematic plates), as long as
  // a base64 image is actually present in assets.
  if (
    (renderType === 'IMAGE' || base.type === 'image') &&
    sceneJson.assets?.base_image_b64
  ) {
    return (
      <AbsoluteFill style={{ overflow: 'hidden' }}>
        <Img
          src={`data:image/png;base64,${sceneJson.assets.base_image_b64}`}
          style={{
            width:     '100%',
            height:    '100%',
            objectFit: 'cover',
            transform: `scale(${baseScale})`,
            filter:    blurAmount > 0 ? `blur(${blurAmount}px)` : 'none',
          }}
        />
      </AbsoluteFill>
    );
  }

  // ── Background color selection ─────────────────────────────────────────
  // COMPOSITION: light background so the character illustration reads clearly
  // MOTION_GRAPHIC: dark background for graphic impact
  // Explicit base.color always overrides these defaults
  let bgColor;
  if (base.color) {
    // Claude Call 2 explicitly set a color — respect it
    bgColor = base.color;
  } else if (renderType === 'COMPOSITION' || renderType === 'ICON_ANIMATION') {
    // Light background — matches the reference video whiteboard style
    bgColor = LIGHT_BG;
  } else {
    // MOTION_GRAPHIC and anything else — dark brand primary
    bgColor = brand.primary || '#1B2A4A';
  }

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <AbsoluteFill style={{ backgroundColor: bgColor, transform: `scale(${baseScale})` }} />
    </AbsoluteFill>
  );
};