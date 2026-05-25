// ── components/chart/ChartScene.jsx ──────────────────────────────────────
// Full-frame chart composition for forex education short-form videos.
// This is a standalone Remotion composition — registered in index.jsx
// alongside SceneComposer as composition id: 'ChartScene'.
//
// DESIGN PHILOSOPHY (from reference videos with 500K+ views):
//   - The chart IS the video. It fills the entire 9:16 frame.
//   - No character, no astronaut, no background images.
//   - Candles grow in the direction of price (bullish = up, bearish = down).
//   - Every overlay appears at the exact voiceover word that names it.
//   - Captions sit at the top 14% of the frame — large, bold, black on white.
//   - The chart pans left automatically as new candles appear.
//
// CANVAS: 1080 × 1920 (9:16 vertical), 30fps
//
// SCENE JSON SHAPE for render_type: 'CHART_SCENE':
// {
//   scene_id:    1,
//   render_type: 'CHART_SCENE',
//   duration_ms: 12000,
//   brand: { primary, accent, danger, success, font_heading, font_body },
//   stt_timestamps: [{ word, start_ms, end_ms }],
//   chart: {
//     candles: [{ o, h, l, c }],         // OHLC as raw price values
//     candle_interval_ms: 500,            // how long each candle takes to appear
//     visible_count: 10,                  // candles visible at once
//     bullish_color: '#26a69a',           // TradingView green (optional)
//     bearish_color: '#ef5350',           // TradingView red (optional)
//     background: 'gradient_teal'         // 'gradient_teal' | 'dark_navy' | 'white'
//   },
//   overlays: [
//     // Each overlay appears at start_ms synced to a voiceover word.
//     // All y_pct and x_pct values are fractions of the CHART AREA (not full canvas).
//     { type: 'supply_zone',   y_top_pct: 0.2, y_bottom_pct: 0.32, x_start_pct: 0.1, x_end_pct: 0.95, label: '15M SUPPLY', start_ms: 3000 },
//     { type: 'demand_zone',   y_top_pct: 0.7, y_bottom_pct: 0.82, x_start_pct: 0.1, x_end_pct: 0.95, label: '4H DEMAND',  start_ms: 5500 },
//     { type: 'order_block',   y_top_pct: 0.55, y_bottom_pct: 0.65, x_start_pct: 0.3, x_end_pct: 0.38, direction: 'bullish', label: 'OB', start_ms: 7000 },
//     { type: 'fvg',           y_top_pct: 0.4, y_bottom_pct: 0.5, x_start_pct: 0.5, x_end_pct: 0.95, label: 'FVG', start_ms: 8500 },
//     { type: 'trade_setup',   entry_y_pct: 0.6, sl_y_pct: 0.75, tp_y_pct: 0.3, x_start_pct: 0.6, x_end_pct: 0.95, direction: 'long', rr_ratio: '1:3', start_ms: 9500 },
//     { type: 'liquidity',     y_pct: 0.25, x_start_pct: 0, x_end_pct: 0.8, label: 'EQUAL HIGHS', start_ms: 4000 },
//     { type: 'trendline',     x1_pct: 0.05, y1_pct: 0.8, x2_pct: 0.9, y2_pct: 0.3, start_ms: 6000 },
//     { type: 'bos_label',     x_pct: 0.55, y_pct: 0.35, direction: 'up', start_ms: 7500 },
//     { type: 'floating_label', text: 'Buy Here', x_pct: 0.75, y_pct: 0.55, color: '#26a69a', start_ms: 9500 },
//     { type: 'candle_label',  text: 'High', target_x_pct: 0.15, target_y_pct: 0.2, side: 'right', start_ms: 800 },
//   ],
//   assets: { sound_effects: [] },
//   transition_in:  { type: 'fade', duration_ms: 300 },
//   transition_out: { type: 'fade', duration_ms: 300 },
// }

import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Easing,
  Audio,
  staticFile,
} from 'remotion';

import { LiveCandleChart }                    from './LiveCandleChart';
import { SupplyZone, DemandZone }             from './SupplyDemandZones';
import { FairValueGap, OrderBlock,
         LiquidityLevel, TrendLine,
         KeyLevelLine }                        from './ChartOverlays';
import { TradeSetup }                         from './TradeComponents';
import { useBrand }                           from '../hooks/useBrand';

// ── Canvas constants ───────────────────────────────────────────────────────
// ChartScene always renders at 9:16 vertical. These match the Composition
// registered in index.jsx. Do not change here — change in index.jsx.
const CANVAS_W = 1080;
const CANVAS_H = 1920;

