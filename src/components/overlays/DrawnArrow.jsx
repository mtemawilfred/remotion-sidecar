// ── overlays/DrawnArrow.jsx ───────────────────────────────────────────────
// SVG curved arrow that draws itself progressively in real time.
// Uses SVG stroke-dashoffset animation to simulate drawing.
// The draw_pen SFX is placed at start_ms by SceneComposer.
//
// Props:
//   start_x, start_y   — arrow start point (0.0 to 1.0 of canvas)
//   end_x, end_y       — arrow end point
//   curve              — curve intensity -1.0 to 1.0 (0 = straight)
//   color              — arrow color (defaults to brand.accent)
//   thickness          — stroke width (default 4)
//   start_ms           — when drawing begins
//   draw_duration_ms   — how long the drawing animation takes

import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';

export const DrawnArrow = ({
  start_x          = 0.2,
  start_y          = 0.5,
  end_x            = 0.8,
  end_y            = 0.5,
  curve            = 0.3,
  color,
  thickness        = 4,
  start_ms         = 0,
  draw_duration_ms = 600,
  brand,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const arrowColor  = color || brand?.accent || '#C9A84C';
  const startFrame  = Math.round((start_ms / 1000) * fps);
  const drawFrames  = Math.round((draw_duration_ms / 1000) * fps);

  if (frame < startFrame) return null;

  const localFrame = frame - startFrame;

  // Progress 0 to 1 over draw_duration_ms
  const progress = interpolate(localFrame, [0, drawFrames], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp'
  });

  // Convert 0-1 positions to pixel coordinates
  const x1 = start_x * width;
  const y1 = start_y * height;
  const x2 = end_x   * width;
  const y2 = end_y   * height;

  // Control point for the bezier curve
  const midX  = (x1 + x2) / 2;
  const midY  = (y1 + y2) / 2;
  const dx    = x2 - x1;
  const dy    = y2 - y1;
  const len   = Math.sqrt(dx * dx + dy * dy);
  const cpX   = midX - dy * curve;
  const cpY   = midY + dx * curve;

  const pathD = `M ${x1} ${y1} Q ${cpX} ${cpY} ${x2} ${y2}`;

  // Approximate path length for stroke-dashoffset animation
  // This is an approximation — exact length would need getTotalLength()
  const pathLength = len * (1 + Math.abs(curve) * 0.5) + 100;
  const drawn      = progress * pathLength;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <svg width={width} height={height} style={{ position: 'absolute', top: 0, left: 0 }}>
        <defs>
          <marker
            id={`arrowhead-${start_ms}`}
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon
              points="0 0, 10 3.5, 0 7"
              fill={arrowColor}
              opacity={progress > 0.9 ? (progress - 0.9) / 0.1 : 0}
            />
          </marker>
        </defs>

        {/* The arrow path, drawing itself via dashoffset */}
        <path
          d={pathD}
          fill="none"
          stroke={arrowColor}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={pathLength}
          strokeDashoffset={pathLength - drawn}
          markerEnd={`url(#arrowhead-${start_ms})`}
        />
      </svg>
    </AbsoluteFill>
  );
};
