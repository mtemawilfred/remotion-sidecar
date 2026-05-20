// ── layers/ElementsLayer.jsx ──────────────────────────────────────────────
// Layer 3 — all overlay, chart, and motion graphic components.
// Every component in the system is registered in COMPONENT_MAP below.
// To add a new component: create the file, export it, import here, add to map.

import React from 'react';
import { AbsoluteFill } from 'remotion';

// Overlay components
import { SpotlightCircle }   from '../overlays/SpotlightCircle';
import { DrawnArrow }        from '../overlays/DrawnArrow';
import { FloatingLabel }     from '../overlays/FloatingLabel';
import { IconPopIn }         from '../overlays/IconPopIn';
import { RedXStrike }        from '../overlays/RedXStrike';
import { CheckMarkReveal }   from '../overlays/CheckMarkReveal';
import { BackgroundBlur }    from '../overlays/BackgroundBlur';
import { GlowPulse }         from '../overlays/GlowPulse';
import { DashedCircle }      from '../overlays/DashedCircle';
import { StickerReveal }     from '../overlays/StickerReveal';
import { HighlightRegion }   from '../overlays/HighlightRegion';
import { ColorWash }         from '../overlays/ColorWash';

// Engagement & hook components
import { ImpactLabel }       from '../overlays/EngagementComponents';
import { NewsTickerHook }    from '../overlays/EngagementComponents';
import { ProductCard }       from '../overlays/EngagementComponents';

// Motion graphic scene components
import { InfoCard }          from '../motionGraphics/InfoCard';
import { ComparisonRow }     from '../motionGraphics/ComparisonRow';
import { StatReveal }        from '../motionGraphics/StatReveal';
import { ListBuildup }       from '../motionGraphics/ListBuildup';
import { SectionTitle }      from '../motionGraphics/SectionTitle';
import { FormulaDisplay }    from '../motionGraphics/FormulaDisplay';
import { TimelineStep }      from '../motionGraphics/TimelineStep';
import { QuoteCard }         from '../motionGraphics/QuoteCard';
import { BeforeAfter }       from '../motionGraphics/BeforeAfter';
import { PipCounter }        from '../motionGraphics/PipCounter';

// Chart engine and overlays
import { LiveCandleChart }   from '../chart/LiveCandleChart';
import { SupplyZone, DemandZone } from '../chart/SupplyDemandZones';
import {
  FairValueGap,
  OrderBlock,
  LiquidityLevel,
  TrendLine,
  KeyLevelLine,
  StructureLabel,
  PriceArrow,
  SSSMarker,
  ChartBorderFrame,
  TimeframeLabel,
} from '../chart/ChartOverlays';
import {
  TradeSetup,
  EquilibriumEntry,
  BreakEven,
} from '../chart/TradeComponents';
import {
  MarketStructureWave,
  SwingPointLabel,
  ControlLabel,
} from '../chart/MarketStructure';

// Caption system
import {
  WordByWordCaption,
  HighlightCaption,
  KaraokeCaption,
} from '../captions/CaptionSystem';

// ── COMPONENT MAP ──────────────────────────────────────────────────────────
// Maps component name strings (from scene JSON) to React components.
// Add every new component here when created.
const COMPONENT_MAP = {
  // Overlays
  SpotlightCircle,
  DrawnArrow,
  FloatingLabel,
  IconPopIn,
  RedXStrike,
  CheckMarkReveal,
  BackgroundBlur,
  GlowPulse,
  DashedCircle,
  StickerReveal,
  HighlightRegion,
  ColorWash,

  // Engagement & hook
  ImpactLabel,
  NewsTickerHook,
  ProductCard,

  // Motion graphics
  InfoCard,
  ComparisonRow,
  StatReveal,
  ListBuildup,
  SectionTitle,
  FormulaDisplay,
  TimelineStep,
  QuoteCard,
  BeforeAfter,
  PipCounter,

  // Chart engine
  LiveCandleChart,

  // Chart zone overlays
  SupplyZone,
  DemandZone,
  FairValueGap,
  OrderBlock,
  LiquidityLevel,
  TrendLine,
  KeyLevelLine,
  StructureLabel,
  PriceArrow,
  SSSMarker,
  ChartBorderFrame,
  TimeframeLabel,

  // Trade components
  TradeSetup,
  EquilibriumEntry,
  BreakEven,

  // Market structure
  MarketStructureWave,
  SwingPointLabel,
  ControlLabel,

  // Caption system
  WordByWordCaption,
  HighlightCaption,
  KaraokeCaption,
};

export const ElementsLayer = ({ sceneJson, brand }) => {
  const elements = sceneJson.layers?.elements || [];
  if (elements.length === 0) return null;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {elements.map((el, i) => {
        const Component = COMPONENT_MAP[el.component];
        if (!Component) {
          console.warn(`[ElementsLayer] Unknown component: ${el.component}`);
          return null;
        }
        return (
          <Component
            key={i}
            brand={brand}
            stt_timestamps={sceneJson.stt_timestamps || []}
            {...el}
          />
        );
      })}
    </AbsoluteFill>
  );
};