// ── Layout zones (in pixels) ───────────────────────────────────────────────
// Divide the 9:16 frame into three vertical zones:
//   CAPTION ZONE  — top 14% — large bold karaoke-style captions
//   CHART ZONE    — next 78% — the entire candlestick chart
//   FOOTER ZONE   — bottom 8% — brand watermark
const CAPTION_H    = Math.round(CANVAS_H * 0.14);   // 269px
const FOOTER_H     = Math.round(CANVAS_H * 0.08);   // 154px
const CHART_Y      = CAPTION_H;                      // chart starts below caption
const CHART_H      = CANVAS_H - CAPTION_H - FOOTER_H; // 1497px
const CHART_X      = 32;                              // left padding
const CHART_W      = CANVAS_W - CHART_X - 32;        // right padding matches left

// ── Background presets ────────────────────────────────────────────────────
// background field in scene_json.chart selects one of these.
const BACKGROUNDS = {
  // The gradient from the 500K view reference video (teal → warm beige)
  gradient_teal: 'linear-gradient(180deg, #38B2B2 0%, #5DBCBC 25%, #A8C8B8 55%, #D4B896 80%, #C8A878 100%)',
  // PipsGravity brand dark navy
  dark_navy:     '#1B2A4A',
  // Clean white — like the PipsHunter reference video
  white:         '#FFFFFF',
  // Soft off-white — easier on eyes than pure white
  off_white:     '#F8F9FA',
};

