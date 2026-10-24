/**
 * Colour conversions for the colour wheel. Colours are picked in OKLCH
 * (lightness, chroma, hue), where equal steps look equal, so a tint keeps
 * the same strength all the way round the wheel.
 */

export type RGB = [number, number, number];

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** OKLCH → sRGB (0–1 channels; may fall outside 0–1 when out of gamut). */
export function oklchToRgb(l: number, c: number, h: number): RGB {
  const rad = (h * Math.PI) / 180;
  const a = c * Math.cos(rad);
  const b = c * Math.sin(rad);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    fromLinear(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_),
    fromLinear(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_),
    fromLinear(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_),
  ];
}

/** sRGB (0–1 channels) → OKLCH. */
export function rgbToOklch([r, g, b]: RGB): { l: number; c: number; h: number } {
  const [lr, lg, lb] = [r, g, b].map(toLinear);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const c = Math.hypot(A, B);
  let h = (Math.atan2(B, A) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: L, c, h: c < 1e-4 ? 0 : h };
}

const inGamut = (rgb: RGB) => rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4);

/** The most chroma (up to `c`) that sRGB can show at this lightness and hue. */
export function clampChroma(l: number, c: number, h: number): number {
  if (inGamut(oklchToRgb(l, c, h))) return c;
  let lo = 0;
  let hi = c;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklchToRgb(l, mid, h))) lo = mid;
    else hi = mid;
  }
  return lo;
}

export function toHex(rgb: RGB): string {
  return (
    '#' +
    rgb
      .map((v) =>
        Math.round(Math.min(1, Math.max(0, v)) * 255)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}

export function parseHex(hex: string): RGB | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const full = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255) as RGB;
}

/** An OKLCH colour as hex, pulled into the sRGB gamut. */
export function oklchHex(l: number, c: number, h: number): string {
  return toHex(oklchToRgb(l, clampChroma(l, c, h), h));
}

function relativeLuminance([r, g, b]: RGB): number {
  const [lr, lg, lb] = [r, g, b].map((v) => toLinear(Math.min(1, Math.max(0, v))));
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

/** WCAG contrast ratio between two colours. */
export function contrast(a: RGB, b: RGB): number {
  const [x, y] = [relativeLuminance(a), relativeLuminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** White or near-black, whichever reads better on `bg`. */
export function textOn(bg: RGB): 'light' | 'dark' {
  return contrast(bg, [1, 1, 1]) >= contrast(bg, [0.114, 0.114, 0.122]) ? 'light' : 'dark';
}

/** Any CSS colour (including oklch() and var-free color-mix()) as sRGB. */
export function cssToRgb(css: string): RGB | null {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.fillStyle = '#000';
  ctx.fillStyle = css;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return [r / 255, g / 255, b / 255];
}
