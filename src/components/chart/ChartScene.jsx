// ── components/chart/ChartScene.jsx ──────────────────────────────────────
// Full-frame chart composition for forex education short-form videos.
// This is a standalone Remotion composition — registered in index.jsx
// alongside SceneComposer as composition id: 'ChartScene'.
//
// DESIGN PHILOSOPHY (from reference videos with 500K+ views):
//   - The chart IS the video. It fills the entire 9:16 frame.
//   - No character, no astronaut, no background images.
//   - Candles grow in the direction of price (bullish = up, bearish = down).
//   - hook_text is displayed as a static title at the top — one punchy line,
//     visible for the entire video. No word-by-word captions.
//   - Every overlay appears in teaching order — evidence before conclusion.
//   - The chart pans left automatically as new candles appear.
//
// CANVAS: 1080 × 1920 (9:16 vertical), 30fps
//
// SCENE JSON SHAPE for render_type: 'CHART_SCENE' (v2):
// {
//   scene_id:    1,
//   render_type: 'CHART_SCENE',
//   duration_ms: 12000,
//   hook_text:   "One punchy line displayed as static title throughout the video",
//   brand: { primary, accent, danger, success, font_heading, font_body },
//   chart: {
//     start_ms:          1800,
//     candles:           [{ o, h, l, c }],
//     candle_interval_ms: 500,
//     visible_count:     10,
//     bullish_color:     '#26a69a',
//     bearish_color:     '#ef5350',
//     background:        'white' | 'dark_navy' | 'gradient_teal'
//   },
//   overlays: [
//     // All overlays use real price values and candle indexes — no percentages.
//     // Labels are dynamic — bos_label renders overlay.label, not hardcoded "BOS".
//     // Teaching order: evidence overlays (liquidity, fvg, bos) appear first,
//     // concept overlay (order_block, demand_zone) appears last.
//     { type: 'liquidity',    price_level: 1.089, candle_start: 1, candle_end: 5, label: '$$$ EQUAL HIGHS', swept: false, start_ms: 3200 },
//     { type: 'fvg',          price_top: 1.0878, price_bottom: 1.0862, candle_start: 4, label: 'STEP 1: FVG ✓', start_ms: 5200 },
//     { type: 'bos_label',    candle_index: 8, price_level: 1.0875, direction: 'up', label: 'STEP 2: BOS ✓', start_ms: 6400 },
//     { type: 'order_block',  candle_index: 5, price_top: 1.0865, price_bottom: 1.0840, direction: 'bearish', label: 'ORDER BLOCK', start_ms: 7200 },
//     { type: 'trade_setup',  entry_price: 1.0845, sl_price: 1.0820, tp_price: 1.0910, candle_start: 10, direction: 'long', rr_ratio: '1:3', start_ms: 9500 },
//   ],
//   assets: { sound_effects: [] },
//   transition_in:  { type: 'fade', duration_ms: 300 },
//   transition_out: { type: 'fade', duration_ms: 300 },
// }
//
// REMOVED IN v2:
//   - ChartCaption: word-by-word karaoke replaced by HookText static title
//   - bos_label hardcoded "BOS" string: now reads overlay.label dynamically

import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  Audio,
  staticFile,
} from 'remotion';

import { LiveCandleChart }         from './LiveCandleChart';
import { useBrand }                from '../hooks/useBrand';

// ── Canvas constants ───────────────────────────────────────────────────────
const CANVAS_W = 1080;
const CANVAS_H = 1920;

// ── Layout zones (in pixels) ───────────────────────────────────────────────
// HOOK ZONE   — top 12% — static punchy hook_text title
// CHART ZONE  — next 83% — the entire candlestick chart
// FOOTER ZONE — bottom 5% — brand watermark
//
// CHANGED FROM v1: CAPTION_H was 14% (268px) — reduced to 12% (230px)
// because hook_text is one static line, not two scrolling lines.
const HOOK_H   = Math.round(CANVAS_H * 0.12);   // 230px — hook text zone
const FOOTER_H = Math.round(CANVAS_H * 0.05);   // 96px  — brand watermark
const CHART_Y  = HOOK_H;                          // chart starts below hook
const CHART_H  = CANVAS_H - HOOK_H - FOOTER_H;  // 1594px
const CHART_X  = 32;                              // left padding
const CHART_W  = CANVAS_W - CHART_X - 32;        // right padding matches left

// ── Background presets ────────────────────────────────────────────────────
const BACKGROUNDS = {
  gradient_teal: 'linear-gradient(180deg, #38B2B2 0%, #5DBCBC 25%, #A8C8B8 55%, #D4B896 80%, #C8A878 100%)',
  dark_navy:     '#1B2A4A',
  white:         '#FFFFFF',
  off_white:     '#F8F9FA',
};

