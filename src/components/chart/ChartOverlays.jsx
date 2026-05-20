// ── chart/ChartOverlays.jsx ───────────────────────────────────────────────
// All chart overlay SVG components that sit on top of LiveCandleChart.
// These are pure SVG — they must be rendered inside an <svg> tag
// or via ChartCanvas which provides the svg wrapper.

import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate } from 'remotion';

// ── FairValueGap ──────────────────────────────────────────────────────────
// The imbalance/inefficiency zone between two candle wicks.
// Olive/yellow-green fill with dotted top and bottom borders.
export const FairValueGap = ({
  y_top_pct    = 0.4,
  y_bottom_pct = 0.5,
  x_start_pct  = 0.3,
  x_end_pct    = 1,
  label        = 'FVG',
  start_ms     = 0,
  chart_x = 20, chart_y = 40, chart_w = 700, chart_h = 400,
  brand,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const startFrame = Math.round((start_ms / 1000) * fps);
  if (frame < startFrame) return null;
  const localF  = frame - startFrame;
  const progress = interpolate(localF, [0, Math.round(fps * 0.4)], [0, 1], { extrapolateLeft:'clamp', extrapolateRight:'clamp' });
  const fade    = interpolate(localF, [0, 8], [0, 1], { extrapolateLeft:'clamp', extrapolateRight:'clamp' });

  const x1 = chart_x + x_start_pct * chart_w;
  const x2 = chart_x + x_end_pct   * chart_w;
  const y1 = chart_y + y_top_pct    * chart_h;
  const y2 = chart_y + y_bottom_pct * chart_h;
  const w  = (x2 - x1) * progress;

  return (
    <g opacity={fade * 0.9}>
      <rect x={x1} y={y1} width={w} height={y2-y1} fill="rgba(170,150,50,0.2)" />
      <line x1={x1} y1={y1} x2={x1+w} y2={y1} stroke="rgba(200,170,60,0.7)" strokeWidth={1} strokeDasharray="5 4" />
      <line x1={x1} y1={y2} x2={x1+w} y2={y2} stroke="rgba(200,170,60,0.7)" strokeWidth={1} strokeDasharray="5 4" />
      {label && progress > 0.6 && (
        <>
          <rect x={x1+w-40} y={y1+4} width={36} height={16} fill="rgba(170,150,50,0.85)" rx={3} />
          <text x={x1+w-36} y={y1+14} fill="white" fontSize={10} fontFamily="Arial" fontWeight="bold">{label}</text>
        </>
      )}
    </g>
  );
};

// ── OrderBlock ────────────────────────────────────────────────────────────
// The specific candle that created the zone — highlighted with colored outline.
export const OrderBlock = ({
  y_top_pct    = 0.35,
  y_bottom_pct = 0.45,
  x_start_pct  = 0.2,
  x_end_pct    = 0.28,
  direction    = 'bullish', // 'bullish' or 'bearish'
  label        = 'OB',
  start_ms     = 0,
  chart_x = 20, chart_y = 40, chart_w = 700, chart_h = 400,
  brand,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const startFrame = Math.round((start_ms / 1000) * fps);
  if (frame < startFrame) return null;
  const localF = frame - startFrame;
  const fade   = interpolate(localF, [0, 10], [0, 1], { extrapolateLeft:'clamp', extrapolateRight:'clamp' });

  const x1 = chart_x + x_start_pct * chart_w;
  const x2 = chart_x + x_end_pct   * chart_w;
  const y1 = chart_y + y_top_pct    * chart_h;
  const y2 = chart_y + y_bottom_pct * chart_h;
  const color = direction === 'bullish' ? 'rgba(80,120,230,0.9)' : 'rgba(220,80,80,0.9)';
  const fill  = direction === 'bullish' ? 'rgba(80,120,230,0.1)' : 'rgba(220,80,80,0.1)';

  return (
    <g opacity={fade}>
      <rect x={x1} y={y1} width={x2-x1} height={y2-y1} fill={fill} stroke={color} strokeWidth={2} />
      <text x={x1+3} y={y1-4} fill={color} fontSize={11} fontFamily="Arial" fontWeight="bold">{label}</text>
    </g>
  );
};

// ── LiquidityLevel ────────────────────────────────────────────────────────
// Dotted horizontal line marking equal highs/lows with $$$ label.
export const LiquidityLevel = ({
  y_pct      = 0.3,
  x_start_pct = 0,
  x_end_pct  = 0.7,
  label      = '$$$',
  swept      = false, // if true, shows "SWEPT" and breaks the line
  start_ms   = 0,
  chart_x = 20, chart_y = 40, chart_w = 700, chart_h = 400,
  brand,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const startFrame = Math.round((start_ms / 1000) * fps);
  if (frame < startFrame) return null;
  const localF   = frame - startFrame;
  const sweepF   = Math.round(fps * 0.5);
  const progress = interpolate(localF, [0, sweepF], [0, 1], { extrapolateLeft:'clamp', extrapolateRight:'clamp' });
  const fade     = interpolate(localF, [0, 8], [0, 1], { extrapolateLeft:'clamp', extrapolateRight:'clamp' });

  const x1 = chart_x + x_start_pct * chart_w;
  const x2 = chart_x + x_end_pct   * chart_w;
  const y  = chart_y + y_pct * chart_h;
  const currentX2 = x1 + (x2 - x1) * progress;
  const gold = brand?.accent || '#C9A84C';

  return (
    <g opacity={fade}>
      <line x1={x1} y1={y} x2={currentX2} y2={y}
        stroke={swept ? 'rgba(220,80,80,0.6)' : `${gold}cc`}
        strokeWidth={1.5} strokeDasharray="6 4" />
      {progress > 0.5 && (
        <text x={currentX2 - 30} y={y - 6} fill={gold} fontSize={14} fontFamily="Arial" fontWeight="bold">
          {swept ? '✗ SWEPT' : label}
        </text>
      )}
    </g>
  );
};

// ── TrendLine ─────────────────────────────────────────────────────────────
// Diagonal line for trendline liquidity. Draws itself from point A to B.
export const TrendLine = ({
  x1_pct  = 0,
  y1_pct  = 0.7,
  x2_pct  = 0.8,
  y2_pct  = 0.3,
  color   = 'rgba(255,255,255,0.6)',
  dashed  = true,
  label,
  start_ms = 0,
  chart_x = 20, chart_y = 40, chart_w = 700, chart_h = 400,
  brand,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const startFrame  = Math.round((start_ms / 1000) * fps);
  if (frame < startFrame) return null;
  const localF  = frame - startFrame;
  const drawF   = Math.round(fps * 0.6);
  const progress = interpolate(localF, [0, drawF], [0, 1], { extrapolateLeft:'clamp', extrapolateRight:'clamp' });
  const fade    = interpolate(localF, [0, 8], [0, 1], { extrapolateLeft:'clamp', extrapolateRight:'clamp' });

  const ax = chart_x + x1_pct * chart_w;
  const ay = chart_y + y1_pct * chart_h;
  const bx = chart_x + x2_pct * chart_w;
  const by = chart_y + y2_pct * chart_h;
  const cx = ax + (bx - ax) * progress;
  const cy = ay + (by - ay) * progress;

  return (
    <g opacity={fade}>
      <line x1={ax} y1={ay} x2={cx} y2={cy}
        stroke={color} strokeWidth={1.5}
        strokeDasharray={dashed ? '6 5' : 'none'} />
      {label && progress > 0.8 && (
        <text x={cx + 4} y={cy - 4} fill={color} fontSize={11} fontFamily="Arial">{label}</text>
      )}
    </g>
  );
};

// ── KeyLevelLine ──────────────────────────────────────────────────────────
// Single horizontal line (solid or dashed) sweeping in from left.
// Label appears at right edge.
export const KeyLevelLine = ({
  y_pct      = 0.4,
  x_start_pct = 0,
  x_end_pct  = 0.85,
  label      = 'KEY LEVEL',
  color      = 'rgba(255,255,255,0.7)',
  dashed     = false,
  label_side = 'right', // 'left' or 'right'
  start_ms   = 0,
  chart_x = 20, chart_y = 40, chart_w = 700, chart_h = 400,
  brand,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const startFrame = Math.round((start_ms / 1000) * fps);
  if (frame < startFrame) return null;
  const localF   = frame - startFrame;
  const sweepF   = Math.round(fps * 0.5);
  const progress = interpolate(localF, [0, sweepF], [0, 1], { extrapolateLeft:'clamp', extrapolateRight:'clamp' });
  const fade     = interpolate(localF, [0, 8], [0, 1], { extrapolateLeft:'clamp', extrapolateRight:'clamp' });

  const x1      = chart_x + x_start_pct * chart_w;
  const maxX2   = chart_x + x_end_pct   * chart_w;
  const y       = chart_y + y_pct * chart_h;
  const currentX2 = x1 + (maxX2 - x1) * progress;

  return (
    <g opacity={fade}>
      <line x1={x1} y1={y} x2={currentX2} y2={y}
        stroke={color} strokeWidth={1.5}
        strokeDasharray={dashed ? '6 5' : 'none'} />
      {label && progress > 0.7 && (
        <text
          x={label_side === 'right' ? currentX2 + 4 : x1 - 4}
          y={y - 4}
          fill={color}
          fontSize={11}
          fontFamily="Arial"
          fontWeight="bold"
          textAnchor={label_side === 'right' ? 'start' : 'end'}
        >
          {label}
        </text>
      )}
    </g>
  );
};

// ── StructureLabel ────────────────────────────────────────────────────────
// Small label (BOS, CHoCH, HH, HL etc) appearing at a chart position.
export const StructureLabel = ({
  x_pct    = 0.5,
  y_pct    = 0.3,
  label    = 'BOS',
  position = 'above', // 'above' or 'below'
  color    = 'rgba(255,255,255,0.85)',
  start_ms = 0,
  chart_x = 20, chart_y = 40, chart_w = 700, chart_h = 400,
  brand,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const startFrame = Math.round((start_ms / 1000) * fps);
  if (frame < startFrame) return null;
  const localF = frame - startFrame;
  const fade   = interpolate(localF, [0, 10], [0, 1], { extrapolateLeft:'clamp', extrapolateRight:'clamp' });
  const ty     = interpolate(localF, [0, 10], [position === 'above' ? 8 : -8, 0], { extrapolateLeft:'clamp', extrapolateRight:'clamp' });

  const x  = chart_x + x_pct * chart_w;
  const y  = chart_y + y_pct * chart_h;
  const ly = position === 'above' ? y - 6 + ty : y + 14 + ty;

  // Dashed line below/above label
  return (
    <g opacity={fade}>
      <line x1={x - 20} y1={y} x2={x + 20} y2={y}
        stroke={color} strokeWidth={1} strokeDasharray="4 3" />
      <text x={x} y={ly} fill={color} fontSize={12} fontFamily="Arial"
        fontWeight="bold" textAnchor="middle">
        {label}
      </text>
    </g>
  );
};

// ── PriceArrow ────────────────────────────────────────────────────────────
// Directional arrow showing expected price path. Draws itself along the path.
export const PriceArrow = ({
  x1_pct   = 0.5,
  y1_pct   = 0.5,
  x2_pct   = 0.9,
  y2_pct   = 0.2,
  color    = 'rgba(255,255,255,0.7)',
  dashed   = true,
  start_ms = 0,
  chart_x = 20, chart_y = 40, chart_w = 700, chart_h = 400,
  brand,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const startFrame = Math.round((start_ms / 1000) * fps);
  if (frame < startFrame) return null;
  const localF   = frame - startFrame;
  const drawF    = Math.round(fps * 0.6);
  const progress = interpolate(localF, [0, drawF], [0, 1], { extrapolateLeft:'clamp', extrapolateRight:'clamp' });
  const fade     = interpolate(localF, [0, 8], [0, 1], { extrapolateLeft:'clamp', extrapolateRight:'clamp' });

  const ax = chart_x + x1_pct * chart_w;
  const ay = chart_y + y1_pct * chart_h;
  const bx = chart_x + x2_pct * chart_w;
  const by = chart_y + y2_pct * chart_h;
  const cx = ax + (bx - ax) * progress;
  const cy = ay + (by - ay) * progress;

  const arrowId = `arrow-${start_ms}`;

  return (
    <g opacity={fade}>
      <defs>
        <marker id={arrowId} markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
          <polygon points="0 0, 8 3, 0 6" fill={color} opacity={progress > 0.9 ? 1 : 0} />
        </marker>
      </defs>
      <line x1={ax} y1={ay} x2={cx} y2={cy}
        stroke={color} strokeWidth={1.5}
        strokeDasharray={dashed ? '8 5' : 'none'}
        markerEnd={`url(#${arrowId})`} />
    </g>
  );
};

// ── SSSMarker ─────────────────────────────────────────────────────────────
// Wilfred's signature $$$ liquidity marker — bounces in above/below a level.
export const SSSMarker = ({
  x_pct    = 0.5,
  y_pct    = 0.3,
  position = 'above', // 'above' or 'below'
  start_ms = 0,
  chart_x = 20, chart_y = 40, chart_w = 700, chart_h = 400,
  brand,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const startFrame = Math.round((start_ms / 1000) * fps);
  if (frame < startFrame) return null;
  const localF = frame - startFrame;
  const bounce = Math.sin(localF / (fps * 0.8) * Math.PI * 2) * 3;
  const fade   = interpolate(localF, [0, 10], [0, 1], { extrapolateLeft:'clamp', extrapolateRight:'clamp' });
  const scale  = interpolate(localF, [0, 8], [0, 1], { extrapolateLeft:'clamp', extrapolateRight:'clamp' });

  const x = chart_x + x_pct * chart_w;
  const y = chart_y + y_pct * chart_h;
  const ly = position === 'above' ? y - 20 + bounce : y + 28 + bounce;
  const gold = brand?.accent || '#C9A84C';

  return (
    <g opacity={fade} transform={`scale(${scale})`} style={{ transformOrigin: `${x}px ${ly}px` }}>
      <text x={x} y={ly} fill={gold} fontSize={16} fontFamily="Arial"
        fontWeight="bold" textAnchor="middle">
        $$$
      </text>
    </g>
  );
};

// ── ChartBorderFrame ──────────────────────────────────────────────────────
// The brand accent lines framing the chart — from the reference video.
// Renders as a React component (not SVG only) so it uses AbsoluteFill.
import { AbsoluteFill } from 'remotion';

export const ChartBorderFrame = ({
  top_y_pct    = 0.08,
  bottom_y_pct = 0.65,
  color,
  start_ms     = 0,
  brand,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const startFrame = Math.round((start_ms / 1000) * fps);
  if (frame < startFrame) return null;
  const localF = frame - startFrame;
  const progress = interpolate(localF, [0, Math.round(fps * 0.4)], [0, 1], { extrapolateLeft:'clamp', extrapolateRight:'clamp' });
  const lineColor = color || brand?.accent || '#C9A84C';

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <svg width={width} height={height} style={{ position: 'absolute', top: 0, left: 0 }}>
        {/* Top line */}
        <line
          x1={0} y1={height * top_y_pct}
          x2={width * progress} y2={height * top_y_pct}
          stroke={lineColor} strokeWidth={3}
        />
        {/* Bottom line — sweeps from right to left */}
        <line
          x1={width * (1 - progress)} y1={height * bottom_y_pct}
          x2={width} y2={height * bottom_y_pct}
          stroke={lineColor} strokeWidth={3}
        />
      </svg>
    </AbsoluteFill>
  );
};

// ── TimeframeLabel ────────────────────────────────────────────────────────
// "15M" or "4H" badge label for zones.
export const TimeframeLabel = ({
  x_pct    = 0.05,
  y_pct    = 0.85,
  label    = '15M',
  start_ms = 0,
  chart_x = 20, chart_y = 40, chart_w = 700, chart_h = 400,
  brand,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const startFrame = Math.round((start_ms / 1000) * fps);
  if (frame < startFrame) return null;
  const localF = frame - startFrame;
  const fade   = interpolate(localF, [0, 8], [0, 1], { extrapolateLeft:'clamp', extrapolateRight:'clamp' });
  const x = chart_x + x_pct * chart_w;
  const y = chart_y + y_pct * chart_h;
  const navy = brand?.primary || '#1B2A4A';

  return (
    <g opacity={fade}>
      <rect x={x} y={y} width={label.length * 8 + 8} height={18} fill={navy} rx={3} />
      <text x={x + 4} y={y + 13} fill="rgba(255,255,255,0.85)" fontSize={11}
        fontFamily="Arial" fontWeight="bold">{label}</text>
    </g>
  );
};
