// ── chart/SupplyZone.jsx ──────────────────────────────────────────────────
// Semi-transparent supply zone rectangle.
// Pink/red fill, thin red border, optional label.
// Mitigated zones render at 30% opacity.
// Expands left to right when it appears.
//
// Props:
//   y_top_pct     — top of zone as fraction of chart height (0-1)
//   y_bottom_pct  — bottom of zone as fraction of chart height (0-1)
//   x_start_pct   — left edge of zone (0=chart left, 1=chart right)
//   x_end_pct     — right edge of zone
//   label         — optional label text e.g. "15M SUPPLY" or "HTF SUPPLY"
//   mitigated     — if true, zone renders faded (used/tapped zone)
//   start_ms      — when zone appears
//   chart_x, chart_y, chart_w, chart_h — chart area in px (from parent)

import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate } from 'remotion';

export const SupplyZone = ({
  y_top_pct    = 0.2,
  y_bottom_pct = 0.3,
  x_start_pct  = 0,
  x_end_pct    = 1,
  label,
  mitigated    = false,
  start_ms     = 0,
  chart_x      = 20,
  chart_y      = 40,
  chart_w      = 700,
  chart_h      = 400,
  brand,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const startFrame  = Math.round((start_ms / 1000) * fps);
  if (frame < startFrame) return null;

  const localFrame  = frame - startFrame;
  const expandFrames = Math.round(fps * 0.4);

  // Expand from left to right
  const progress = interpolate(localFrame, [0, expandFrames], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  const x1 = chart_x + x_start_pct * chart_w;
  const x2 = chart_x + x_end_pct   * chart_w;
  const y1 = chart_y + y_top_pct    * chart_h;
  const y2 = chart_y + y_bottom_pct * chart_h;

  const currentWidth = (x2 - x1) * progress;
  const zoneOpacity  = mitigated ? 0.3 : 0.85;
  const fillOpacity  = mitigated ? 0.12 : 0.22;

  const fade = interpolate(localFrame, [0, 8], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  return (
    <g opacity={fade * zoneOpacity}>
      {/* Fill */}
      <rect
        x={x1} y={y1}
        width={currentWidth}
        height={y2 - y1}
        fill={`rgba(200,60,60,${fillOpacity})`}
      />
      {/* Top border */}
      <line
        x1={x1} y1={y1}
        x2={x1 + currentWidth} y2={y1}
        stroke="rgba(220,80,80,0.7)"
        strokeWidth={1.5}
      />
      {/* Bottom border */}
      <line
        x1={x1} y1={y2}
        x2={x1 + currentWidth} y2={y2}
        stroke="rgba(220,80,80,0.7)"
        strokeWidth={1}
        strokeDasharray="4 3"
      />
      {/* Label */}
      {label && progress > 0.5 && (
        <>
          <rect
            x={x1 + 4} y={y1 + 4}
            width={label.length * 7 + 10}
            height={18}
            fill="rgba(200,60,60,0.85)"
            rx={3}
          />
          <text
            x={x1 + 9} y={y1 + 15}
            fill="white"
            fontSize={11}
            fontFamily="Arial"
            fontWeight="bold"
          >
            {label}
          </text>
        </>
      )}
      {/* Mitigated X stamp */}
      {mitigated && progress > 0.8 && (
        <text
          x={x1 + currentWidth / 2 - 8}
          y={y1 + (y2 - y1) / 2 + 5}
          fill="rgba(220,80,80,0.5)"
          fontSize={14}
          fontFamily="Arial"
          fontWeight="bold"
        >
          USED
        </text>
      )}
    </g>
  );
};

// ── DemandZone ─────────────────────────────────────────────────────────────
export const DemandZone = ({
  y_top_pct    = 0.6,
  y_bottom_pct = 0.75,
  x_start_pct  = 0,
  x_end_pct    = 1,
  label,
  mitigated    = false,
  start_ms     = 0,
  chart_x      = 20,
  chart_y      = 40,
  chart_w      = 700,
  chart_h      = 400,
  brand,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const startFrame   = Math.round((start_ms / 1000) * fps);
  if (frame < startFrame) return null;

  const localFrame   = frame - startFrame;
  const expandFrames = Math.round(fps * 0.4);

  const progress = interpolate(localFrame, [0, expandFrames], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  const x1 = chart_x + x_start_pct * chart_w;
  const x2 = chart_x + x_end_pct   * chart_w;
  const y1 = chart_y + y_top_pct    * chart_h;
  const y2 = chart_y + y_bottom_pct * chart_h;

  const currentWidth = (x2 - x1) * progress;
  const zoneOpacity  = mitigated ? 0.3 : 0.85;
  const fillOpacity  = mitigated ? 0.12 : 0.22;

  const fade = interpolate(localFrame, [0, 8], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  return (
    <g opacity={fade * zoneOpacity}>
      <rect
        x={x1} y={y1}
        width={currentWidth}
        height={y2 - y1}
        fill={`rgba(60,100,220,${fillOpacity})`}
      />
      <line
        x1={x1} y1={y1}
        x2={x1 + currentWidth} y2={y1}
        stroke="rgba(80,120,230,0.7)"
        strokeWidth={1}
        strokeDasharray="4 3"
      />
      <line
        x1={x1} y1={y2}
        x2={x1 + currentWidth} y2={y2}
        stroke="rgba(80,120,230,0.7)"
        strokeWidth={1.5}
      />
      {label && progress > 0.5 && (
        <>
          <rect
            x={x1 + 4} y={y2 - 22}
            width={label.length * 7 + 10}
            height={18}
            fill="rgba(60,100,220,0.85)"
            rx={3}
          />
          <text
            x={x1 + 9} y={y2 - 11}
            fill="white"
            fontSize={11}
            fontFamily="Arial"
            fontWeight="bold"
          >
            {label}
          </text>
        </>
      )}
      {mitigated && progress > 0.8 && (
        <text
          x={x1 + currentWidth / 2 - 12}
          y={y1 + (y2 - y1) / 2 + 5}
          fill="rgba(80,120,220,0.5)"
          fontSize={14}
          fontFamily="Arial"
          fontWeight="bold"
        >
          USED
        </text>
      )}
    </g>
  );
};
