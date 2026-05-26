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
//   - stt_timestamps: no longer generated or consumed
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
        start_ms={chartConfig.start_ms || 1800}
        visible_count={visibleCount}
        candle_width={36}
        candle_gap={6}
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
          CHANGED FROM v1: ChartCaption (word-by-word karaoke) is gone.
          HookText renders sceneJson.hook_text as a single static line
          in the top 12% of the frame. Visible for the entire video.
          No timing logic. No stt_timestamps. */}
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
      return (
        <g opacity={fadeProg * 0.9}>
          <rect x={x1} y={topY} width={w} height={h} fill="rgba(200,60,60,0.18)" />
          <line x1={x1} y1={topY}   x2={x1+w} y2={topY}   stroke="rgba(220,80,80,0.8)" strokeWidth={1.5} />
          <line x1={x1} y1={topY+h} x2={x1+w} y2={topY+h} stroke="rgba(220,80,80,0.6)" strokeWidth={1} strokeDasharray="4 3" />
          {overlay.label && expandProg > 0.5 && (
            <text x={x1+6} y={topY+14} fill="rgba(220,80,80,0.95)"
              fontSize={18} fontFamily="Arial" fontWeight="bold" opacity={fadeProg}>
              {overlay.label}
            </text>
          )}
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
      return (
        <g opacity={fadeProg * 0.9}>
          <rect x={x1} y={topY} width={w} height={h} fill="rgba(60,100,220,0.18)" />
          <line x1={x1} y1={topY+h} x2={x1+w} y2={topY+h} stroke="rgba(80,120,230,0.8)" strokeWidth={1.5} />
          <line x1={x1} y1={topY}   x2={x1+w} y2={topY}   stroke="rgba(80,120,230,0.6)" strokeWidth={1} strokeDasharray="4 3" />
          {overlay.label && expandProg > 0.5 && (
            <text x={x1+6} y={topY+h-6} fill="rgba(80,120,230,0.95)"
              fontSize={18} fontFamily="Arial" fontWeight="bold" opacity={fadeProg}>
              {overlay.label}
            </text>
          )}
        </g>
      );
    }

    // ── ORDER BLOCK ─────────────────────────────────────────────────────────
    case 'order_block': {
      const idx  = overlay.candle_index;
      const x1   = idx != null ? candleLeft(idx)  : chartX + (overlay.x_start_pct ?? 0) * chartW;
      const x2   = idx != null ? candleRight(idx) : chartX + (overlay.x_end_pct   ?? 0.1) * chartW;
      const y1   = resolveY(overlay.price_top,    overlay.y_top_pct);
      const y2   = resolveY(overlay.price_bottom, overlay.y_bottom_pct);
      const topY = Math.min(y1, y2);
      const h    = Math.abs(y2 - y1);
      const color = overlay.direction === 'bearish' ? 'rgba(220,80,80,0.9)' : 'rgba(80,120,230,0.9)';
      const fill  = overlay.direction === 'bearish' ? 'rgba(220,80,80,0.12)' : 'rgba(80,120,230,0.12)';
      return (
        <g opacity={fadeProg}>
          <rect x={x1} y={topY} width={x2-x1} height={h}
            fill={fill} stroke={color} strokeWidth={2} rx={2} />
          {overlay.label && (
            <text x={x1+3} y={topY-5} fill={color}
              fontSize={16} fontFamily="Arial" fontWeight="bold">
              {overlay.label}
            </text>
          )}
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
    // CHANGED FROM v1: swept state now has a distinct visual.
    //   swept: false → grey dashed line + grey label (liquidity is still intact)
    //   swept: true  → red line + red "SWEPT ✓" marker (liquidity has been taken)
    // This makes the teaching moment visible — the viewer sees the line change
    // colour at the exact moment the sweep happens, not just a tiny text word.
    case 'liquidity': {
      const y  = resolveY(overlay.price_level, overlay.y_pct);
      const x1 = resolveXLeft(overlay.candle_start, overlay.x_start_pct ?? 0);
      const x2 = overlay.candle_end != null
        ? candleRight(overlay.candle_end)
        : chartX + (overlay.x_end_pct ?? 0.7) * chartW;
      const w  = (x2 - x1) * expandProg;

      // Colours change based on swept state
      const lineColor  = overlay.swept ? 'rgba(220,80,80,0.85)' : 'rgba(100,100,100,0.70)';
      const labelColor = overlay.swept ? 'rgba(220,80,80,0.95)' : 'rgba(80,80,80,0.90)';
      const labelText  = overlay.swept
        ? 'SWEPT ✓'
        : (overlay.label || 'LIQUIDITY');

      return (
        <g opacity={fadeProg}>
          {/* The horizontal dotted line */}
          <line
            x1={x1} y1={y} x2={x1+w} y2={y}
            stroke={lineColor}
            strokeWidth={overlay.swept ? 2 : 1.5}
            strokeDasharray="6 4"
          />
          {/* Label sits above the line */}
          {expandProg > 0.5 && (
            <text
              x={x1+4} y={y-6}
              fill={labelColor}
              fontSize={16} fontFamily="Arial" fontWeight="bold"
              opacity={fadeProg}
            >
              {labelText}
            </text>
          )}
          {/* When swept: add a small circle marker at the right end of the line
              to mark the exact point where the sweep happened */}
          {overlay.swept && expandProg > 0.8 && (
            <circle
              cx={x1+w} cy={y} r={6}
              fill="rgba(220,80,80,0.9)"
              opacity={fadeProg}
            />
          )}
        </g>
      );
    }

    // ── BOS LABEL ────────────────────────────────────────────────────────────
    // CHANGED FROM v2: BOS line now draws FROM the structural high candle
    // TO the BOS candle, sitting at price_level (the structural high price).
    //
    // This is how the BOS is taught in the PipsGravity Academy:
    //   - The line starts at the candle that FORMED the structural high (left)
    //   - The line ends at the candle that BROKE through it (right)
    //   - The line sits at the price_level of the structural high
    //   - The viewer sees: "here was the barrier — this candle broke it"
    //
    // Required overlay fields:
    //   candle_start: index of structural high candle (left anchor)
    //   candle_index: index of BOS candle (right anchor)
    //   price_level:  candles[candle_start].h — the barrier price
    //   label:        dynamic — "BOS CONFIRMED", "STEP 2: BOS ✓" etc.
    //
    // Backward compat: if candle_start is missing, falls back to old behaviour
    // (line draws from BOS candle rightward) so existing renders don't break.
    case 'bos_label': {
      const cy = resolveY(overlay.price_level, overlay.y_pct);

      // Label sits above the line for upward BOS, below for downward BOS
      const textY     = overlay.direction === 'up' ? cy - 14 : cy + 26;
      const labelText = overlay.label || 'BOS';

      // NEW: line draws from structural high candle (left) to BOS candle (right)
      // If candle_start is provided, use it as left anchor.
      // If not, fall back to old behaviour (BOS candle to right edge).
      const hasLeftAnchor = overlay.candle_start !== undefined && overlay.candle_start !== null;

      if (hasLeftAnchor) {
        // ── New behaviour: structural high → BOS candle ──────────────────
        const xLeft  = candleToX(overlay.candle_start);
        const xRight = resolveXCenter(overlay.candle_index, overlay.x_pct);

        // Line extends from left anchor to right anchor, animated left to right
        const lineEnd = xLeft + (xRight - xLeft) * expandProg;

        return (
          <g opacity={fadeProg}>
            {/* Horizontal dashed line: structural high candle to BOS candle */}
            <line
              x1={xLeft} y1={cy} x2={lineEnd} y2={cy}
              stroke="rgba(80,80,80,0.75)"
              strokeWidth={1.5}
              strokeDasharray="6 4"
            />
            {/* Small circle at left anchor marking the structural high */}
            {expandProg > 0.1 && (
              <circle
                cx={xLeft} cy={cy} r={4}
                fill="none"
                stroke="rgba(80,80,80,0.75)"
                strokeWidth={1.5}
              />
            )}
            {/* BOS label appears near the right end once line is 70% drawn */}
            {expandProg > 0.7 && (
              <text
                x={lineEnd + 6} y={textY}
                fill="rgba(50,50,50,0.95)"
                fontSize={20} fontFamily="Arial" fontWeight="bold"
              >
                {labelText}
              </text>
            )}
          </g>
        );
      } else {
        // ── Backward compat: old behaviour (BOS candle → right edge) ─────
        const cx      = resolveXCenter(overlay.candle_index, overlay.x_pct);
        const lineEnd = cx + (chartX + chartW - cx) * expandProg;
        return (
          <g opacity={fadeProg}>
            <line
              x1={cx} y1={cy} x2={lineEnd} y2={cy}
              stroke="rgba(100,100,100,0.6)"
              strokeWidth={1.5}
              strokeDasharray="6 4"
            />
            {expandProg > 0.3 && (
              <text
                x={cx+6} y={textY}
                fill="rgba(50,50,50,0.9)"
                fontSize={20} fontFamily="Arial" fontWeight="bold"
              >
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
          top:        py - 14,
          left:       overlay.side === 'right' ? px + 54 : undefined,
          right:      overlay.side === 'left'  ? CANVAS_W - px + 54 : undefined,
          fontFamily: brand.font_body,
          fontSize:   28,
          fontWeight: 700,
          color:      overlay.color || textColor,
          whiteSpace: 'nowrap',
        }}
      >
        {overlay.text}
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
      <div
        style={{
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
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
}

// ── HookText ──────────────────────────────────────────────────────────────
// REPLACES ChartCaption from v1 entirely.
//
// Renders sceneJson.hook_text as a single static line in the top 12% of
// the frame. Visible for the entire video from frame 0.
// No timing logic. No word-by-word animation. No stt_timestamps.
//
// The text fades in over the first 0.5 seconds so it does not feel abrupt.
// Font: brand.font_heading (Oswald) — uppercase, bold, large.
// Colour adapts to background: dark on white, white on dark backgrounds.
//
// If hook_text is empty or missing, nothing is rendered.
function HookText({ hookText, brand, bgKey, hookH, canvasW, frame, fps }) {
  // Nothing to render if hook_text is missing
  if (!hookText) return null;

  // Fade in over first 0.5 seconds — gentle entry so the first candle
  // can start drawing while the title is still appearing
  const fadeFrames = Math.round(fps * 0.5);
  const opacity    = Math.min(frame / fadeFrames, 1);

  const isLight    = bgKey === 'white' || bgKey === 'off_white';
  const textColor  = isLight ? '#1B2A4A' : '#FFFFFF';

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
        alignItems:     'center',
        justifyContent: 'center',
        padding:        '0 40px',
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

      {/* Hook text — single line, uppercase, large */}
      <div
        style={{
          fontFamily:    brand.font_heading,
          fontSize:      52,
          fontWeight:    700,
          letterSpacing: 0.5,
          color:         textColor,
          textTransform: 'uppercase',
          textAlign:     'center',
          lineHeight:    1.1,
          // Accent colour for any text wrapped in a special marker.
          // Currently unused — future enhancement: allow hook_text to include
          // [highlighted] words that render in brand.accent colour.
        }}
      >
        {hookText}
      </div>
    </AbsoluteFill>
  );
}