// ── ChartScene ────────────────────────────────────────────────────────────
export const ChartScene = ({ sceneJson }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const brand = useBrand(sceneJson.brand);

  // ── scene_start_ms ───────────────────────────────────────────────────────
  // STT timestamps are absolute from the start of the full voiceover.
  // Subtract the first word's start_ms so frame 0 = first word of this scene.
  const sttTimestamps  = sceneJson.stt_timestamps || [];
  const scene_start_ms = sttTimestamps.length > 0
    ? (sttTimestamps[0].start_ms || 0)
    : 0;

  // Current playback position in ms (local to this scene clip)
  const currentMs = ((frame / fps) * 1000) + scene_start_ms;

  // ── Chart config ─────────────────────────────────────────────────────────
  const chartConfig = sceneJson.chart || {};
  const candles          = chartConfig.candles          || [];
  const candleIntervalMs = chartConfig.candle_interval_ms || 500;
  const visibleCount     = chartConfig.visible_count    || 10;
  const bgKey            = chartConfig.background       || 'gradient_teal';
  const background       = BACKGROUNDS[bgKey] || BACKGROUNDS.gradient_teal;

  // Candle colors — default to TradingView-style green/red for recognition
  // These are deliberately different from the brand palette so traders
  // immediately recognise them as real market candles.
  const bullishColor = chartConfig.bullish_color || '#26a69a'; // TradingView green
  const bearishColor = chartConfig.bearish_color || '#ef5350'; // TradingView red

  // ── Transition calculations ───────────────────────────────────────────────
  const transIn       = sceneJson.transition_in  || { type: 'fade', duration_ms: 300 };
  const transOut      = sceneJson.transition_out || { type: 'fade', duration_ms: 300 };
  const transInF      = Math.round((transIn.duration_ms  / 1000) * fps);
  const transOutStart = durationInFrames - Math.round((transOut.duration_ms / 1000) * fps);

  const opacity = interpolate(
    frame,
    [0, transInF, transOutStart, durationInFrames],
    [transIn.type  === 'fade' ? 0 : 1, 1, 1, transOut.type === 'fade' ? 0 : 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // ── Overlays ──────────────────────────────────────────────────────────────
  // overlays array in scene_json defines every annotation that appears on
  // the chart. Each overlay has a type and a start_ms.
  // They are rendered as SVG elements inside one shared <svg> tag
  // that sits on top of the LiveCandleChart.
  const overlays = sceneJson.overlays || [];

  // ── Price-to-pixel conversion functions ───────────────────────────────────
  // These convert real price values and candle indexes into pixel positions.
  // All overlay components use these functions so labels attach to price,
  // not to arbitrary percentage coordinates that drift as the chart scales.
  //
  // priceToY(price) → pixel Y within the full canvas
  //   Uses all candles for price range so the scale is stable for the whole video.
  //   Higher price = lower Y (standard chart convention).
  //
  // candleToX(index) → pixel X center of that candle within the full canvas
  //   Matches exactly the x position used by LiveCandleChart in fixed-slot mode.
  //   Candle 0 is at the left, candle N is at the right. Nothing moves.

  const priceMin = candles.length > 0
    ? Math.min(...candles.map(c => c.l)) * 0.998
    : 0;
  const priceMax = candles.length > 0
    ? Math.max(...candles.map(c => c.h)) * 1.002
    : 1;
  const priceRange = priceMax - priceMin || 1;

  // Convert a real price value to a Y pixel on the canvas
  const priceToY = (price) =>
    CHART_Y + CHART_H - ((price - priceMin) / priceRange) * CHART_H;

  // Convert a candle index (0-based) to the X pixel center of that candle
  const candleToX = (index) =>
    CHART_X + ((index + 0.5) / Math.max(candles.length, 1)) * CHART_W;

  // Convert a candle index to its left and right pixel edges
  const candleLeft  = (index) => CHART_X + (index / Math.max(candles.length, 1)) * CHART_W;
  const candleRight = (index) => CHART_X + ((index + 1) / Math.max(candles.length, 1)) * CHART_W;

  // ── Audio ────────────────────────────────────────────────────────────────
  const soundEffects = sceneJson.assets?.sound_effects || [];

  return (
    <AbsoluteFill style={{ opacity, overflow: 'hidden' }}>

      {/* ── BACKGROUND ────────────────────────────────────────────────────
          Fills the entire 1080×1920 frame.
          gradient_teal matches the viral reference video style.
          dark_navy matches PipsGravity brand for authority positioning. */}
      <AbsoluteFill
        style={{
          background: background.startsWith('linear-gradient') ? background : undefined,
          backgroundColor: !background.startsWith('linear-gradient') ? background : undefined,
        }}
      />

      {/* ── CHART LAYER ───────────────────────────────────────────────────
          LiveCandleChart fills the CHART_ZONE (px CAPTION_H to CANVAS_H-FOOTER_H).
          height_pct and y_offset_pct are expressed relative to the FULL canvas
          so the chart sits in exactly the right zone.
          x_offset_pct: 32px left padding → 32/1080 = 0.0296 */}
      <LiveCandleChart
        candles={candles}
        candle_interval_ms={candleIntervalMs}
        start_ms={chartConfig.start_ms || 0}
        visible_count={visibleCount}
        candle_width={52}
        candle_gap={12}
        bullish_color={bullishColor}
        bearish_color={bearishColor}
        wick_color={bgKey === 'white' || bgKey === 'off_white' ? '#333333' : '#AAAAAA'}
        show_price_axis={false}
        show_baseline={false}
        // Position the chart in the correct zone of the 9:16 canvas
        height_pct={CHART_H / CANVAS_H}
        y_offset_pct={CHART_Y / CANVAS_H}
        x_offset_pct={CHART_X / CANVAS_W}
        brand={brand}
      />

      {/* ── OVERLAY LAYER ─────────────────────────────────────────────────
          One shared SVG covers the full canvas.
          All overlay components render as SVG <g> elements inside it.
          chart_x / chart_y / chart_w / chart_h are passed as pixel values
          so each overlay positions itself correctly within the chart zone.
          This is the same pattern used by ChartOverlays.jsx. */}
      <AbsoluteFill style={{ pointerEvents: 'none' }}>
        <svg
          width={CANVAS_W}
          height={CANVAS_H}
          style={{ position: 'absolute', top: 0, left: 0 }}
        >
          {overlays.map((overlay, i) => (
            <ChartOverlay
              key={i}
              overlay={overlay}
              chartX={CHART_X}
              chartY={CHART_Y}
              chartW={CHART_W}
              chartH={CHART_H}
              priceToY={priceToY}
              candleToX={candleToX}
              candleLeft={candleLeft}
              candleRight={candleRight}
              totalCandles={candles.length}
              priceMin={priceMin}
              priceMax={priceMax}
              brand={brand}
              bgKey={bgKey}
              fps={fps}
              frame={frame}
            />
          ))}
        </svg>
      </AbsoluteFill>

      {/* ── CANDLE LABELS ─────────────────────────────────────────────────
          Text labels like "High", "Close", "Open", "Low" that appear
          at specific voiceover moments pointing to specific chart locations.
          These are HTML (not SVG) so they can use brand fonts cleanly.
          Rendered from overlays where type === 'candle_label'. */}
      {overlays
        .filter(o => o.type === 'candle_label')
        .map((o, i) => (
          <CandleLabel
            key={`cl_${i}`}
            overlay={o}
            chartX={CHART_X}
            chartY={CHART_Y}
            chartW={CHART_W}
            chartH={CHART_H}
            priceToY={priceToY}
            candleToX={candleToX}
            frame={frame}
            fps={fps}
            brand={brand}
            bgKey={bgKey}
          />
        ))
      }

      {/* ── FLOATING LABELS ───────────────────────────────────────────────
          "Buy Here", "Sell Here", timeframe labels etc.
          HTML overlay, positioned by x_pct / y_pct within chart zone. */}
      {overlays
        .filter(o => o.type === 'floating_label')
        .map((o, i) => (
          <ChartFloatingLabel
            key={`fl_${i}`}
            overlay={o}
            chartX={CHART_X}
            chartY={CHART_Y}
            chartW={CHART_W}
            chartH={CHART_H}
            priceToY={priceToY}
            candleToX={candleToX}
            frame={frame}
            fps={fps}
            brand={brand}
            bgKey={bgKey}
          />
        ))
      }

      {/* ── CAPTION ZONE ──────────────────────────────────────────────────
          Top 14% of frame. Karaoke-style word-by-word highlight.
          Background matches the chart background for a seamless look.
          Text is large (72px), bold, black/dark — readable on any background.
          Each word highlights gold as it is spoken. */}
      <ChartCaption
        sttTimestamps={sttTimestamps}
        scene_start_ms={scene_start_ms}
        frame={frame}
        fps={fps}
        brand={brand}
        bgKey={bgKey}
        captionH={CAPTION_H}
        canvasW={CANVAS_W}
      />

      {/* ── FOOTER / WATERMARK ────────────────────────────────────────────
          Bottom 8% of frame. Brand name. Low opacity. */}
      <AbsoluteFill
        style={{
          top: 'auto',
          bottom: 0,
          height: FOOTER_H,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            fontFamily:  brand.font_heading,
            fontSize:    28,
            fontWeight:  700,
            letterSpacing: 3,
            color: bgKey === 'white' || bgKey === 'off_white'
              ? 'rgba(27,42,74,0.25)'
              : 'rgba(255,255,255,0.20)',
            textTransform: 'uppercase',
          }}
        >
          PipsGravity Academy
        </div>
      </AbsoluteFill>

      {/* ── AUDIO: SFX ───────────────────────────────────────────────────
          at_ms values are relative to scene start — no offset needed. */}
      {soundEffects.map((sfx, i) => (
        <Audio
          key={i}
          src={staticFile(`assets/sfx/${sfx.file}`)}
          startFrom={Math.round((sfx.at_ms / 1000) * fps)}
          volume={sfx.volume || 0.8}
        />
      ))}

    </AbsoluteFill>
  );
};

// ── ChartOverlay ──────────────────────────────────────────────────────────
// Renders one overlay element inside the shared SVG.
// ALL positioning uses real price values and candle indexes — never percentages.
//
// Overlay JSON contract (what Claude must produce):
//
//   Zones (supply_zone, demand_zone, fvg):
//     price_top:    number  — higher price boundary of zone
//     price_bottom: number  — lower price boundary of zone
//     candle_start: number  — candle index where zone begins (left edge)
//     label:        string
//     start_ms:     number
//
//   order_block:
//     candle_index: number  — index of the specific candle to outline
//     price_top:    number  — top of candle body (max of open/close)
//     price_bottom: number  — bottom of candle body (min of open/close)
//     direction:    'bullish' | 'bearish'
//     label:        string
//     start_ms:     number
//
//   trade_setup:
//     entry_price:  number
//     sl_price:     number
//     tp_price:     number
//     candle_start: number  — candle index where lines start
//     direction:    'long' | 'short'
//     rr_ratio:     string
//     start_ms:     number
//
//   liquidity:
//     price_level:  number  — price of the equal highs/lows line
//     candle_start: number  — candle index where line starts
//     candle_end:   number  — candle index where line ends
//     label:        string
//     swept:        boolean
//     start_ms:     number
//
//   bos_label:
//     candle_index: number  — candle where the BOS occurs
//     price_level:  number  — price of the break
//     direction:    'up' | 'down'
//     start_ms:     number
//
//   candle_label:
//     candle_index: number  — which candle to label
//     price_level:  number  — which price on that candle (e.g. candle high)
//     text:         string
//     side:         'left' | 'right'
//     start_ms:     number
//
//   floating_label:
//     candle_index: number  — x position (candle to sit next to)
//     price_level:  number  — y position (price to sit at)
//     text:         string
//     color:        string
//     start_ms:     number
//
// BACKWARD COMPAT: y_pct / x_pct still work as fallback if price values missing.
function ChartOverlay({
  overlay, chartX, chartY, chartW, chartH,
  priceToY, candleToX, candleLeft, candleRight,
  totalCandles, priceMin, priceMax,
  brand, bgKey, fps, frame
}) {
  const startFrame = Math.round((overlay.start_ms / 1000) * fps);
  if (frame < startFrame) return null;
  const localF = frame - startFrame;

  // ── Shared animation helpers ──────────────────────────────────────────────
  // expandProgress: 0 → 1 over 0.4s — used by zones expanding left to right
  const expandF    = Math.round(fps * 0.4);
  const expandProg = Math.min(localF / expandF, 1);

  // fadeProgress: 0 → 1 over 0.25s — used by labels fading in
  const fadeF    = Math.round(fps * 0.25);
  const fadeProg = Math.min(localF / fadeF, 1);

  // ── Y position resolver ───────────────────────────────────────────────────
  // Prefers real price values. Falls back to y_pct if price not provided.
  const resolveY = (priceVal, pctFallback) => {
    if (priceVal !== undefined && priceVal !== null) return priceToY(priceVal);
    if (pctFallback !== undefined) return chartY + pctFallback * chartH;
    return chartY + chartH * 0.5;
  };

  // ── X position resolver ───────────────────────────────────────────────────
  // Prefers candle index. Falls back to x_pct if index not provided.
  const resolveXCenter = (idx, pctFallback) => {
    if (idx !== undefined && idx !== null) return candleToX(idx);
    if (pctFallback !== undefined) return chartX + pctFallback * chartW;
    return chartX + chartW * 0.5;
  };
  const resolveXLeft  = (idx, pctFallback) => {
    if (idx !== undefined && idx !== null) return candleLeft(idx);
    if (pctFallback !== undefined) return chartX + pctFallback * chartW;
    return chartX;
  };
  const resolveXRight = (idx, pctFallback) => {
    if (idx !== undefined && idx !== null) return candleRight(idx);
    if (pctFallback !== undefined) return chartX + pctFallback * chartW;
    return chartX + chartW;
  };

  switch (overlay.type) {

    // ── SUPPLY ZONE ─────────────────────────────────────────────────────────
    case 'supply_zone': {
      const y1 = resolveY(overlay.price_top,    overlay.y_top_pct);
      const y2 = resolveY(overlay.price_bottom, overlay.y_bottom_pct);
      const x1 = resolveXLeft(overlay.candle_start, overlay.x_start_pct ?? 0);
      const x2 = chartX + chartW; // always extends to right edge
      const w  = (x2 - x1) * expandProg;
      const h  = Math.abs(y2 - y1);
      const topY = Math.min(y1, y2);
      return (
        <g opacity={fadeProg * 0.9}>
          <rect x={x1} y={topY} width={w} height={h} fill="rgba(200,60,60,0.18)" />
          <line x1={x1} y1={topY} x2={x1+w} y2={topY} stroke="rgba(220,80,80,0.8)" strokeWidth={1.5} />
          <line x1={x1} y1={topY+h} x2={x1+w} y2={topY+h} stroke="rgba(220,80,80,0.6)" strokeWidth={1} strokeDasharray="4 3" />
          {overlay.label && expandProg > 0.5 && (
            <text x={x1+6} y={topY+14} fill="rgba(220,80,80,0.95)" fontSize={18} fontFamily="Arial" fontWeight="bold" opacity={fadeProg}>
              {overlay.label}
            </text>
          )}
        </g>
      );
    }

    // ── DEMAND ZONE ─────────────────────────────────────────────────────────
    case 'demand_zone': {
      const y1 = resolveY(overlay.price_top,    overlay.y_top_pct);
      const y2 = resolveY(overlay.price_bottom, overlay.y_bottom_pct);
      const x1 = resolveXLeft(overlay.candle_start, overlay.x_start_pct ?? 0);
      const x2 = chartX + chartW;
      const w  = (x2 - x1) * expandProg;
      const h  = Math.abs(y2 - y1);
      const topY = Math.min(y1, y2);
      return (
        <g opacity={fadeProg * 0.9}>
          <rect x={x1} y={topY} width={w} height={h} fill="rgba(60,100,220,0.18)" />
          <line x1={x1} y1={topY+h} x2={x1+w} y2={topY+h} stroke="rgba(80,120,230,0.8)" strokeWidth={1.5} />
          <line x1={x1} y1={topY} x2={x1+w} y2={topY} stroke="rgba(80,120,230,0.6)" strokeWidth={1} strokeDasharray="4 3" />
          {overlay.label && expandProg > 0.5 && (
            <text x={x1+6} y={topY+h-6} fill="rgba(80,120,230,0.95)" fontSize={18} fontFamily="Arial" fontWeight="bold" opacity={fadeProg}>
              {overlay.label}
            </text>
          )}
        </g>
      );
    }

    // ── ORDER BLOCK ─────────────────────────────────────────────────────────
    // Outlines the specific candle body that created the zone.
    case 'order_block': {
      const idx = overlay.candle_index;
      const x1  = idx !== undefined ? candleLeft(idx)  : chartX + (overlay.x_start_pct ?? 0) * chartW;
      const x2  = idx !== undefined ? candleRight(idx) : chartX + (overlay.x_end_pct   ?? 0.1) * chartW;
      const y1  = resolveY(overlay.price_top,    overlay.y_top_pct);
      const y2  = resolveY(overlay.price_bottom, overlay.y_bottom_pct);
      const topY = Math.min(y1, y2);
      const h    = Math.abs(y2 - y1);
      const color = overlay.direction === 'bearish'
        ? 'rgba(220,80,80,0.9)' : 'rgba(80,120,230,0.9)';
      const fill  = overlay.direction === 'bearish'
        ? 'rgba(220,80,80,0.12)' : 'rgba(80,120,230,0.12)';
      return (
        <g opacity={fadeProg}>
          <rect x={x1} y={topY} width={x2-x1} height={h}
            fill={fill} stroke={color} strokeWidth={2} rx={2} />
          {overlay.label && (
            <text x={x1+3} y={topY-5} fill={color} fontSize={16}
              fontFamily="Arial" fontWeight="bold">{overlay.label}</text>
          )}
        </g>
      );
    }

    // ── FAIR VALUE GAP ───────────────────────────────────────────────────────
    case 'fvg': {
      const y1  = resolveY(overlay.price_top,    overlay.y_top_pct);
      const y2  = resolveY(overlay.price_bottom, overlay.y_bottom_pct);
      const x1  = resolveXLeft(overlay.candle_start, overlay.x_start_pct ?? 0.3);
      const x2  = chartX + chartW;
      const w   = (x2 - x1) * expandProg;
      const topY = Math.min(y1, y2);
      const h    = Math.abs(y2 - y1);
      return (
        <g opacity={fadeProg * 0.9}>
          <rect x={x1} y={topY} width={w} height={h} fill="rgba(170,150,50,0.20)" />
          <line x1={x1} y1={topY} x2={x1+w} y2={topY} stroke="rgba(200,170,60,0.8)" strokeWidth={1} strokeDasharray="5 4" />
          <line x1={x1} y1={topY+h} x2={x1+w} y2={topY+h} stroke="rgba(200,170,60,0.8)" strokeWidth={1} strokeDasharray="5 4" />
          {overlay.label && expandProg > 0.6 && (
            <text x={x1+6} y={topY+14} fill="rgba(200,170,60,0.95)" fontSize={18} fontFamily="Arial" fontWeight="bold" opacity={fadeProg}>
              {overlay.label}
            </text>
          )}
        </g>
      );
    }

    // ── TRADE SETUP ──────────────────────────────────────────────────────────
    // Entry, SL, TP lines drawing themselves from candle_start to right edge.
    case 'trade_setup': {
      const entryY = resolveY(overlay.entry_price, overlay.entry_y_pct);
      const slY    = resolveY(overlay.sl_price,    overlay.sl_y_pct);
      const tpY    = resolveY(overlay.tp_price,    overlay.tp_y_pct);
      const x1     = resolveXLeft(overlay.candle_start, overlay.x_start_pct ?? 0.5);
      const x2     = chartX + chartW;

      const phaseF = Math.round(fps * 0.35);
      const entryP = Math.min(localF / phaseF, 1);
      const slTpP  = Math.min((localF - phaseF) / phaseF, 1);
      const zoneP  = Math.min((localF - phaseF*2) / phaseF, 1);

      const gold  = brand?.accent  || '#C9A84C';
      const green = '#26a69a';
      const red   = '#ef5350';

      return (
        <g>
          {/* Entry line */}
          <line x1={x1} y1={entryY} x2={x1+(x2-x1)*entryP} y2={entryY}
            stroke={gold} strokeWidth={2} />
          {entryP > 0.8 && (
            <text x={x2+4} y={entryY+4} fill={gold} fontSize={16}
              fontFamily="Arial" fontWeight="bold">ENTRY</text>
          )}
          {/* SL line */}
          {slTpP > 0 && (
            <line x1={x1} y1={slY} x2={x1+(x2-x1)*slTpP} y2={slY}
              stroke={red} strokeWidth={1.5} opacity={slTpP} />
          )}
          {slTpP > 0.8 && (
            <text x={x2+4} y={slY+4} fill={red} fontSize={16}
              fontFamily="Arial" fontWeight="bold">SL</text>
          )}
          {/* TP line */}
          {slTpP > 0 && (
            <line x1={x1} y1={tpY} x2={x1+(x2-x1)*slTpP} y2={tpY}
              stroke={green} strokeWidth={1.5} opacity={slTpP} />
          )}
          {slTpP > 0.8 && (
            <text x={x2+4} y={tpY+4} fill={green} fontSize={16}
              fontFamily="Arial" fontWeight="bold">TP</text>
          )}
          {/* Risk zone */}
          {zoneP > 0 && (
            <rect x={x1} y={Math.min(entryY,slY)}
              width={(x2-x1)*zoneP} height={Math.abs(slY-entryY)}
              fill={`rgba(239,83,80,${0.12*zoneP})`} />
          )}
          {/* Profit zone */}
          {zoneP > 0 && (
            <rect x={x1} y={Math.min(entryY,tpY)}
              width={(x2-x1)*zoneP} height={Math.abs(tpY-entryY)}
              fill={`rgba(38,166,154,${0.12*zoneP})`} />
          )}
          {/* R:R label */}
          {zoneP > 0.7 && overlay.rr_ratio && (
            <>
              <rect x={x2-52} y={Math.min(entryY,tpY)+8}
                width={48} height={20} fill="rgba(20,20,20,0.85)" rx={4} />
              <text x={x2-50} y={Math.min(entryY,tpY)+22}
                fill="white" fontSize={13} fontFamily="Arial" fontWeight="bold">
                {overlay.rr_ratio}
              </text>
            </>
          )}
        </g>
      );
    }

    // ── LIQUIDITY LEVEL ───────────────────────────────────────────────────────
    // Horizontal dotted line at a specific price level.
    case 'liquidity': {
      const y  = resolveY(overlay.price_level, overlay.y_pct);
      const x1 = resolveXLeft(overlay.candle_start, overlay.x_start_pct ?? 0);
      const x2 = overlay.candle_end !== undefined
        ? candleRight(overlay.candle_end)
        : chartX + (overlay.x_end_pct ?? 0.7) * chartW;
      const w  = (x2 - x1) * expandProg;
      return (
        <g opacity={fadeProg}>
          <line x1={x1} y1={y} x2={x1+w} y2={y}
            stroke="rgba(100,100,100,0.7)" strokeWidth={1.5} strokeDasharray="6 4" />
          {overlay.label && expandProg > 0.5 && (
            <text x={x1+4} y={y-5} fill="rgba(80,80,80,0.9)" fontSize={16}
              fontFamily="Arial" fontWeight="bold" opacity={fadeProg}>
              {overlay.label}
            </text>
          )}
          {overlay.swept && expandProg > 0.8 && (
            <text x={x1+w/2-20} y={y+18} fill="rgba(220,80,80,0.9)"
              fontSize={14} fontFamily="Arial" fontWeight="bold">SWEPT</text>
          )}
        </g>
      );
    }

    // ── BOS LABEL ────────────────────────────────────────────────────────────
    case 'bos_label': {
      const cx = resolveXCenter(overlay.candle_index, overlay.x_pct);
      const cy = resolveY(overlay.price_level, overlay.y_pct);
      const lineEnd = cx + (chartX + chartW - cx) * expandProg;
      const textY   = overlay.direction === 'up' ? cy - 14 : cy + 26;
      return (
        <g opacity={fadeProg}>
          <line x1={cx} y1={cy} x2={lineEnd} y2={cy}
            stroke="rgba(100,100,100,0.6)" strokeWidth={1.5} strokeDasharray="6 4" />
          {expandProg > 0.3 && (
            <text x={cx+6} y={textY} fill="rgba(50,50,50,0.9)"
              fontSize={20} fontFamily="Arial" fontWeight="bold">BOS</text>
          )}
        </g>
      );
    }

    // candle_label and floating_label handled as HTML — return null here
    case 'candle_label':
    case 'floating_label':
      return null;

    default:
      return null;
  }
}
// ── CandleLabel ───────────────────────────────────────────────────────────
// HTML text label attached to a specific candle at a specific price level.
// Uses candle_index + price_level for positioning — not pixel percentages.
function CandleLabel({ overlay, chartX, chartY, chartW, chartH, priceToY, candleToX, frame, fps, brand, bgKey }) {
  const startFrame = Math.round((overlay.start_ms / 1000) * fps);
  if (frame < startFrame) return null;

  const localF  = frame - startFrame;
  const opacity = Math.min(localF / Math.round(fps * 0.25), 1);
  const slideX  = (1 - opacity) * (overlay.side === 'right' ? 20 : -20);

  // Position: prefer candle_index + price_level, fall back to target_x/y_pct
  const px = overlay.candle_index !== undefined
    ? candleToX(overlay.candle_index)
    : chartX + (overlay.target_x_pct ?? 0.5) * chartW;
  const py = overlay.price_level !== undefined
    ? priceToY(overlay.price_level)
    : chartY + (overlay.target_y_pct ?? 0.5) * chartH;

  const isLight = bgKey === 'white' || bgKey === 'off_white';
  const textColor = isLight ? '#111111' : '#FFFFFF';

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', opacity, transform: `translateX(${slideX}px)` }}>
      <svg width={CANVAS_W} height={CANVAS_H} style={{ position: 'absolute', top: 0, left: 0 }}>
        <line
          x1={overlay.side === 'right' ? px + 4 : px - 4} y1={py}
          x2={overlay.side === 'right' ? px + 48 : px - 48} y2={py}
          stroke={isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)'}
          strokeWidth={1.5}
        />
      </svg>
      <div style={{
        position: 'absolute',
        top:      py - 14,
        left:     overlay.side === 'right' ? px + 54 : undefined,
        right:    overlay.side === 'left'  ? CANVAS_W - px + 54 : undefined,
        fontFamily: brand.font_body,
        fontSize:   28,
        fontWeight: 700,
        color:      overlay.color || textColor,
        whiteSpace: 'nowrap',
      }}>
        {overlay.text}
      </div>
    </AbsoluteFill>
  );
}

// ── ChartFloatingLabel ────────────────────────────────────────────────────
// Pill label positioned by candle_index + price_level.
function ChartFloatingLabel({ overlay, chartX, chartY, chartW, chartH, priceToY, candleToX, frame, fps, brand, bgKey }) {
  const startFrame = Math.round((overlay.start_ms / 1000) * fps);
  if (frame < startFrame) return null;

  const localF  = frame - startFrame;
  const opacity = Math.min(localF / Math.round(fps * 0.25), 1);
  const scale   = 0.8 + 0.2 * opacity;

  // Position: prefer candle_index + price_level, fall back to x_pct / y_pct
  const px = overlay.candle_index !== undefined
    ? candleToX(overlay.candle_index)
    : chartX + (overlay.x_pct ?? 0.5) * chartW;
  const py = overlay.price_level !== undefined
    ? priceToY(overlay.price_level)
    : chartY + (overlay.y_pct ?? 0.5) * chartH;

  const text   = overlay.text || '';
  const isBuy  = text.toLowerCase().includes('buy');
  const isSell = text.toLowerCase().includes('sell');
  const bgColor = overlay.color
    ? overlay.color
    : isBuy  ? '#26a69a'
    : isSell ? '#ef5350'
    : brand.accent;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', opacity }}>
      <div style={{
        position:        'absolute',
        top:             py - 22,
        left:            px + 8,
        transform:       `scale(${scale})`,
        transformOrigin: 'left center',
        backgroundColor: bgColor,
        color:           '#FFFFFF',
        fontFamily:      brand.font_heading,
        fontSize:        26,
        fontWeight:      700,
        padding:         '5px 14px',
        borderRadius:    6,
        whiteSpace:      'nowrap',
        letterSpacing:   0.5,
      }}>
        {text}
      </div>
    </AbsoluteFill>
  );
}

