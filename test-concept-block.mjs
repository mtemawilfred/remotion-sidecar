// WP4 check — the concept block is ONE component.
//
// _maxFlow (:244) caps a non-hook segment at 3 focal points; a concept block wants
// four elements (term + plain + analogy + diagram). The plan's ruling is that the cap
// stays and the block composes, so the two things that can actually break are:
//   1. its measured height must include the diagram it nests, or GraphicsStack's
//      fit-scale shrinks the wrong amount and the block overruns its zone;
//   2. every alias must exist in all three places this file keeps type lists, which
//      is the drift bug this component library has had before.
//   node test-concept-block.mjs
import { readFileSync } from 'fs';
import assert from 'assert';

const src = readFileSync('src/components/RepurposeLongForm.jsx', 'utf8');
const grab = (re, what) => { const m = src.match(re); assert(m, `${what} not found — renamed?`); return m[0]; };

const sandbox = `
  const POPPINS = 'Poppins';
  const CHART_HEIGHT_TYPES = ['chart_concept', 'candle_cluster', 'zone_box'];
  const measureText = ({ text, fontSize }) => ({ width: String(text).length * fontSize * 0.5 });
  ${grab(/const CB_TYPES = [^\n]+/, 'CB_TYPES')}
  ${grab(/function estHeight\(c\) \{[\s\S]*?\n\}/, 'estHeight')}
  ${grab(/function measuredHeight\(c, width\) \{[\s\S]*?\n\}/, 'measuredHeight')}
  return { measuredHeight, estHeight };`;
const { measuredHeight, estHeight } = eval(`(() => { ${sandbox} })()`);

const W = 900;
const block = (extra = {}) => ({ type: 'concept_block', term: 'ORDER BLOCK',
  plain: 'The last down candle before price exploded up.',
  analogy: 'Wet cement — price left a footprint, and it has not set yet.', ...extra });

// 1. The block measures as its parts, not as the 150px default.
const bare = measuredHeight(block(), W);
assert(bare > 300 && bare < 900, `a bare block measured ${bare}px — that is a fallback, not a measurement`);

// 2. A nested diagram adds ITS OWN measured height. This is the whole reason the
//    composite is safe inside one slot: the fit-scale sees the real block.
const withDia = measuredHeight(block({ diagram: { type: 'checklist' } }), W);
assert.strictEqual(withDia - bare, measuredHeight({ type: 'checklist' }, W),
  'the nested diagram must contribute exactly its own measured height');

// 3. A chart diagram is much taller than a text one — the recursion really dispatches
//    on the nested type instead of adding a constant.
assert(measuredHeight(block({ diagram: { type: 'chart_concept' } }), W) > withDia + 100,
  'a nested chart must measure taller than a nested checklist');

// 4. A block inside a block is refused, so measurement can never recurse forever.
assert.strictEqual(measuredHeight(block({ diagram: block() }), W), bare,
  'a nested concept_block must contribute nothing');

// 5. A Concept Library image asset is measured too, not treated as absent.
assert(measuredHeight(block({ diagram_url: 'x.png' }), W) > bare + 200);

// 6. Drift: every alias must appear in the registry switch, CB_TYPES, GRAPHIC_TYPES and
//    estHeight's table. Four lists is exactly how this library lost components before.
const aliases = JSON.parse(grab(/const CB_TYPES = \[[^\]]+\]/, 'CB_TYPES').split('= ')[1].replace(/'/g, '"'));
assert.strictEqual(aliases.length, 5);
const graphicTypes = grab(/const GRAPHIC_TYPES = \[[\s\S]*?\];/, 'GRAPHIC_TYPES');
for (const a of aliases) {
  assert(src.includes(`case '${a}':`), `${a} is in CB_TYPES but has no registry case — it would render nothing`);
  assert(graphicTypes.includes(`'${a}'`), `${a} missing from GRAPHIC_TYPES — a hook carrying it gets a junk candle_cluster injected`);
  assert(estHeight({ type: a }) > 150, `${a} has no estHeight entry — it falls through to the 150px default`);
}

console.log('concept block: all assertions pass');
