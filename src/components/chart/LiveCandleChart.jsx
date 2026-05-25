// ── chart/LiveCandleChart.jsx ─────────────────────────────────────────────
// The core SVG candlestick chart engine.
//
// HOW CANDLES ANIMATE (updated — fixed position mode):
//   - All candles occupy permanent left-to-right slots in the chart area.
//   - Candle 0 always sits at the leftmost slot. Candle N always sits at
//     its fixed slot. Nothing ever moves.
//   - Candles appear one by one from left to right over time.
//   - Each forming candle grows from its open price in the direction of
//     the close — bullish grows upward, bearish grows downward.
//   - Once a candle is fully formed it stays in place permanently.
//
// WHY fixed positions:
//   Overlays (SupplyZone, OrderBlock, etc.) need to point to specific
//   candles. If candles move (pan), overlays can never align to them.
//   Fixed positions make every candle's x coordinate predictable:
//     candle_center_x = chartX + (N + 0.5) / totalCandles * chartW
//
// visible_count prop is accepted for backward compatibility but ignored.
// All candles are always visible in their fixed slots.
//
// Props:
//   candles            — array of { o, h, l, c } objects
//   candle_interval_ms — how long each candle takes to appear (default 400ms)
//   start_ms           — when the chart starts rendering
//   visible_count      — IGNORED (kept for backward compat with WF-A/WF-B)
//   candle_width       — candle body width in px (default 28)
//   candle_gap         — gap between candles in px (default 8)
//   bullish_color      — color for bullish candles
//   bearish_color      — color for bearish candles
//   wick_color         — wick color
//   show_price_axis    — show price labels on right side (default false)
//   show_baseline      — show bottom baseline (default true)
//   height_pct         — fraction of canvas height to use (default 0.65)
//   y_offset_pct       — vertical offset from top (default 0.05)
//   x_offset_pct       — horizontal offset from left (default 0.02)

import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from 'remotion';