// ── ChartCaption ──────────────────────────────────────────────────────────
// Top 14% of frame — karaoke-style word-by-word captions.
// Words appear and highlight gold as they are spoken.
// Style matches the reference videos: large, bold, dark text on light bg,
// OR white text on dark bg depending on background choice.
function ChartCaption({ sttTimestamps, scene_start_ms, frame, fps, brand, bgKey, captionH, canvasW }) {
  if (!sttTimestamps || sttTimestamps.length === 0) return null;

  const currentMs = ((frame / fps) * 1000) + scene_start_ms;
  const isLight   = bgKey === 'white' || bgKey === 'off_white';

  // Group words into lines of max 4 words — prevents overflow on 9:16 canvas
  // Always show the line containing the currently spoken word
  const WORDS_PER_LINE = 4;
  const lines = [];
  for (let i = 0; i < sttTimestamps.length; i += WORDS_PER_LINE) {
    lines.push(sttTimestamps.slice(i, i + WORDS_PER_LINE));
  }

  // Find which line is currently being spoken
  const activeLineIdx = lines.findIndex(line => {
    const first = line[0];
    const last  = line[line.length - 1];
    return currentMs >= first.start_ms && currentMs <= (last.end_ms || last.start_ms + 1000);
  });

  // Show current line and next line (so viewer can anticipate)
  const displayLines = activeLineIdx >= 0
    ? lines.slice(activeLineIdx, activeLineIdx + 2)
    : [];

  return (
    <AbsoluteFill
      style={{
        top:            0,
        height:         captionH,
        bottom:         'auto',
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        justifyContent: 'center',
        padding:        '0 32px',
        // Subtle semi-transparent backing so captions read on any background
        backgroundColor: isLight
          ? 'rgba(255,255,255,0.0)'
          : 'rgba(0,0,0,0.0)',
        pointerEvents: 'none',
      }}
    >
      {displayLines.map((line, li) => (
        <div
          key={li}
          style={{
            display:    'flex',
            gap:        12,
            flexWrap:   'wrap',
            justifyContent: 'center',
            marginBottom: li === 0 ? 4 : 0,
          }}
        >
          {line.map((token, wi) => {
            // Word is "active" — currently being spoken
            const isActive = currentMs >= token.start_ms &&
              currentMs <= (token.end_ms || token.start_ms + 600);
            // Word is "past" — already spoken
            const isPast   = currentMs > (token.end_ms || token.start_ms + 600);

            return (
              <span
                key={wi}
                style={{
                  fontFamily:  brand.font_heading,
                  // Active line: 68px. Preview line (li===1): 48px, lower opacity
                  fontSize:    li === 0 ? 68 : 48,
                  fontWeight:  700,
                  letterSpacing: 0.5,
                  // Active word → gold highlight. Past word → normal. Future → faded.
                  color: isActive
                    ? brand.accent
                    : isPast
                    ? (isLight ? '#111111' : '#FFFFFF')
                    : (isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)'),
                  opacity:     li === 1 ? 0.5 : 1,
                  transition:  'color 0.08s ease',
                  textTransform: 'uppercase',
                }}
              >
                {token.word}
              </span>
            );
          })}
        </div>
      ))}
    </AbsoluteFill>
  );
}