// ── ChartScene ────────────────────────────────────────────────────────────
export const ChartScene = ({ sceneJson }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const brand = useBrand(sceneJson.brand);

  // ── Chart config ─────────────────────────────────────────────────────────
  const chartConfig      = sceneJson.chart || {};
  const candles          = chartConfig.candles           || [];
  const candleIntervalMs = chartConfig.candle_interval_ms || 500;
  const visibleCount     = chartConfig.visible_count     || 10;
  const bgKey            = chartConfig.background        || 'white';
  const background       = BACKGROUNDS[bgKey] || BACKGROUNDS.white;
  const bullishColor     = chartConfig.bullish_color     || '#26a69a';
  const bearishColor     = chartConfig.bearish_color     || '#ef5350';

  // ── Overlays ──────────────────────────────────────────────────────────────
  const overlays = sceneJson.overlays || [];

  // ── Price-to-pixel conversion ─────────────────────────────────────────────
  // priceToY  — converts a real price value to a Y pixel on the full canvas
  // candleToX — converts a candle index to the X pixel center of that candle
  // candleLeft/Right — left and right pixel edges of a candle slot
  //
  // Price scale uses all candles so the scale stays stable for the whole video.
  // 0.2% padding above/below prevents extreme candles touching the edges.
  const priceMin = candles.length > 0
    ? Math.min(...candles.map(c => c.l)) * 0.998 : 0;
  const priceMax = candles.length > 0
    ? Math.max(...candles.map(c => c.h)) * 1.002 : 1;
  const priceRange = priceMax - priceMin || 1;

  const priceToY = (price) =>
    CHART_Y + CHART_H - ((price - priceMin) / priceRange) * CHART_H;

  const candleToX    = (i) => CHART_X + ((i + 0.5) / Math.max(candles.length, 1)) * CHART_W;
  const candleLeft   = (i) => CHART_X + (i         / Math.max(candles.length, 1)) * CHART_W;
  const candleRight  = (i) => CHART_X + ((i + 1)   / Math.max(candles.length, 1)) * CHART_W;

  // ── Sound effects ─────────────────────────────────────────────────────────
  const soundEffects = sceneJson.assets?.sound_effects || [];

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>

      {/* ── BACKGROUND ──────────────────────────────────────────────────── */}
      <AbsoluteFill
        style={{
          background:      background.startsWith('linear-gradient') ? background : undefined,
          backgroundColor: !background.startsWith('linear-gradient') ? background : undefined,
        }}
      />

      {/* ── CHART LAYER ─────────────────────────────────────────────────── */}
      <LiveCandleChart
        candles={candles}
        candle_interval_ms={candleIntervalMs}
        start_ms={chartConfig.start_ms !== undefined ? chartConfig.start_ms : 0}
        visible_count={visibleCount}
        candle_width={42}
        candle_gap={2}
        bullish_color={bullishColor}
        bearish_color={bearishColor}
        wick_color={bgKey === 'white' || bgKey === 'off_white' ? '#333333' : '#AAAAAA'}
        show_price_axis={false}
        show_baseline={false}
        height_pct={CHART_H / CANVAS_H}
        y_offset_pct={CHART_Y / CANVAS_H}
        x_offset_pct={CHART_X / CANVAS_W}
        brand={brand}
      />

      {/* ── OVERLAY LAYER (SVG) ──────────────────────────────────────────── */}
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

      {/* ── CANDLE LABELS (HTML) ─────────────────────────────────────────── */}
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

      {/* ── FLOATING LABELS (HTML) ───────────────────────────────────────── */}
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

      {/* ── HOOK TEXT ────────────────────────────────────────────────────────
          Rendered LAST so it appears on top of all chart layers.
          Supports two-color text: use | to split blue | black.
          e.g. "The last candle|before the explosion." → blue|black
      */}
      <HookText
        hookText={sceneJson.hook_text || ''}
        brand={brand}
        bgKey={bgKey}
        hookH={HOOK_H}
        canvasW={CANVAS_W}
        frame={frame}
        fps={fps}
      />

      {/* ── FOOTER / WATERMARK ───────────────────────────────────────────── */}
      <AbsoluteFill
        style={{
          top:            'auto',
          bottom:         0,
          height:         FOOTER_H,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            fontFamily:    brand.font_heading,
            fontSize:      28,
            fontWeight:    700,
            letterSpacing: 3,
            color:         bgKey === 'white' || bgKey === 'off_white'
              ? 'rgba(27,42,74,0.25)'
              : 'rgba(255,255,255,0.20)',
            textTransform: 'uppercase',
          }}
        >
          PipsGravity Academy
        </div>
      </AbsoluteFill>

      {/* ── AUDIO: SFX ───────────────────────────────────────────────────── */}
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
// CHANGED FROM v1:
//   bos_label — reads overlay.label dynamically instead of hardcoding "BOS".
//               This allows "STEP 1: BOS ✓", "BOS CONFIRMED", "STEP 3: BOS ✓"
//               or any other label the teaching sequence requires.
//   liquidity — swept: true now visually changes the line colour to red
//               and adds a clear "SWEPT ✓" marker so the viewer sees the
//               moment liquidity is taken. swept: false stays grey/dotted.
//
// BACKWARD COMPAT: y_pct / x_pct still work as fallback if price values missing.
function ChartOverlay({
  overlay, chartX, chartY, chartW, chartH,
  priceToY, candleToX, candleLeft, candleRight,
  totalCandles, priceMin, priceMax,
  brand, bgKey, fps, frame,
}) {
  const startFrame = Math.round((overlay.start_ms / 1000) * fps);
  if (frame < startFrame) return null;
  const localF = frame - startFrame;

  // ── Shared animation helpers ──────────────────────────────────────────────
  // expandProg: 0 → 1 over 0.4s — zones expand left to right
  const expandF    = Math.round(fps * 0.4);
  const expandProg = Math.min(localF / expandF, 1);

  // fadeProg: 0 → 1 over 0.25s — labels fade in
  const fadeF    = Math.round(fps * 0.25);
  const fadeProg = Math.min(localF / fadeF, 1);

  // ── Position resolvers ────────────────────────────────────────────────────
  // Prefer real price/candle values. Fall back to percentage if missing.
  const resolveY = (priceVal, pctFallback) => {
    if (priceVal != null) return priceToY(priceVal);
    if (pctFallback != null) return chartY + pctFallback * chartH;
    return chartY + chartH * 0.5;
  };
  const resolveXCenter = (idx, pctFallback) => {
    if (idx != null) return candleToX(idx);
    if (pctFallback != null) return chartX + pctFallback * chartW;
    return chartX + chartW * 0.5;
  };
  const resolveXLeft = (idx, pctFallback) => {
    if (idx != null) return candleLeft(idx);
    if (pctFallback != null) return chartX + pctFallback * chartW;
    return chartX;
  };
  const resolveXRight = (idx, pctFallback) => {
    if (idx != null) return candleRight(idx);
    if (pctFallback != null) return chartX + pctFallback * chartW;
    return chartX + chartW;
  };

  switch (overlay.type) {

    // ── SUPPLY ZONE ─────────────────────────────────────────────────────────
    case 'supply_zone': {
      const y1   = resolveY(overlay.price_top,    overlay.y_top_pct);
      const y2   = resolveY(overlay.price_bottom, overlay.y_bottom_pct);
      const x1   = resolveXLeft(overlay.candle_start, overlay.x_start_pct ?? 0);
      const x2   = chartX + chartW;
      const w    = (x2 - x1) * expandProg;
      const topY = Math.min(y1, y2);
      const h    = Math.abs(y2 - y1);
      const labelText = overlay.label || 'SUPPLY';
      const pillW = labelText.length * 11 + 20;
      const pillH = 26;
      return (
        <g opacity={fadeProg}>
          {/* Zone fill — higher opacity so it reads over candles */}
          <rect x={x1} y={topY} width={w} height={h} fill="rgba(200,60,60,0.28)" />
          {/* Top border — solid, thick */}
          <line x1={x1} y1={topY}   x2={x1+w} y2={topY}   stroke="rgba(210,60,60,1.0)" strokeWidth={2.5} />
          {/* Bottom border — dashed */}
          <line x1={x1} y1={topY+h} x2={x1+w} y2={topY+h} stroke="rgba(210,60,60,0.8)" strokeWidth={1.5} strokeDasharray="5 3" />
          {/* Pill label — clamped inside canvas */}
          {expandProg > 0.4 && (() => {
            const px = Math.min(x1 + 8, chartX + chartW - pillW - 8);
            return (
              <>
                <rect x={px} y={topY+8} width={pillW} height={pillH}
                  fill="rgba(200,60,60,0.92)" rx={4} />
                <text x={px+10} y={topY+25} fill="#FFFFFF"
                  fontSize={17} fontFamily="Arial" fontWeight="bold">
                  {labelText}
                </text>
              </>
            );
          })()}
        </g>
      );
    }

    // ── DEMAND ZONE ─────────────────────────────────────────────────────────
    case 'demand_zone': {
      const y1   = resolveY(overlay.price_top,    overlay.y_top_pct);
      const y2   = resolveY(overlay.price_bottom, overlay.y_bottom_pct);
      const x1   = resolveXLeft(overlay.candle_start, overlay.x_start_pct ?? 0);
      const x2   = chartX + chartW;
      const w    = (x2 - x1) * expandProg;
      const topY = Math.min(y1, y2);
      const h    = Math.abs(y2 - y1);
      const labelText = overlay.label || 'DEMAND';
      const pillW = labelText.length * 11 + 20;
      const pillH = 26;
      return (
        <g opacity={fadeProg}>
          {/* Zone fill — higher opacity */}
          <rect x={x1} y={topY} width={w} height={h} fill="rgba(60,100,220,0.28)" />
          {/* Bottom border — solid, thick (demand zones anchor from bottom) */}
          <line x1={x1} y1={topY+h} x2={x1+w} y2={topY+h} stroke="rgba(60,100,220,1.0)" strokeWidth={2.5} />
          {/* Top border — dashed */}
          <line x1={x1} y1={topY}   x2={x1+w} y2={topY}   stroke="rgba(60,100,220,0.8)" strokeWidth={1.5} strokeDasharray="5 3" />
          {/* Pill label — clamped inside canvas */}
          {expandProg > 0.4 && (() => {
            const px = Math.min(x1 + 8, chartX + chartW - pillW - 8);
            return (
              <>
                <rect x={px} y={topY+h-pillH-8} width={pillW} height={pillH}
                  fill="rgba(60,100,220,0.92)" rx={4} />
                <text x={px+10} y={topY+h-14} fill="#FFFFFF"
                  fontSize={17} fontFamily="Arial" fontWeight="bold">
                  {labelText}
                </text>
              </>
            );
          })()}
        </g>
      );
    }


    // ── TRENDLINE ────────────────────────────────────────────────────────────
    // Draws a diagonal line between two anchor candle/price points.
    // Used for trendline liquidity — the document-defined type where retail
    // traders place stops above/below a trendline, which institutions sweep.
    //
    // Required overlay fields:
    //   candle_start + price_start — first anchor (candle index + price)
    //   candle_end   + price_end   — second anchor (candle index + price)
    //   extend_to    (optional)    — candle index to extend the line to
    //   direction: "up" or "down" — up trendline (lows) or down trendline (highs)
    //   swept: true/false          — changes colour from grey to red when swept
    //   label (optional)           — pill label shown mid-line
    //
    // Trendline price at any candle N:
    //   slope = (price_end - price_start) / (candle_end - candle_start)
    //   price_at_N = price_start + slope × (N - candle_start)
    case 'trendline': {
      const cStart = overlay.candle_start;
      const cEnd   = overlay.candle_end;
      const pStart = overlay.price_start;
      const pEnd   = overlay.price_end;

      if (cStart == null || cEnd == null || pStart == null || pEnd == null) return null;

      // Calculate slope for optional extension
      const slope = (pEnd - pStart) / (cEnd - cStart);

      // Left anchor — always candle_start
      const x1 = candleToX(cStart);
      const y1 = priceToY(pStart);

      // Right anchor — extend_to if provided, otherwise candle_end
      const rightCandle = overlay.extend_to != null ? overlay.extend_to : cEnd;
      const rightPrice  = pStart + slope * (rightCandle - cStart);
      const x2 = candleToX(rightCandle);
      const y2 = priceToY(rightPrice);

      const isSwept   = overlay.swept === true;
      // Unswept: grey dashed diagonal. Swept: red solid.
      const lineColor = isSwept ? 'rgba(220,60,60,0.90)' : 'rgba(60,60,60,0.75)';
      const lineWidth = isSwept ? 2.5 : 2;
      const dashArray = isSwept ? 'none' : '8 5';

      // Label pill — shown at midpoint of the line
      const labelText = overlay.label || '';
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;

      // Animate: line draws from left to right using expandProg
      const lineEndX = x1 + (x2 - x1) * expandProg;
      const lineEndY = y1 + (y2 - y1) * expandProg;

      return (
        <g opacity={fadeProg}>
          {/* Main diagonal line */}
          <line
            x1={x1} y1={y1}
            x2={lineEndX} y2={lineEndY}
            stroke={lineColor}
            strokeWidth={lineWidth}
            strokeDasharray={dashArray === 'none' ? undefined : dashArray}
          />
          {/* Small circle at each anchor to mark touch points */}
          {expandProg > 0.3 && (
            <circle cx={x1} cy={y1} r={5}
              fill="none" stroke={lineColor} strokeWidth={2} />
          )}
          {expandProg > 0.95 && (
            <circle cx={x2} cy={y2} r={5}
              fill="none" stroke={lineColor} strokeWidth={2} />
          )}
          {/* Label pill at midpoint */}
          {labelText && expandProg > 0.6 && (() => {
            const pw = labelText.length * 10 + 16;
            const ph = 22;
            const px = Math.max(chartX, Math.min(midX - pw/2, chartX + chartW - pw));
            const py = midY - ph - 6;
            return (
              <>
                <rect x={px} y={py} width={pw} height={ph}
                  fill={isSwept ? 'rgba(220,60,60,0.90)' : 'rgba(40,40,40,0.80)'}
                  rx={4} />
                <text x={px + 8} y={py + ph - 6} fill="#FFFFFF"
                  fontSize={14} fontFamily="Arial" fontWeight="bold">
                  {labelText}
                </text>
              </>
            );
          })()}
          {/* Swept indicator — red arrow at sweep candle right edge */}
          {isSwept && expandProg > 0.95 && (
            <>
              <circle cx={x2} cy={y2} r={8} fill="rgba(220,60,60,0.95)" />
              <rect x={x2 + 12} y={y2 - 13} width={90} height={22}
                fill="rgba(220,60,60,0.92)" rx={4} />
              <text x={x2 + 20} y={y2 + 3} fill="#FFFFFF"
                fontSize={14} fontFamily="Arial" fontWeight="bold">
                TL SWEPT ✓
              </text>
            </>
          )}
        </g>
      );
    }

    // ── ORDER BLOCK ─────────────────────────────────────────────────────────
    case 'order_block': {
      const idx   = overlay.candle_index;
      const x1    = idx != null ? candleLeft(idx)  : chartX + (overlay.x_start_pct ?? 0) * chartW;
      const x2    = chartX + chartW; // OB zone extends to right edge like demand/supply
      const y1    = resolveY(overlay.price_top,    overlay.y_top_pct);
      const y2    = resolveY(overlay.price_bottom, overlay.y_bottom_pct);
      const topY  = Math.min(y1, y2);
      const h     = Math.abs(y2 - y1);
      const w     = (x2 - x1) * expandProg;
      const isBearishCandle = overlay.direction === 'bearish';
      const fillColor  = isBearishCandle ? 'rgba(220,80,80,0.25)'  : 'rgba(60,100,220,0.25)';
      const lineColor  = isBearishCandle ? 'rgba(210,60,60,1.0)'   : 'rgba(60,100,220,1.0)';
      const pillColor  = isBearishCandle ? 'rgba(200,60,60,0.92)'  : 'rgba(60,100,220,0.92)';
      const labelText  = overlay.label || 'ORDER BLOCK';
      const pillW      = labelText.length * 11 + 20;
      const pillH      = 26;
      // Solid border on the candle-side edge (left), dashed on right extension
      const candleX2   = idx != null ? candleRight(idx) : x1 + 40;
      return (
        <g opacity={fadeProg}>
          <rect x={x1} y={topY} width={w} height={h} fill={fillColor} />
          {/* Left edge — solid vertical line marking the OB candle */}
          <line x1={x1} y1={topY} x2={x1} y2={topY+h} stroke={lineColor} strokeWidth={3} />
          {/* Top border */}
          <line x1={x1} y1={topY} x2={x1+w} y2={topY} stroke={lineColor} strokeWidth={2} />
          {/* Bottom border */}
          <line x1={x1} y1={topY+h} x2={x1+w} y2={topY+h} stroke={lineColor} strokeWidth={2} strokeDasharray="5 3" />
          {/* Pill label — clamped inside canvas */}
          {expandProg > 0.3 && (() => {
            const px = Math.min(x1 + 8, chartX + chartW - pillW - 8);
            return (
              <>
                <rect x={px} y={topY+8} width={pillW} height={pillH}
                  fill={pillColor} rx={4} />
                <text x={px+10} y={topY+25} fill="#FFFFFF"
                  fontSize={17} fontFamily="Arial" fontWeight="bold">
                  {labelText}
                </text>
              </>
            );
          })()}
        </g>
      );
    }

    // ── FAIR VALUE GAP ───────────────────────────────────────────────────────
    case 'fvg': {
      const y1   = resolveY(overlay.price_top,    overlay.y_top_pct);
      const y2   = resolveY(overlay.price_bottom, overlay.y_bottom_pct);
      const x1   = resolveXLeft(overlay.candle_start, overlay.x_start_pct ?? 0.3);
      const x2   = chartX + chartW;
      const w    = (x2 - x1) * expandProg;
      const topY = Math.min(y1, y2);
      const h    = Math.abs(y2 - y1);
      return (
        <g opacity={fadeProg * 0.9}>
          <rect x={x1} y={topY} width={w} height={h} fill="rgba(170,150,50,0.20)" />
          <line x1={x1} y1={topY}   x2={x1+w} y2={topY}   stroke="rgba(200,170,60,0.8)" strokeWidth={1} strokeDasharray="5 4" />
          <line x1={x1} y1={topY+h} x2={x1+w} y2={topY+h} stroke="rgba(200,170,60,0.8)" strokeWidth={1} strokeDasharray="5 4" />
          {overlay.label && expandProg > 0.6 && (
            <text x={x1+6} y={topY+14} fill="rgba(200,170,60,0.95)"
              fontSize={18} fontFamily="Arial" fontWeight="bold" opacity={fadeProg}>
              {overlay.label}
            </text>
          )}
        </g>
      );
    }

    // ── TRADE SETUP ──────────────────────────────────────────────────────────
    case 'trade_setup': {
      const entryY = resolveY(overlay.entry_price, overlay.entry_y_pct);
      const slY    = resolveY(overlay.sl_price,    overlay.sl_y_pct);
      const tpY    = resolveY(overlay.tp_price,    overlay.tp_y_pct);
      const x1     = resolveXLeft(overlay.candle_start, overlay.x_start_pct ?? 0.5);
      const x2     = chartX + chartW;

      const phaseF = Math.round(fps * 0.35);
      const entryP = Math.min(localF / phaseF, 1);
      const slTpP  = Math.min((localF - phaseF) / phaseF, 1);
      const zoneP  = Math.min((localF - phaseF * 2) / phaseF, 1);

      const gold  = brand?.accent || '#C9A84C';
      const green = '#26a69a';
      const red   = '#ef5350';

      return (
        <g>
          {/* Entry line */}
          <line x1={x1} y1={entryY} x2={x1+(x2-x1)*entryP} y2={entryY}
            stroke={gold} strokeWidth={2} />
          {entryP > 0.8 && (
            <text x={x2+4} y={entryY+4} fill={gold}
              fontSize={16} fontFamily="Arial" fontWeight="bold">ENTRY</text>
          )}
          {/* SL line */}
          {slTpP > 0 && (
            <line x1={x1} y1={slY} x2={x1+(x2-x1)*slTpP} y2={slY}
              stroke={red} strokeWidth={1.5} opacity={slTpP} />
          )}
          {slTpP > 0.8 && (
            <text x={x2+4} y={slY+4} fill={red}
              fontSize={16} fontFamily="Arial" fontWeight="bold">SL</text>
          )}
          {/* TP line */}
          {slTpP > 0 && (
            <line x1={x1} y1={tpY} x2={x1+(x2-x1)*slTpP} y2={tpY}
              stroke={green} strokeWidth={1.5} opacity={slTpP} />
          )}
          {slTpP > 0.8 && (
            <text x={x2+4} y={tpY+4} fill={green}
              fontSize={16} fontFamily="Arial" fontWeight="bold">TP</text>
          )}
          {/* Risk zone — red fill between entry and SL */}
          {zoneP > 0 && (
            <rect x={x1} y={Math.min(entryY,slY)}
              width={(x2-x1)*zoneP} height={Math.abs(slY-entryY)}
              fill={`rgba(153,27,27,${0.18*zoneP})`} />
          )}
          {/* Profit zone — green fill between entry and TP */}
          {zoneP > 0 && (
            <rect x={x1} y={Math.min(entryY,tpY)}
              width={(x2-x1)*zoneP} height={Math.abs(tpY-entryY)}
              fill={`rgba(22,101,52,${0.20*zoneP})`} />
          )}
          {/* R:R label — positioned to the LEFT of the chart area so it
              never covers candles. Large pill with high contrast. */}
          {entryP > 0.6 && overlay.rr_ratio && (() => {
            const rrText    = overlay.rr_ratio;
            const rrPillW   = rrText.length * 18 + 28;  // scales with text length
            const rrPillH   = 40;
            // Place pill to the LEFT of the chart (outside candle area)
            // Clamp so it stays inside the canvas left edge
            const rrPillX   = Math.max(4, chartX - rrPillW - 8);
            // Vertically center between entry and TP
            const midY      = (entryY + tpY) / 2;
            const rrPillY   = Math.max(CHART_Y + 4, midY - rrPillH / 2);
            // Arrow pointing right from the pill toward the chart
            const arrowTipX = chartX - 2;
            const arrowMidY = rrPillY + rrPillH / 2;
            return (
              <>
                {/* Connector line from pill to entry line */}
                <line
                  x1={arrowTipX} y1={arrowMidY}
                  x2={x1} y2={entryY}
                  stroke="rgba(201,168,76,0.45)"
                  strokeWidth={1}
                  strokeDasharray="4 3"
                />
                {/* Pill background — gold brand colour */}
                <rect
                  x={rrPillX} y={rrPillY}
                  width={rrPillW} height={rrPillH}
                  fill="rgba(27,42,74,0.92)" rx={6}
                />
                {/* Gold border */}
                <rect
                  x={rrPillX} y={rrPillY}
                  width={rrPillW} height={rrPillH}
                  fill="none" stroke="rgba(201,168,76,0.85)"
                  strokeWidth={1.5} rx={6}
                />
                {/* Label line 1: R:R */}
                <text
                  x={rrPillX + rrPillW / 2} y={rrPillY + 15}
                  fill="rgba(201,168,76,0.7)"
                  fontSize={13} fontFamily="Arial" fontWeight="600"
                  textAnchor="middle"
                >
                  R:R
                </text>
                {/* Label line 2: the ratio value — large and bold */}
                <text
                  x={rrPillX + rrPillW / 2} y={rrPillY + 33}
                  fill="#FFFFFF"
                  fontSize={19} fontFamily="Arial" fontWeight="800"
                  textAnchor="middle"
                >
                  {rrText}
                </text>
              </>
            );
          })()}
        </g>
      );
    }

    // ── LIQUIDITY LEVEL ───────────────────────────────────────────────────────
    // Horizontal dashed line at equal highs/lows.
    // CHANGED: label replaced with a tailless arrow (filled chevron ▶ / ◀)
    // pointing AT the price level from the left — no text tail, just the arrow.
    // This matches the reference video style where a clean arrow points to the
    // liquidity pool without cluttering the chart with text over candles.
    //
    // swept: false → grey dashed line + grey chevron
    // swept: true  → red line + red chevron + "SWEPT ✓" pill
    case 'liquidity': {
      const y  = resolveY(overlay.price_level, overlay.y_pct);
      const x1 = resolveXLeft(overlay.candle_start, overlay.x_start_pct ?? 0);
      const x2 = overlay.candle_end != null
        ? candleRight(overlay.candle_end)
        : chartX + (overlay.x_end_pct ?? 0.7) * chartW;
      const w  = (x2 - x1) * expandProg;

      const isSwept    = overlay.swept;
      const lineColor  = isSwept ? 'rgba(220,60,60,0.95)' : 'rgba(50,50,50,0.90)';
      const arrowColor = isSwept ? 'rgba(220,60,60,1.0)'  : 'rgba(50,50,50,1.0)';

      // Tailless arrow (chevron) — points RIGHT toward the liquidity level
      // Sits just to the LEFT of the line start, pointing at the price
      const arrowSize = 14;
      const ax = x1 - 4; // tip of arrow touches the line start
      // Chevron points right: tip at (ax, y), body at (ax-arrowSize, y±arrowSize*0.6)
      const arrowPoints = `${ax},${y} ${ax-arrowSize},${y-arrowSize*0.6} ${ax-arrowSize},${y+arrowSize*0.6}`;

      // Label text for the pill (shown outside candle area at left)
      const labelText = overlay.label || 'LIQUIDITY';

      return (
        <g opacity={fadeProg}>
          {/* Dashed horizontal line */}
          <line
            x1={x1} y1={y} x2={x1+w} y2={y}
            stroke={lineColor}
            strokeWidth={isSwept ? 2.5 : 2.2}
            strokeDasharray="7 4"
          />
          {/* Tailless arrow chevron pointing at the level */}
          {expandProg > 0.2 && (
            <polygon
              points={arrowPoints}
              fill={arrowColor}
            />
          )}
          {/* Label pill — sits ABOVE the line, anchored to x1, clamped inside canvas */}
          {expandProg > 0.4 && (() => {
            const pw = labelText.length * 10 + 16;
            const ph = 22;
            // Clamp so pill never goes left of chartX or right of chartX+chartW
            const px = Math.max(chartX, Math.min(x1, chartX + chartW - pw));
            const py = y - ph - 4;
            return (
              <>
                <rect x={px} y={py} width={pw} height={ph}
                  fill={isSwept ? 'rgba(220,60,60,0.95)' : 'rgba(30,30,30,0.90)'}
                  rx={4} />
                <text x={px + 8} y={py + ph - 5} fill="#FFFFFF"
                  fontSize={15} fontFamily="Arial" fontWeight="bold">
                  {labelText}
                </text>
              </>
            );
          })()}
          {/* When swept: red circle at right end + SWEPT pill */}
          {isSwept && expandProg > 0.8 && (
            <>
              <circle cx={x1+w} cy={y} r={7} fill="rgba(220,60,60,0.95)" />
              <rect x={x1+w+12} y={y-13} width={80} height={22} fill="rgba(220,60,60,0.92)" rx={4} />
              <text x={x1+w+20} y={y+3} fill="#FFFFFF" fontSize={15} fontFamily="Arial" fontWeight="bold">SWEPT ✓</text>
            </>
          )}
        </g>
      );
    }

    // ── BOS LABEL ────────────────────────────────────────────────────────────
    // Line draws FROM structural high candle TO BOS candle at price_level.
    // CHANGES from v2:
    //   - Label moves to CENTER of the line (midpoint between anchors)
    //   - Uptrend context: ascending dotted line drawn in the 3 candles BEFORE
    //     the structural high, showing the trend that formed the swing high
    //   - Line stops exactly at the BOS candle right edge — never extends further
    //   - Backward compat: if candle_start missing, falls back to old style
    case 'bos_label': {
      const cy        = resolveY(overlay.price_level, overlay.y_pct);
      const labelText = overlay.label || 'BOS';
      const hasLeftAnchor = overlay.candle_start !== undefined && overlay.candle_start !== null;

      if (hasLeftAnchor) {
        // ── New behaviour: structural high candle → BOS candle ────────────
        // Left anchor: center of structural high candle
        // Right anchor: CENTER of BOS candle — line must STOP here, no further
        const xLeft  = candleToX(overlay.candle_start);
        const xRight = candleToX(overlay.candle_index);
        const lineLen = Math.max(0, xRight - xLeft);
        // Hard cap: lineEnd can never exceed xRight regardless of expandProg
        const lineEnd = Math.min(xRight, xLeft + lineLen * expandProg);

        // Label at CENTER of the line — appears when line is 50% drawn
        const midX  = xLeft + lineLen * 0.5;
        // Label pill dimensions
        const pillW = labelText.length * 12 + 20;
        const pillH = 28;
        const pillX = midX - pillW / 2;
        // Sits above line for upward BOS, below for downward BOS
        const pillY = overlay.direction === 'up' ? cy - pillH - 6 : cy + 6;

        // Uptrend context: ascending dotted line in the 3 candles BEFORE
        // the structural high candle, showing price was rising to that peak.
        // Draws from 3 candles left of candle_start rising up to price_level.
        const trendStartIdx = Math.max(0, overlay.candle_start - 3);
        const trendX1 = candleToX(trendStartIdx);
        const trendY1 = cy + 40; // starts 40px below the high (coming from below)
        const trendX2 = xLeft;
        const trendY2 = cy;      // arrives at the structural high level

        return (
          <g opacity={fadeProg}>
            {/* Uptrend context line — shows the trend that formed the swing high */}
            {expandProg > 0.05 && (
              <line
                x1={trendX1} y1={trendY1} x2={trendX2} y2={trendY2}
                stroke="rgba(38,166,154,0.6)"
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
            )}
            {/* Small triangle at the structural high marking the swing peak */}
            {expandProg > 0.1 && overlay.direction === 'up' && (
              <polygon
                points={`${xLeft},${cy} ${xLeft-6},${cy-12} ${xLeft+6},${cy-12}`}
                fill="rgba(80,80,80,0.85)"
              />
            )}
            {/* Horizontal dashed BOS line: structural high → BOS candle */}
            <line
              x1={xLeft} y1={cy} x2={lineEnd} y2={cy}
              stroke="rgba(60,60,60,0.85)"
              strokeWidth={2}
              strokeDasharray="7 4"
            />
            {/* BOS label pill at CENTER of line — clamped inside canvas */}
            {expandProg > 0.5 && (() => {
              const clampedX = Math.max(chartX, Math.min(pillX, chartX + chartW - pillW));
              const clampedY = Math.max(CHART_Y + 4, Math.min(pillY, CHART_Y + CHART_H - pillH - 4));
              return (
                <>
                  <rect x={clampedX} y={clampedY} width={pillW} height={pillH}
                    fill="rgba(40,40,40,0.88)" rx={5} />
                  <text
                    x={clampedX + pillW/2} y={clampedY + pillH*0.68}
                    fill="#FFFFFF"
                    fontSize={18} fontFamily="Arial" fontWeight="bold"
                    textAnchor="middle"
                  >
                    {labelText}
                  </text>
                </>
              );
            })()}
          </g>
        );
      } else {
        // ── Backward compat: BOS candle → right edge ──────────────────────
        const cx      = resolveXCenter(overlay.candle_index, overlay.x_pct);
        const lineEnd = cx + (chartX + chartW - cx) * expandProg;
        const textY   = overlay.direction === 'up' ? cy - 14 : cy + 26;
        return (
          <g opacity={fadeProg}>
            <line x1={cx} y1={cy} x2={lineEnd} y2={cy}
              stroke="rgba(100,100,100,0.7)" strokeWidth={2} strokeDasharray="7 4" />
            {expandProg > 0.3 && (
              <text x={cx + (lineEnd-cx)*0.5} y={textY}
                fill="rgba(40,40,40,0.9)" fontSize={18} fontFamily="Arial"
                fontWeight="bold" textAnchor="middle">
                {labelText}
              </text>
            )}
          </g>
        );
      }
    }

    // candle_label and floating_label handled as HTML above — return null here
    case 'candle_label':
    case 'floating_label':
      return null;

    default:
      return null;
  }
}

// ── CandleLabel ───────────────────────────────────────────────────────────
// HTML text label attached to a specific candle at a specific price level.
// Slides in from left or right. Uses candle_index + price_level for position.
function CandleLabel({
  overlay, chartX, chartY, chartW, chartH,
  priceToY, candleToX, frame, fps, brand, bgKey,
}) {
  const startFrame = Math.round((overlay.start_ms / 1000) * fps);
  if (frame < startFrame) return null;

  const localF  = frame - startFrame;
  const opacity = Math.min(localF / Math.round(fps * 0.25), 1);
  const slideX  = (1 - opacity) * (overlay.side === 'right' ? 20 : -20);

  const px = overlay.candle_index != null
    ? candleToX(overlay.candle_index)
    : chartX + (overlay.target_x_pct ?? 0.5) * chartW;
  const py = overlay.price_level != null
    ? priceToY(overlay.price_level)
    : chartY + (overlay.target_y_pct ?? 0.5) * chartH;

  const isLight   = bgKey === 'white' || bgKey === 'off_white';
  const textColor = isLight ? '#111111' : '#FFFFFF';

  // Clamp text position so it never exits the canvas horizontally
  const estTextW = (overlay.text || '').length * 17; // rough char width at 28px
  let labelLeft, labelRight;
  if (overlay.side === 'right') {
    // Starts at px+54, clamp so right edge <= CANVAS_W - 8
    labelLeft = Math.min(px + 54, CANVAS_W - estTextW - 8);
    labelLeft = Math.max(8, labelLeft);
    labelRight = undefined;
  } else {
    // Ends at px-54, clamp so left edge >= 8
    const naturalRight = CANVAS_W - px + 54;
    labelRight = Math.min(naturalRight, CANVAS_W - 8);
    labelRight = Math.max(8, labelRight);
    labelLeft = undefined;
  }

  return (
    <AbsoluteFill
      style={{ pointerEvents: 'none', opacity, transform: `translateX(${slideX}px)` }}
    >
      <svg width={CANVAS_W} height={CANVAS_H} style={{ position: 'absolute', top: 0, left: 0 }}>
        <line
          x1={overlay.side === 'right' ? px + 4  : px - 4}  y1={py}
          x2={overlay.side === 'right' ? px + 48 : px - 48} y2={py}
          stroke={isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)'}
          strokeWidth={1.5}
        />
      </svg>
      <div
        style={{
          position:   'absolute',
          top:        Math.max(CHART_Y + 4, Math.min(py - 14, CHART_Y + CHART_H - 60)),
          left:       labelLeft,
          right:      labelRight,
          fontFamily: brand.font_body,
          fontSize:   28,
          fontWeight: 700,
          color:      overlay.color || textColor,
          whiteSpace: 'nowrap',
          maxWidth:   CANVAS_W - 16,
          lineHeight: 1.3,
        }}
      >
        {/* Split on \n so multi-line text renders correctly */}
        {(overlay.text || '').split('\n').map((line, li) => (
          <div key={li}>{line}</div>
        ))}
      </div>
    </AbsoluteFill>
  );
}

// ── ChartFloatingLabel ────────────────────────────────────────────────────
// Pill label positioned by candle_index + price_level.
// Used for step labels like "STEP 3: LIQUIDITY ✓" and action labels like "Buy Here".
function ChartFloatingLabel({
  overlay, chartX, chartY, chartW, chartH,
  priceToY, candleToX, frame, fps, brand, bgKey,
}) {
  const startFrame = Math.round((overlay.start_ms / 1000) * fps);
  if (frame < startFrame) return null;

  const localF  = frame - startFrame;
  const opacity = Math.min(localF / Math.round(fps * 0.25), 1);
  const scale   = 0.8 + 0.2 * opacity;

  const px = overlay.candle_index != null
    ? candleToX(overlay.candle_index)
    : chartX + (overlay.x_pct ?? 0.5) * chartW;
  const py = overlay.price_level != null
    ? priceToY(overlay.price_level)
    : chartY + (overlay.y_pct ?? 0.5) * chartH;

  const rawText = overlay.text || '';
  const isBuy   = rawText.toLowerCase().includes('buy');
  const isSell  = rawText.toLowerCase().includes('sell');
  const bgColor = overlay.color
    ? overlay.color
    : isBuy  ? '#26a69a'
    : isSell ? '#ef5350'
    : brand.accent;

  // Split long labels into two lines — wrap at 18 chars on word boundary
  // This prevents the pill from exiting the canvas on long text like
  // "PRICE RETURNS TO ORDER BLOCK" (28 chars)
  const MAX_LINE = 18;
  let lines;
  if (rawText.length <= MAX_LINE) {
    lines = [rawText];
  } else {
    const words = rawText.split(' ');
    const l1 = []; const l2 = [];
    let cur = l1;
    let len = 0;
    for (const w of words) {
      if (len + w.length > MAX_LINE && cur === l1) { cur = l2; len = 0; }
      cur.push(w); len += w.length + 1;
    }
    lines = l2.length ? [l1.join(' '), l2.join(' ')] : [l1.join(' ')];
  }
  const isMulti = lines.length > 1;

  // Pill width based on longest line, clamped inside canvas
  const longestLine = Math.max(...lines.map(l => l.length));
  const estPillW = longestLine * 14 + 28;
  const pillH    = isMulti ? 62 : 38;
  const clampedLeft = Math.max(8, Math.min(px + 8, CANVAS_W - estPillW - 8));
  const clampedTop  = Math.max(CHART_Y + 4, Math.min(py - pillH / 2, CHART_Y + CHART_H - pillH - 4));

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', opacity }}>
      <div
        style={{
          position:        'absolute',
          top:             clampedTop,
          left:            clampedLeft,
          transform:       `scale(${scale})`,
          transformOrigin: 'left center',
          backgroundColor: bgColor,
          color:           '#FFFFFF',
          fontFamily:      brand.font_heading,
          fontSize:        22,
          fontWeight:      700,
          padding:         '6px 14px',
          borderRadius:    6,
          whiteSpace:      'pre-line',
          letterSpacing:   0.5,
          maxWidth:        CANVAS_W - 24,
          lineHeight:      1.25,
        }}
      >
        {lines.join('\n')}
      </div>
    </AbsoluteFill>
  );
}

