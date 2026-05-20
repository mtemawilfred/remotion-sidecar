// ── layers/BaseLayer.jsx ──────────────────────────────────────────────────
// Layer 1 — the scene background.
// Four cases:
//   IMAGE       — renders a Gemini-generated scene image
//   COMPOSITION — renders a flat brand color background
//   MOTION_GRAPHIC — renders a gradient or flat color
//   ICON_ANIMATION — renders a flat brand color
//
// Supports background blur effect at a specified timestamp.

import React from 'react';
import {
  AbsoluteFill,
  Img,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from 'remotion';

export const BaseLayer = ({ sceneJson, brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const base = sceneJson.layers?.base || {};
  const renderType = sceneJson.render_type;

  // ── Blur effect ─────────────────────────────────────────────────────────
  // If base.blur_start_ms is set, image blurs in at that timestamp.
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
  if (renderType === 'IMAGE' && sceneJson.assets?.base_image_b64) {
    return (
      <AbsoluteFill>
        <Img
          src={`data:image/png;base64,${sceneJson.assets.base_image_b64}`}
          style={{
            width:  '100%',
            height: '100%',
            objectFit: 'cover',
            filter: blurAmount > 0 ? `blur(${blurAmount}px)` : 'none',
          }}
        />
      </AbsoluteFill>
    );
  }

  // ── COMPOSITION / MOTION_GRAPHIC / ICON_ANIMATION — flat color ────────
  // Background color can come from base.color or defaults to brand.primary
  // for dark scenes or brand.secondary (white) for light scenes.
  const bgColor = base.color || brand.secondary;

  return (
    <AbsoluteFill
      style={{ backgroundColor: bgColor }}
    />
  );
};
