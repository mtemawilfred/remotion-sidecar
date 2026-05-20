// ── overlays/SpotlightCircle.jsx ──────────────────────────────────────────
// Blurs the background and reveals a circular sharp-focus zone.
// The spotlight zooms in from small to full radius using spring physics.
// Used to direct viewer attention to a specific area of the scene.
//
// Props from scene JSON:
//   pos_x        — horizontal position 0.0 to 1.0 (0.5 = center)
//   pos_y        — vertical position 0.0 to 1.0
//   radius       — spotlight circle radius in pixels
//   blur_amount  — CSS blur amount for the surrounding area (default 8)
//   start_ms     — when the spotlight appears
//   duration_ms  — how long it stays (omit for rest of scene)

import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';

export const SpotlightCircle = ({
  pos_x       = 0.5,
  pos_y       = 0.5,
  radius      = 160,
  blur_amount = 8,
  start_ms    = 0,
  duration_ms,
  brand,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const startFrame = Math.round((start_ms / 1000) * fps);
  const endFrame   = duration_ms ? startFrame + Math.round((duration_ms / 1000) * fps) : null;

  if (frame < startFrame) return null;
  if (endFrame && frame > endFrame) return null;

  const localFrame = frame - startFrame;

  // Spring zoom-in of the spotlight radius
  const progress    = spring({ frame: localFrame, fps, config: { damping: 12, stiffness: 80 } });
  const liveRadius  = interpolate(progress, [0, 1], [0, radius]);

  // Fade in the blur overlay
  const overlayOpacity = interpolate(localFrame, [0, 10], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp'
  });

  const cx = pos_x * width;
  const cy = pos_y * height;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <svg
        width={width}
        height={height}
        style={{ position: 'absolute', top: 0, left: 0, opacity: overlayOpacity }}
      >
        <defs>
          <filter id={`blur-${start_ms}`}>
            <feGaussianBlur stdDeviation={blur_amount} />
          </filter>
          {/* Mask: transparent circle (sharp) surrounded by opaque (blurred) */}
          <mask id={`spotlight-mask-${start_ms}`}>
            <rect width={width} height={height} fill="white" />
            <circle cx={cx} cy={cy} r={liveRadius} fill="black" />
          </mask>
        </defs>

        {/* Blurred overlay — only shows outside the spotlight circle */}
        <rect
          width={width}
          height={height}
          fill="rgba(0,0,0,0.5)"
          filter={`url(#blur-${start_ms})`}
          mask={`url(#spotlight-mask-${start_ms})`}
        />

        {/* Spotlight ring border */}
        <circle
          cx={cx}
          cy={cy}
          r={liveRadius}
          fill="none"
          stroke="rgba(255,255,255,0.6)"
          strokeWidth={3}
        />
      </svg>
    </AbsoluteFill>
  );
};
