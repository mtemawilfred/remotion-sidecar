// ── chart/MarketStructure.jsx ─────────────────────────────────────────────
// Animated market structure components.
// These render as full AbsoluteFill components — they are standalone scenes,
// not SVG overlays. They recreate the book's hand-drawn diagrams as animation.

import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from 'remotion';

// ── MarketStructureWave ───────────────────────────────────────────────────
// Animated zigzag showing HH/HL uptrend or LH/LL downtrend.
// BOS labels appear at each structure break.
// Demand/Supply zone boxes appear at each pullback.
// Recreates the diagram on page 15 and page 18 of the book.
//
// Props:
//   direction    — 'up' (uptrend) or 'down' (downtrend)
//   show_labels  — show BOS/CHoCH labels (default true)
//   show_zones   — show demand/supply zone boxes (default true)
//   points       — array of {x_pct, y_pct} defining the wave path
//                  if omitted, defaults are used
//   start_ms     — when animation begins
//   draw_speed_ms — ms per path segment (default 600)
export const MarketStructureWave = ({
  direction     = 'up',
  show_labels   = true,
  show_zones    = true,
  start_ms      = 0,
  draw_speed_ms = 600,
  points,        // optional custom path
  brand,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const startFrame = Math.round((start_ms / 1000) * fps);
  if (frame < startFrame) return null;
  const localF = frame - startFrame;

  // Default uptrend points — HH HL HH HL HH pattern
  const defaultUp = [
    { x: 0.05, y: 0.75 },  // start low
    { x: 0.18, y: 0.45 },  // first high
    { x: 0.28, y: 0.62 },  // first higher low (demand zone)
    { x: 0.42, y: 0.32 },  // second higher high — BOS
    { x: 0.52, y: 0.50 },  // second higher low (demand zone)
    { x: 0.68, y: 0.20 },  // third higher high — BOS
    { x: 0.78, y: 0.38 },  // third higher low (demand zone)
    { x: 0.92, y: 0.10 },  // final move up — BOS
  ];

  const defaultDown = [
    { x: 0.05, y: 0.25 },  // start high
    { x: 0.18, y: 0.55 },  // first low
    { x: 0.28, y: 0.38 },  // first lower high (supply zone)
    { x: 0.42, y: 0.68 },  // second lower low — BOS
    { x: 0.52, y: 0.50 },  // second lower high (supply zone)
    { x: 0.68, y: 0.80 },  // third lower low — BOS
    { x: 0.78, y: 0.62 },  // third lower high (supply zone)
    { x: 0.92, y: 0.90 },  // final move down — BOS
  ];

  const pts = points || (direction === 'up' ? defaultUp : defaultDown);

  // How many segments drawn so far
  const segFrames   = Math.round((draw_speed_ms / 1000) * fps);
  const segsDone    = Math.floor(localF / segFrames);
  const segProgress = (localF % segFrames) / segFrames;

  const mainColor   = '#FFFFFF';
  // BOS positions — every other peak/valley is a structure break
  const bosPositions = pts.filter((_, i) => i > 0 && i % 2 === 0);
  const zonePositions = pts.filter((_, i) => i > 0 && i % 2 === 1);

  const zoneColor = direction === 'up'
    ? 'rgba(60,100,220,0.18)'
    : 'rgba(200,60,60,0.18)';
  const zoneBorder = direction === 'up'
    ? 'rgba(80,120,230,0.6)'
    : 'rgba(220,80,80,0.6)';
  const gold = brand?.accent || '#C9A84C';

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <svg width={width} height={height} style={{ position: 'absolute', top: 0, left: 0 }}>

        {/* Draw wave segments sequentially */}
        {pts.slice(0, -1).map((pt, i) => {
          if (i >= segsDone + 1) return null; // not yet
          const next = pts[i + 1];

          // Current segment still drawing
          const isDrawing = i === segsDone;
          const x1 = pt.x   * width;
          const y1 = pt.y   * height;
          const x2 = next.x * width;
          const y2 = next.y * height;
          const cx = isDrawing ? x1 + (x2 - x1) * segProgress : x2;
          const cy = isDrawing ? y1 + (y2 - y1) * segProgress : y2;

          // Is this a BOS segment (impulsive move)?
          const isBOS = i % 2 === 0 && i > 0;

          return (
            <line
              key={i}
              x1={x1} y1={y1} x2={cx} y2={cy}
              stroke={mainColor}
              strokeWidth={isBOS ? 2.5 : 1.8}
              strokeLinecap="round"
            />
          );
        })}

        {/* Demand/Supply zone boxes at pullback points */}
        {show_zones && zonePositions.map((pt, i) => {
          const segIdx = pts.indexOf(pt);
          if (segIdx > segsDone) return null;
          const fade = Math.min((segsDone - segIdx) / 2, 1);
          const x = pt.x * width;
          const y = pt.y * height;
          const zoneH = height * 0.08;
          const zoneW = width  * 0.12;
          const zy = direction === 'up' ? y - zoneH * 0.3 : y - zoneH * 0.7;

          return (
            <g key={i} opacity={fade * 0.9}>
              <rect x={x - zoneW * 0.5} y={zy}
                width={zoneW} height={zoneH}
                fill={zoneColor} />
              <line x1={x - zoneW * 0.5} y1={zy + zoneH}
                x2={x + zoneW * 0.5} y2={zy + zoneH}
                stroke={zoneBorder} strokeWidth={1.5} />
              <line x1={x - zoneW * 0.5} y1={zy}
                x2={x + zoneW * 0.5} y2={zy}
                stroke={zoneBorder} strokeWidth={1} strokeDasharray="4 3" />
            </g>
          );
        })}

        {/* BOS labels at structure break points */}
        {show_labels && bosPositions.map((pt, i) => {
          const segIdx = pts.indexOf(pt);
          if (segIdx > segsDone) return null;
          const fade = Math.min((segsDone - segIdx) / 2, 1);
          const x = pt.x * width;
          const y = pt.y * height;
          const ly = direction === 'up' ? y - 16 : y + 20;

          return (
            <g key={i} opacity={fade}>
              <line x1={x - 24} y1={y} x2={x + 24} y2={y}
                stroke="rgba(255,255,255,0.5)" strokeWidth={1} strokeDasharray="4 3" />
              <text x={x} y={ly} fill="rgba(255,255,255,0.9)" fontSize={13}
                fontFamily="Arial" fontWeight="bold" textAnchor="middle">
                BOS
              </text>
            </g>
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};

// ── SwingPointLabel ───────────────────────────────────────────────────────
// HH, HL, LH, LL with curved arc (strong/weak) — from book diagram p.24
export const SwingPointLabel = ({
  points = [], // [{ x_pct, y_pct, label, strength }]
              // label: 'HH','HL','LH','LL'
              // strength: 'strong' or 'weak'
  start_ms = 0,
  interval_ms = 300,
  brand,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const startFrame = Math.round((start_ms / 1000) * fps);
  if (frame < startFrame) return null;
  const localF     = frame - startFrame;
  const intervalF  = Math.round((interval_ms / 1000) * fps);
  const visibleCount = Math.floor(localF / intervalF) + 1;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <svg width={width} height={height} style={{ position: 'absolute', top: 0, left: 0 }}>
        {points.slice(0, visibleCount).map((pt, i) => {
          const x = pt.x_pct * width;
          const y = pt.y_pct * height;
          const isHigh  = pt.label.includes('H') && !pt.label.includes('L');
          const isStrong = pt.strength === 'strong';
          const arcY    = isHigh ? y - 12 : y + 28;
          const color   = isHigh
            ? (isStrong ? 'rgba(220,80,80,0.9)' : 'rgba(220,80,80,0.5)')
            : (isStrong ? 'rgba(80,120,230,0.9)' : 'rgba(80,120,230,0.5)');
          const dash    = isStrong ? 'none' : '4 3';

          const fade = interpolate(localF - i*intervalF, [0, 8], [0, 1], { extrapolateLeft:'clamp', extrapolateRight:'clamp' });

          return (
            <g key={i} opacity={fade}>
              {/* Curved arc above/below the point */}
              <path
                d={`M ${x-20} ${arcY} Q ${x} ${arcY + (isHigh ? -10 : 10)} ${x+20} ${arcY}`}
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeDasharray={dash}
              />
              {/* Label */}
              <text
                x={x}
                y={isHigh ? arcY - 14 : arcY + 18}
                fill={color}
                fontSize={12}
                fontFamily="Arial"
                fontWeight="bold"
                textAnchor="middle"
              >
                {pt.label}
              </text>
            </g>
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};

// ── ControlLabel ──────────────────────────────────────────────────────────
// "SUPPLY IS IN CONTROL" or "DEMAND IS IN CONTROL" — full width banner.
export const ControlLabel = ({
  side     = 'supply', // 'supply' or 'demand'
  start_ms = 0,
  brand,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const startFrame = Math.round((start_ms / 1000) * fps);
  if (frame < startFrame) return null;
  const localF = frame - startFrame;
  const progress = interpolate(localF, [0, Math.round(fps*0.4)], [0, 1], { extrapolateLeft:'clamp', extrapolateRight:'clamp' });
  const fade    = interpolate(localF, [0, 10], [0, 1], { extrapolateLeft:'clamp', extrapolateRight:'clamp' });

  const text  = side === 'supply' ? 'SUPPLY IS IN CONTROL' : 'DEMAND IS IN CONTROL';
  const bgColor = side === 'supply' ? 'rgba(200,60,60,0.85)' : 'rgba(60,100,220,0.85)';
  const bannerH = 48;
  const bannerW = width * progress;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <svg width={width} height={height} style={{ position: 'absolute', top: 0, left: 0 }}>
        <rect x={0} y={height * 0.08} width={bannerW} height={bannerH} fill={bgColor} />
        {progress > 0.5 && (
          <text
            x={bannerW / 2}
            y={height * 0.08 + bannerH / 2 + 6}
            fill="white"
            fontSize={20}
            fontFamily="Arial"
            fontWeight="bold"
            textAnchor="middle"
            opacity={fade}
          >
            {text}
          </text>
        )}
      </svg>
    </AbsoluteFill>
  );
};