// ── HookText ──────────────────────────────────────────────────────────────
// REPLACES ChartCaption from v1 entirely.
//
// Renders sceneJson.hook_text as a single static line in the top 12% of
// the frame. Visible for the entire video from frame 0.
//
// The text fades in over the first 0.5 seconds so it does not feel abrupt.
// Font: brand.font_heading (Oswald) — uppercase, bold, large.
// Colour adapts to background: dark on white, white on dark backgrounds.
//
// If hook_text is empty or missing, nothing is rendered.
function HookText({ hookText, brand, bgKey, hookH, canvasW, frame, fps }) {
  // Nothing to render if hook_text is missing
  if (!hookText) return null;

  // Two-color format: "BLUE WORDS|black supporting text"
  // Split on first | — blue part before, black part after.
  // If no | present, entire text renders in black.
  const pipeIdx  = hookText.indexOf('|');
  const bluePart  = pipeIdx >= 0 ? hookText.substring(0, pipeIdx).trim() : '';
  const blackPart = pipeIdx >= 0 ? hookText.substring(pipeIdx + 1).trim() : hookText.trim();

  // Fast fade-in over 0.2s
  const fadeFrames = Math.round(fps * 0.2);
  const opacity    = frame === 0 ? 0 : Math.min(frame / Math.max(fadeFrames, 1), 1);

  // Separator line colour adapts to background
  const isLight        = bgKey === 'white' || bgKey === 'off_white';

  // Subtle separator line between hook zone and chart zone
  const separatorColor = isLight
    ? 'rgba(27,42,74,0.12)'
    : 'rgba(255,255,255,0.12)';

  return (
    <AbsoluteFill
      style={{
        top:            0,
        height:         hookH,
        bottom:         'auto',
        display:        'flex',
        alignItems:     'flex-end',   // anchor to bottom of hook zone
        justifyContent: 'center',
        paddingBottom:  32,           // sit 32px above the chart — pulls text down
        padding:        '0 40px',
        paddingBottom:  32,
        opacity,
        pointerEvents:  'none',
      }}
    >
      {/* Separator line at bottom of hook zone */}
      <div
        style={{
          position:        'absolute',
          bottom:          0,
          left:            40,
          right:           40,
          height:          1,
          backgroundColor: separatorColor,
        }}
      />

      {/* Hook text — two-color: blue part | black part */}
      <div
        style={{
          fontFamily:    `${brand.font_heading}, Arial, sans-serif`,
          fontSize:      52,
          fontWeight:    700,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          textAlign:     'center',
          lineHeight:    1.15,
        }}
      >
        {/* Blue part — brand accent blue for emphasis words */}
        {bluePart && (
          <span style={{ color: '#2563EB' }}>{bluePart} </span>
        )}
        {/* Black part — main text */}
        <span style={{ color: '#000000' }}>{blackPart}</span>
      </div>
    </AbsoluteFill>
  );
}