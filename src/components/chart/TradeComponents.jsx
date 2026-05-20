// ── chart/TradeComponents.jsx ─────────────────────────────────────────────
// Complete trade visualization components.
// All render as SVG — must be placed inside a <svg> wrapper or ChartCanvas.

import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate } from 'remotion';

// ── TradeSetup ────────────────────────────────────────────────────────────
// Complete trade: entry line, SL line, TP line, risk zone, profit zone, R:R label.
// Lines appear sequentially: entry first, then SL and TP together, then zones.
export const TradeSetup = ({
  entry_y_pct  = 0.5,
  sl_y_pct     = 0.65,   // stop loss — below entry for long, above for short
  tp_y_pct     = 0.2,    // take profit — above entry for long, below for short
  x_start_pct  = 0.5,
  x_end_pct    = 0.95,
  direction    = 'long', // 'long' or 'short'
  rr_ratio     = '1:3',  // displayed as text label
  start_ms     = 0,
  chart_x = 20, chart_y = 40, chart_w = 700, chart_h = 400,
  brand,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const startFrame = Math.round((start_ms / 1000) * fps);
  if (frame < startFrame) return null;

  const localF   = frame - startFrame;
  const phaseF   = Math.round(fps * 0.35); // each phase takes 0.35s

  // Phase 1: entry line appears
  const entryProgress = interpolate(localF, [0, phaseF], [0, 1], { extrapolateLeft:'clamp', extrapolateRight:'clamp' });
  // Phase 2: SL and TP lines appear
  const slTpProgress  = interpolate(localF, [phaseF, phaseF*2], [0, 1], { extrapolateLeft:'clamp', extrapolateRight:'clamp' });
  // Phase 3: zones and R:R label appear
  const zoneProgress  = interpolate(localF, [phaseF*2, phaseF*3], [0, 1], { extrapolateLeft:'clamp', extrapolateRight:'clamp' });

  const x1 = chart_x + x_start_pct * chart_w;
  const x2 = chart_x + x_end_pct   * chart_w;
  const entryY = chart_y + entry_y_pct * chart_h;
  const slY    = chart_y + sl_y_pct    * chart_h;
  const tpY    = chart_y + tp_y_pct    * chart_h;

  const currentX2 = x1 + (x2 - x1);
  const gold  = brand?.accent  || '#C9A84C';
  const green = brand?.success || '#166534';
  const red   = brand?.danger  || '#991B1B';

  return (
    <g>
      {/* Entry line — gold */}
      <line x1={x1} y1={entryY} x2={x1 + (currentX2-x1)*entryProgress} y2={entryY}
        stroke={gold} strokeWidth={2} />
      {entryProgress > 0.8 && (
        <text x={currentX2+4} y={entryY+4} fill={gold} fontSize={11} fontFamily="Arial" fontWeight="bold">ENTRY</text>
      )}

      {/* SL line — red */}
      <line x1={x1} y1={slY} x2={x1+(currentX2-x1)*slTpProgress} y2={slY}
        stroke={`rgba(220,80,80,${slTpProgress})`} strokeWidth={1.5} />
      {slTpProgress > 0.8 && (
        <text x={currentX2+4} y={slY+4} fill="rgba(220,80,80,0.9)" fontSize={11} fontFamily="Arial" fontWeight="bold">SL</text>
      )}

      {/* TP line — green */}
      <line x1={x1} y1={tpY} x2={x1+(currentX2-x1)*slTpProgress} y2={tpY}
        stroke={`rgba(40,160,80,${slTpProgress})`} strokeWidth={1.5} />
      {slTpProgress > 0.8 && (
        <text x={currentX2+4} y={tpY+4} fill="rgba(40,160,80,0.9)" fontSize={11} fontFamily="Arial" fontWeight="bold">TP</text>
      )}

      {/* Risk zone — red fill between entry and SL */}
      <rect x={x1} y={Math.min(entryY, slY)}
        width={(currentX2-x1)*zoneProgress}
        height={Math.abs(slY-entryY)}
        fill={`rgba(200,60,60,${0.15*zoneProgress})`} />

      {/* Profit zone — green fill between entry and TP */}
      <rect x={x1} y={Math.min(entryY, tpY)}
        width={(currentX2-x1)*zoneProgress}
        height={Math.abs(tpY-entryY)}
        fill={`rgba(40,160,80,${0.12*zoneProgress})`} />

      {/* R:R label */}
      {zoneProgress > 0.7 && (
        <>
          <rect x={x2-50} y={Math.min(entryY,tpY)+8} width={46} height={20} fill="rgba(20,20,20,0.85)" rx={4} />
          <text x={x2-48} y={Math.min(entryY,tpY)+21} fill="white" fontSize={12} fontFamily="Arial" fontWeight="bold">
            {rr_ratio}
          </text>
        </>
      )}
    </g>
  );
};

// ── EquilibriumEntry ──────────────────────────────────────────────────────
// The 50% entry level on a candle with large wick.
export const EquilibriumEntry = ({
  y_pct     = 0.45,
  x_pct     = 0.5,
  candle_w_pct = 0.04,
  start_ms  = 0,
  chart_x = 20, chart_y = 40, chart_w = 700, chart_h = 400,
  brand,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const startFrame = Math.round((start_ms / 1000) * fps);
  if (frame < startFrame) return null;
  const localF = frame - startFrame;
  const fade   = interpolate(localF, [0, 10], [0, 1], { extrapolateLeft:'clamp', extrapolateRight:'clamp' });
  const gold   = brand?.accent || '#C9A84C';

  const cx    = chart_x + x_pct * chart_w;
  const y     = chart_y + y_pct * chart_h;
  const halfW = chart_w * candle_w_pct;

  return (
    <g opacity={fade}>
      <line x1={cx-halfW} y1={y} x2={cx+halfW} y2={y}
        stroke={gold} strokeWidth={2} strokeDasharray="4 3" />
      <text x={cx+halfW+4} y={y+4} fill={gold} fontSize={11} fontFamily="Arial" fontWeight="bold">
        50% EQ
      </text>
    </g>
  );
};

// ── BreakEven ─────────────────────────────────────────────────────────────
// Horizontal line at entry price — trade moved to break even.
export const BreakEven = ({
  y_pct     = 0.5,
  x_start_pct = 0.5,
  x_end_pct = 0.95,
  start_ms  = 0,
  chart_x = 20, chart_y = 40, chart_w = 700, chart_h = 400,
  brand,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const startFrame = Math.round((start_ms / 1000) * fps);
  if (frame < startFrame) return null;
  const localF   = frame - startFrame;
  const progress = interpolate(localF, [0, Math.round(fps*0.4)], [0, 1], { extrapolateLeft:'clamp', extrapolateRight:'clamp' });
  const fade     = interpolate(localF, [0, 8], [0, 1], { extrapolateLeft:'clamp', extrapolateRight:'clamp' });
  const gold     = brand?.accent || '#C9A84C';

  const x1 = chart_x + x_start_pct * chart_w;
  const x2 = chart_x + x_end_pct   * chart_w;
  const y  = chart_y + y_pct * chart_h;

  return (
    <g opacity={fade}>
      <line x1={x1} y1={y} x2={x1+(x2-x1)*progress} y2={y}
        stroke={gold} strokeWidth={1.5} strokeDasharray="5 4" />
      {progress > 0.8 && (
        <text x={x2+4} y={y+4} fill={gold} fontSize={11} fontFamily="Arial" fontWeight="bold">BE</text>
      )}
    </g>
  );
};
