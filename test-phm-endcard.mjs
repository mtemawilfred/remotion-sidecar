import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync('src/components/PGPresentation.jsx', 'utf8');

assert.match(src, /const endcardOn = beat\.graphic\?\.treatment === 'p-endcard';/);
assert.match(src, /const railOn = !endcardOn && !!p\.rail/);
assert.match(src, /\{!endcardOn && p\.stack && <Stack/);
assert.match(src, /const OVERSHOOT = true;/);

console.log('PHM end card owns the frame; OVERSHOOT remains enabled');
