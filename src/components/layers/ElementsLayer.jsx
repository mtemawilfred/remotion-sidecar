// ── layers/ElementsLayer.jsx ──────────────────────────────────────────────
// Layer 3 — overlay components and motion graphic scenes.
// Reads the elements array from sceneJson.layers.elements.
// Each element specifies a component name and its props.
// Renders each component at its specified start_ms timestamp.

import React from 'react';
import { AbsoluteFill } from 'remotion';

// Overlay components
import { SpotlightCircle }  from '../overlays/SpotlightCircle';
import { DrawnArrow }       from '../overlays/DrawnArrow';
import { FloatingLabel }    from '../overlays/FloatingLabel';
import { IconPopIn }        from '../overlays/IconPopIn';
import { RedXStrike }       from '../overlays/RedXStrike';
import { CheckMarkReveal }  from '../overlays/CheckMarkReveal';
import { BackgroundBlur }   from '../overlays/BackgroundBlur';
import { GlowPulse }        from '../overlays/GlowPulse';
import { DashedCircle }     from '../overlays/DashedCircle';
import { StickerReveal }    from '../overlays/StickerReveal';
import { HighlightRegion }  from '../overlays/HighlightRegion';
import { ColorWash }        from '../overlays/ColorWash';

// Motion graphic scene components
import { InfoCard }         from '../motionGraphics/InfoCard';
import { ComparisonRow }    from '../motionGraphics/ComparisonRow';
import { StatReveal }       from '../motionGraphics/StatReveal';
import { ListBuildup }      from '../motionGraphics/ListBuildup';
import { SectionTitle }     from '../motionGraphics/SectionTitle';
import { FormulaDisplay }   from '../motionGraphics/FormulaDisplay';
import { TimelineStep }     from '../motionGraphics/TimelineStep';
import { QuoteCard }        from '../motionGraphics/QuoteCard';
import { BeforeAfter }      from '../motionGraphics/BeforeAfter';
import { PipCounter }       from '../motionGraphics/PipCounter';

// Map component names (from scene JSON) to React components
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
};

export const ElementsLayer = ({ sceneJson, brand }) => {
  const elements = sceneJson.layers?.elements || [];

  if (elements.length === 0) return null;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {elements.map((el, i) => {
        const Component = COMPONENT_MAP[el.component];

        if (!Component) {
          // Unknown component — log and skip rather than crashing
          console.warn(`[ElementsLayer] Unknown component: ${el.component}`);
          return null;
        }

        return (
          <Component
            key={i}
            brand={brand}
            // Spread all element props directly into the component
            // Each component destructures what it needs
            {...el}
          />
        );
      })}
    </AbsoluteFill>
  );
};
