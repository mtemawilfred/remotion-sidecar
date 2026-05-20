// ── chart/LiveCandleChart.jsx ─────────────────────────────────────────────
// The core SVG candlestick chart engine.
// Every chart overlay component sits on top of this as an additional layer.
//
// How candles animate:
//   - Candles appear one by one from left to right over time
//   - Each candle takes candle_interval_ms to fully appear
//   - The chart pans left automatically as new candles appear
//   - The final candle "builds" in real time — body grows upward/downward
//     from the open price, wick extends simultaneously
//
// OHLC data format:
//   candles: [{ o, h, l, c }]  — open, high, low, close as relative values 0-1
//   OR pass raw price values and set price_min / price_max for auto-scaling
//
// Props:
//   candles           — array of { o, h, l, c } objects
//   candle_interval_ms — how long each candle takes to appear (default 400ms)
//   start_ms          — when the chart starts rendering
//   visible_count     — how many candles visible at once (default 12)
//   candle_width      — candle body width in px (default 28)
//   candle_gap        — gap between candles in px (default 8)
//   bullish_color     — color for bullish candles (default brand.secondary = white)
//   bearish_color     — color for bearish candles (default brand.gray = #6B7280)
//   wick_color        — wick color (default same as body)
//   show_price_axis   — show price labels on right side (default false)
//   show_baseline     — show bottom baseline (default true)
//   height_pct        — what fraction of canvas height to use (default 0.65)
//   y_offset_pct      — vertical offset from top (default 0.05)
//   x_offset_pct      — horizontal offset from left (default 0.02)

import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from 'remotion';

export const LiveCandleChart = ({
  candles           = [],
  candle_interval_ms = 400,
  start_ms          = 0,
  visible_count     = 12,
  candle_width      = 28,
  candle_gap        = 8,
  bullish_color,
  bearish_color,
  wick_color,
  show_price_axis   = false,
  show_baseline     = true,
  height_pct        = 0.65,
  y_offset_pct      = 0.05,
  x_offset_pct      = 0.02,
  brand,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const startFrame     = Math.round((start_ms / 1000) * fps);
  if (frame < startFrame) return null;

  const localFrame     = frame - startFrame;
  const localMs        = (localFrame / fps) * 1000;

  // Colors — default to brand values if not explicitly set
  const bullColor = bullish_color || brand?.secondary || '#FFFFFF';
  const bearColor = bearish_color || brand?.gray       || '#6B7280';
  const wkColor   = wick_color   || '#AAAAAA';

  // Chart dimensions
  const chartX      = width  * x_offset_pct;
  const chartY      = height * y_offset_pct;
  const chartW      = width  * (1 - x_offset_pct * 2);
  const chartH      = height * height_pct;
  const colW        = candle_width + candle_gap;

  // How many candles have fully appeared so far
  const candlesDone  = Math.floor(localMs / candle_interval_ms);
  const currentIdx   = Math.min(candlesDone, candles.length - 1);

  // Build progress of the current forming candle (0 to 1)
  const currentProgress = (localMs % candle_interval_ms) / candle_interval_ms;

  // Which candles are visible (pan left as chart grows)
  const firstVisible = Math.max(0, currentIdx - visible_count + 1);
  const visibleCandles = candles.slice(firstVisible, currentIdx + 1);

  // Price range for scaling — use all currently visible candles
  const allVisible = candles.slice(0, currentIdx + 1);
  const priceMin = allVisible.length > 0
    ? Math.min(...allVisible.map(c => c.l)) * 0.999
    : 0;
  const priceMax = allVisible.length > 0
    ? Math.max(...allVisible.map(c => c.h)) * 1.001
    : 1;
  const priceRange = priceMax - priceMin || 1;

  // Convert price to Y coordinate (inverted — higher price = lower Y)
  const priceToY = (price) =>
    chartY + chartH - ((price - priceMin) / priceRange) * chartH;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <svg
        width={width}
        height={height}
        style={{ position: 'absolute', top: 0, left: 0 }}
      >
        {/* Baseline */}
        {show_baseline && (
          <line
            x1={chartX}
            y1={chartY + chartH}
            x2={chartX + chartW}
            y2={chartY + chartH}
            stroke="rgba(255,255,255,0.15)"
            strokeWidth={1}
          />
        )}

        {/* Price axis on right */}
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
                    stroke="rgba(255,255,255,0.06)"
                    strokeWidth={1}
                    strokeDasharray="4 6"
                  />
                  <text
                    x={chartX + chartW + 8}
                    y={y + 4}
                    fill="rgba(255,255,255,0.4)"
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

        {/* Candles */}
        {visibleCandles.map((candle, vi) => {
          const globalIdx = firstVisible + vi;
          const isCurrentForming = globalIdx === currentIdx && currentIdx < candles.length;
          const isBullish = candle.c >= candle.o;

          // For the forming candle, animate body growth
          const progress = isCurrentForming ? currentProgress : 1;

          // Interpolate close toward open for forming candle animation
          const animatedClose = isCurrentForming
            ? candle.o + (candle.c - candle.o) * progress
            : candle.c;
          const animatedHigh = isCurrentForming
            ? candle.o + (candle.h - candle.o) * progress * (isBullish ? 1 : 0.3)
            : candle.h;
          const animatedLow = isCurrentForming
            ? candle.o + (candle.l - candle.o) * progress * (isBullish ? 0.3 : 1)
            : candle.l;

          // X position — right-aligned, newest candle at right side
          const x = chartX + chartW - (visibleCandles.length - vi) * colW + candle_gap / 2;

          const bodyTop    = priceToY(Math.max(candle.o, animatedClose));
          const bodyBottom = priceToY(Math.min(candle.o, animatedClose));
          const bodyH      = Math.max(bodyBottom - bodyTop, 1); // min 1px height

          const wickTop    = priceToY(animatedHigh);
          const wickBottom = priceToY(animatedLow);

          const color = isBullish ? bullColor : bearColor;
          const candleX = x + (colW - candle_width) / 2;

          // Opacity: older candles slightly faded, current candle full
          const opacity = globalIdx < currentIdx ? 0.85 : 1;

          return (
            <g key={globalIdx} opacity={opacity}>
              {/* Wick — top and bottom */}
              <line
                x1={candleX + candle_width / 2}
                y1={wickTop}
                x2={candleX + candle_width / 2}
                y2={bodyTop}
                stroke={wkColor}
                strokeWidth={1.5}
              />
              <line
                x1={candleX + candle_width / 2}
                y1={bodyBottom}
                x2={candleX + candle_width / 2}
                y2={wickBottom}
                stroke={wkColor}
                strokeWidth={1.5}
              />

              {/* Candle body */}
              <rect
                x={candleX}
                y={bodyTop}
                width={candle_width}
                height={bodyH}
                fill={color}
                stroke={color === '#FFFFFF' || color === 'white' ? 'rgba(180,180,180,0.4)' : 'none'}
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
// Use this in mock scene JSONs to test the chart without real price data
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
