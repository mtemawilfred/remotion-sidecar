// ── hooks/useBrand.js ─────────────────────────────────────────────────────
// Resolves the brand theme from the scene JSON brand block.
// Falls back to PipsGravity defaults if any field is missing.
// Every component imports this hook — never hardcode brand values.

export function useBrand(brandBlock = {}) {
  return {
    // Colors
    primary:      brandBlock.primary      || '#1B2A4A',
    secondary:    brandBlock.secondary    || '#FFFFFF',
    accent:       brandBlock.accent       || '#C9A84C',
    danger:       brandBlock.danger       || '#991B1B',
    success:      brandBlock.success      || '#166534',
    light:        brandBlock.light        || '#E8EDF5',
    gray:         brandBlock.gray         || '#6B7280',

    // Typography
    font_heading: brandBlock.font_heading || 'Oswald',
    font_body:    brandBlock.font_body    || 'Inter',

    // BGM
    bgm_track:    brandBlock.bgm_track    || 'ambient_calm',
  };
}
