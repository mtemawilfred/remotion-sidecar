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
        start_ms={0}
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
// Dispatches to the correct component based on overlay.type.
// chart_x/y/w/h are passed in pixels so each component positions correctly.
function ChartOverlay({ overlay, chartX, chartY, chartW, chartH, brand, bgKey, fps, frame }) {

  // ── start_ms gate ────────────────────────────────────────────────────────
  // Every overlay has a start_ms. Nothing renders before that frame.
  const startFrame = Math.round((overlay.start_ms / 1000) * fps);
  if (frame < startFrame) return null;

  // Shared props passed to every SVG overlay component
  const shared = {
    chart_x: chartX,
    chart_y: chartY,
    chart_w: chartW,
    chart_h: chartH,
    brand,
    start_ms: overlay.start_ms,
  };

  switch (overlay.type) {

    case 'supply_zone':
      return (
        <SupplyZone
          y_top_pct={overlay.y_top_pct}
          y_bottom_pct={overlay.y_bottom_pct}
          x_start_pct={overlay.x_start_pct ?? 0}
          x_end_pct={overlay.x_end_pct ?? 1}
          label={overlay.label}
          mitigated={overlay.mitigated || false}
          {...shared}
        />
      );

    case 'demand_zone':
      return (
        <DemandZone
          y_top_pct={overlay.y_top_pct}
          y_bottom_pct={overlay.y_bottom_pct}
          x_start_pct={overlay.x_start_pct ?? 0}
          x_end_pct={overlay.x_end_pct ?? 1}
          label={overlay.label}
          mitigated={overlay.mitigated || false}
          {...shared}
        />
      );

    case 'order_block':
      return (
        <OrderBlock
          y_top_pct={overlay.y_top_pct}
          y_bottom_pct={overlay.y_bottom_pct}
          x_start_pct={overlay.x_start_pct}
          x_end_pct={overlay.x_end_pct}
          direction={overlay.direction || 'bullish'}
          label={overlay.label || 'OB'}
          {...shared}
        />
      );

    case 'fvg':
      return (
        <FairValueGap
          y_top_pct={overlay.y_top_pct}
          y_bottom_pct={overlay.y_bottom_pct}
          x_start_pct={overlay.x_start_pct ?? 0.3}
          x_end_pct={overlay.x_end_pct ?? 1}
          label={overlay.label || 'FVG'}
          {...shared}
        />
      );

    case 'trade_setup':
      return (
        <TradeSetup
          entry_y_pct={overlay.entry_y_pct}
          sl_y_pct={overlay.sl_y_pct}
          tp_y_pct={overlay.tp_y_pct}
          x_start_pct={overlay.x_start_pct ?? 0.5}
          x_end_pct={overlay.x_end_pct ?? 0.98}
          direction={overlay.direction || 'long'}
          rr_ratio={overlay.rr_ratio || '1:3'}
          {...shared}
        />
      );

    case 'liquidity':
      return (
        <LiquidityLevel
          y_pct={overlay.y_pct}
          x_start_pct={overlay.x_start_pct ?? 0}
          x_end_pct={overlay.x_end_pct ?? 0.7}
          label={overlay.label || '$$$'}
          swept={overlay.swept || false}
          {...shared}
        />
      );

    case 'trendline':
      return (
        <TrendLine
          x1_pct={overlay.x1_pct}
          y1_pct={overlay.y1_pct}
          x2_pct={overlay.x2_pct}
          y2_pct={overlay.y2_pct}
          color={overlay.color}
          {...shared}
        />
      );

    case 'key_level':
      return (
        <KeyLevelLine
          y_pct={overlay.y_pct}
          label={overlay.label}
          color={overlay.color}
          {...shared}
        />
      );

    case 'bos_label':
      // BOS (Break of Structure) label — horizontal dashed line + text
      return (
        <BOSLabel
          x_pct={overlay.x_pct}
          y_pct={overlay.y_pct}
          direction={overlay.direction || 'up'}
          chartX={chartX}
          chartY={chartY}
          chartW={chartW}
          chartH={chartH}
          frame={frame}
          fps={fps}
          start_ms={overlay.start_ms}
        />
      );

    // candle_label and floating_label are handled as HTML outside the SVG
    case 'candle_label':
    case 'floating_label':
      return null;

    default:
      return null;
  }
}