export const LiveCandleChart = ({
  candles            = [],
  candle_interval_ms = 400,
  start_ms           = 0,
  visible_count,            // accepted but ignored — see comment above
  candle_width       = 28,
  candle_gap         = 8,
  bullish_color,
  bearish_color,
  wick_color,
  show_price_axis    = false,
  show_baseline      = true,
  height_pct         = 0.65,
  y_offset_pct       = 0.05,
  x_offset_pct       = 0.02,
  brand,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const startFrame = Math.round((start_ms / 1000) * fps);
  if (frame < startFrame) return null;

  const localFrame = frame - startFrame;
  const localMs    = (localFrame / fps) * 1000;

  // ── Colors ───────────────────────────────────────────────────────────────
  const bullColor = bullish_color || brand?.secondary || '#FFFFFF';
  const bearColor = bearish_color || brand?.gray       || '#6B7280';
  const wkColor   = wick_color   || '#AAAAAA';

  // ── Chart dimensions ─────────────────────────────────────────────────────
  const chartX = width  * x_offset_pct;
  const chartY = height * y_offset_pct;
  const chartW = width  * (1 - x_offset_pct * 2);
  const chartH = height * height_pct;

  // ── How many candles have appeared so far ────────────────────────────────
  // candlesDone: number of fully completed candles
  // currentIdx:  index of the candle currently forming (or last candle)
  const candlesDone = Math.floor(localMs / candle_interval_ms);
  const currentIdx  = Math.min(candlesDone, candles.length - 1);

  // Once all candles have finished drawing, lock progress to 1.
  // Without this, the last candle reruns its grow animation repeatedly
  // because localMs % candle_interval_ms keeps cycling after the chart is done.
  const allDone        = candlesDone >= candles.length;
  const currentProgress = allDone
    ? 1
    : (localMs % candle_interval_ms) / candle_interval_ms;

  // ── Price scaling ─────────────────────────────────────────────────────────
  // Use ALL candles for price range — not just visible ones.
  // This keeps the y-axis stable for the entire video so candles do not
  // jump up or down as new ones appear. A stable y-axis is essential for
  // overlays (zones, levels) to stay aligned to the correct price.
  const priceMin = candles.length > 0
    ? Math.min(...candles.map(c => c.l)) * 0.998
    : 0;
  const priceMax = candles.length > 0
    ? Math.max(...candles.map(c => c.h)) * 1.002
    : 1;
  const priceRange = priceMax - priceMin || 1;

  // Convert price to Y pixel (inverted — higher price = lower Y on screen)
  const priceToY = (price) =>
    chartY + chartH - ((price - priceMin) / priceRange) * chartH;

  // ── Fixed slot width per candle ───────────────────────────────────────────
  // Divide the full chart width equally among all candles.
  // Each candle gets slotW pixels. The body sits centred in the slot
  // with candle_gap as padding on each side.
  const totalCandles = candles.length;
  const slotW        = totalCandles > 0 ? chartW / totalCandles : chartW;

  // Effective body width: slot width minus gap on both sides.
  // Clamped so body is never wider than the slot or thinner than 2px.
  const bodyW = Math.max(2, Math.min(slotW - candle_gap * 2, slotW * 0.7));

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <svg
        width={width}
        height={height}
        style={{ position: 'absolute', top: 0, left: 0 }}
      >
        {/* ── Baseline ──────────────────────────────────────────────────── */}
        {show_baseline && (
          <line
            x1={chartX}
            y1={chartY + chartH}
            x2={chartX + chartW}
            y2={chartY + chartH}
            stroke="rgba(0,0,0,0.10)"
            strokeWidth={1}
          />
        )}

        {/* ── Price axis ────────────────────────────────────────────────── */}
        {show_price_axis && (
          <>
            {[0, 0.25, 0.5, 0.75, 1].map((frac, i) => {
              const price = priceMin + frac * priceRange;
              const y     = priceToY(price);
              return (
                <g key={i}>
                  <line
                    x1={chartX} y1={y}
                    x2={chartX + chartW} y2={y}
                    stroke="rgba(0,0,0,0.06)"
                    strokeWidth={1}
                    strokeDasharray="4 6"
                  />
                  <text
                    x={chartX + chartW + 8}
                    y={y + 4}
                    fill="rgba(0,0,0,0.4)"
                    fontSize={11}
                    fontFamily="monospace"
                  >
                    {price.toFixed(4)}
                  </text>
                </g>
              );
            })}
          </>
        )}

        {/* ── Candles ───────────────────────────────────────────────────── */}
        {candles.map((candle, globalIdx) => {

          // Only render candles that have started appearing
          if (globalIdx > currentIdx) return null;

          const isForming = !allDone && globalIdx === currentIdx;
          const isBullish = candle.c >= candle.o;
          const progress  = isForming ? currentProgress : 1;

          // ── Animated values for the forming candle ─────────────────────
          // Bullish: body grows upward from open toward close.
          //          High wick extends upward simultaneously.
          //          Low wick is immediate (already below open).
          // Bearish: body grows downward from open toward close.
          //          Low wick extends downward simultaneously.
          //          High wick is immediate (already above open).
          const animatedClose = candle.o + (candle.c - candle.o) * progress;
          const animatedHigh  = isForming
            ? (isBullish
                ? candle.o + (candle.h - candle.o) * progress
                : candle.h)
            : candle.h;
          const animatedLow   = isForming
            ? (isBullish
                ? candle.l
                : candle.o + (candle.l - candle.o) * progress)
            : candle.l;

          // ── Fixed x position ───────────────────────────────────────────
          // Each candle occupies a permanent slot. Candle N's slot starts
          // at chartX + (N / totalCandles) * chartW.
          // The body is centred within that slot.
          const slotLeft  = chartX + (globalIdx / totalCandles) * chartW;
          const candleX   = slotLeft + (slotW - bodyW) / 2;
          const wickCentreX = slotLeft + slotW / 2;

          // ── Y positions ────────────────────────────────────────────────
          const bodyTop    = priceToY(Math.max(candle.o, animatedClose));
          const bodyBottom = priceToY(Math.min(candle.o, animatedClose));
          const bodyH      = Math.max(bodyBottom - bodyTop, 1);
          const wickTop    = priceToY(animatedHigh);
          const wickBottom = priceToY(animatedLow);

          const color   = isBullish ? bullColor : bearColor;

          // Fully formed past candles render at 85% opacity so the
          // currently forming candle stands out at full opacity.
          const opacity = isForming ? 1 : 0.85;

          return (
            <g key={globalIdx} opacity={opacity}>
              {/* Upper wick */}
              <line
                x1={wickCentreX} y1={wickTop}
                x2={wickCentreX} y2={bodyTop}
                stroke={wkColor}
                strokeWidth={1.5}
              />
              {/* Lower wick */}
              <line
                x1={wickCentreX} y1={bodyBottom}
                x2={wickCentreX} y2={wickBottom}
                stroke={wkColor}
                strokeWidth={1.5}
              />
              {/* Body */}
              <rect
                x={candleX}
                y={bodyTop}
                width={bodyW}
                height={bodyH}
                fill={color}
                stroke={
                  color === '#FFFFFF' || color === 'white'
                    ? 'rgba(180,180,180,0.4)'
                    : 'none'
                }
                strokeWidth={0.5}
              />
            </g>
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};

// ── Helper: generate sample OHLC data for testing ─────────────────────────
export function generateSampleCandles(count = 20, trend = 'up', volatility = 0.02) {
  const candles = [];
  let price = 1.0850;
  for (let i = 0; i < count; i++) {
    const direction = trend === 'up'
      ? (Math.random() > 0.35 ? 1 : -1)
      : trend === 'down'
      ? (Math.random() > 0.65 ? 1 : -1)
      : (Math.random() > 0.5 ? 1 : -1);
    const body = Math.random() * volatility;
    const o    = price;
    const c    = price + direction * body;
    const h    = Math.max(o, c) + Math.random() * volatility * 0.5;
    const l    = Math.min(o, c) - Math.random() * volatility * 0.5;
    candles.push({ o, h, l, c });
    price = c;
  }
  return candles;
}