// ── BOSLabel ──────────────────────────────────────────────────────────────
// Horizontal dashed line with "BOS" text above/below.
// Appears at the structure break point — synced to the word "break" or "BOS".
function BOSLabel({ x_pct, y_pct, direction, chartX, chartY, chartW, chartH, frame, fps, start_ms }) {
  const startFrame = Math.round((start_ms / 1000) * fps);
  const localF     = frame - startFrame;

  // Line draws from left to right over 0.5s
  const lineProgress = interpolate(localF, [0, Math.round(fps * 0.5)], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Label fades in after line is 60% drawn
  const labelOpacity = interpolate(localF, [Math.round(fps * 0.3), Math.round(fps * 0.6)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const cx      = chartX + x_pct * chartW;
  const cy      = chartY + y_pct * chartH;
  const lineEnd = cx + (chartX + chartW - cx) * lineProgress;
  const textY   = direction === 'up' ? cy - 14 : cy + 26;

  return (
    <g>
      {/* Dashed horizontal line at the structure break */}
      <line
        x1={cx} y1={cy}
        x2={lineEnd} y2={cy}
        stroke="rgba(255,255,255,0.65)"
        strokeWidth={1.5}
        strokeDasharray="6 4"
      />
      {/* BOS text label */}
      <text
        x={cx + 8}
        y={textY}
        fill="rgba(255,255,255,0.9)"
        fontSize={22}
        fontFamily="Arial"
        fontWeight="bold"
        opacity={labelOpacity}
      >
        BOS
      </text>
    </g>
  );
}

// ── CandleLabel ───────────────────────────────────────────────────────────
// HTML text label pointing to a specific price level on the chart.
// Used for "High", "Close", "Open", "Low" annotations like the reference video.
// A small horizontal tick line connects the label to the price level.
function CandleLabel({ overlay, chartX, chartY, chartW, chartH, frame, fps, brand, bgKey }) {
  const startFrame = Math.round((overlay.start_ms / 1000) * fps);
  if (frame < startFrame) return null;

  const localF   = frame - startFrame;
  const opacity  = interpolate(localF, [0, 8], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const slideX   = interpolate(localF, [0, 12], [overlay.side === 'right' ? 20 : -20, 0], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  // Position within chart zone in pixels
  const px = chartX + overlay.target_x_pct * chartW;
  const py = chartY + overlay.target_y_pct * chartH;

  const isLight = bgKey === 'white' || bgKey === 'off_white';
  const textColor = isLight ? '#111111' : '#FFFFFF';

  return (
    <AbsoluteFill
      style={{
        pointerEvents: 'none',
        opacity,
        transform: `translateX(${slideX}px)`,
      }}
    >
      {/* Horizontal tick line connecting label to price level */}
      <svg
        width={CANVAS_W}
        height={CANVAS_H}
        style={{ position: 'absolute', top: 0, left: 0 }}
      >
        <line
          x1={overlay.side === 'right' ? px + 4 : px - 4}
          y1={py}
          x2={overlay.side === 'right' ? px + 50 : px - 50}
          y2={py}
          stroke={isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)'}
          strokeWidth={1.5}
        />
      </svg>
      {/* Text label */}
      <div
        style={{
          position:   'absolute',
          top:        py - 12,
          left:       overlay.side === 'right' ? px + 56 : undefined,
          right:      overlay.side === 'left'  ? CANVAS_W - px + 56 : undefined,
          fontFamily: brand.font_body,
          fontSize:   30,
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
// "Buy Here", "Sell Here", "4H", "15M" — floating labels at chart positions.
// Fades and pops in at start_ms. Color drives intent (green=buy, red=sell).
function ChartFloatingLabel({ overlay, chartX, chartY, chartW, chartH, frame, fps, brand, bgKey }) {
  const startFrame = Math.round((overlay.start_ms / 1000) * fps);
  if (frame < startFrame) return null;

  const localF  = frame - startFrame;
  const opacity = interpolate(localF, [0, 10], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const scale   = interpolate(localF, [0, 10], [0.8, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  const px = chartX + overlay.x_pct * chartW;
  const py = chartY + overlay.y_pct * chartH;

  // Color: explicit overlay.color, or infer from text content
  const text    = overlay.text || '';
  const isBuy   = text.toLowerCase().includes('buy');
  const isSell  = text.toLowerCase().includes('sell');
  const bgColor = overlay.color
    ? overlay.color
    : isBuy  ? '#26a69a'
    : isSell ? '#ef5350'
    : brand.accent;

  const isLight = bgKey === 'white' || bgKey === 'off_white';

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', opacity }}>
      <div
        style={{
          position:        'absolute',
          top:             py - 22,
          left:            px,
          transform:       `scale(${scale})`,
          transformOrigin: 'left center',
          backgroundColor: bgColor,
          color:           isLight && !overlay.color ? '#FFFFFF' : '#FFFFFF',
          fontFamily:      brand.font_heading,
          fontSize:        28,
          fontWeight:      700,
          padding:         '6px 16px',
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
