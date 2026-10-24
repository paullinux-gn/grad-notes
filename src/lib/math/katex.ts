/**
 * Math typesetting with KaTeX (plus mhchem for chemistry: \ce{H2O}). It is
 * loaded the first time a page shows math, so pages without any don't pay
 * for it.
 */

type Katex = typeof import('katex').default;

let katex: Katex | null = null;
let loading: Promise<Katex> | null = null;

export function loadKatex(): Promise<Katex> {
  return (loading ??= Promise.all([import('katex'), import('katex/dist/katex.min.css')])
    .then(async ([k]) => {
      // mhchem adds \ce and \pu to the copy of KaTeX it imports (this one).
      await import('katex/contrib/mhchem');
      katex = k.default;
      return katex;
    })
    .catch((e) => {
      loading = null;
      throw e;
    }));
}

const OPTIONS = {
  throwOnError: false,
  strict: 'ignore' as const,
  trust: false,
  // Screen readers and copy get MathML; people see HTML.
  output: 'htmlAndMathml' as const,
  maxExpand: 500,
  maxSize: 20,
  errorColor: 'var(--c-red)',
};

/** Typesets `latex` into `el` now if KaTeX is loaded, or as soon as it is. */
export function renderMath(el: HTMLElement, latex: string, display: boolean): void {
  if (katex) return void draw(katex, el, latex, display);
  // Keep the source visible until KaTeX arrives; only the latest request draws.
  el.textContent = latex;
  el.dataset.pending = latex;
  void loadKatex().then((k) => {
    if (el.dataset.pending === latex) draw(k, el, latex, display);
  });
}

function draw(k: Katex, el: HTMLElement, latex: string, display: boolean) {
  delete el.dataset.pending;
  try {
    k.render(latex, el, { ...OPTIONS, displayMode: display });
  } catch {
    el.textContent = latex;
  }
}

/** Why `latex` doesn't typeset, or null if it does (needs KaTeX loaded). */
export function mathError(latex: string, display: boolean): string | null {
  if (!katex || !latex.trim()) return null;
  try {
    katex.renderToString(latex, { ...OPTIONS, throwOnError: true, displayMode: display });
    return null;
  } catch (e) {
    return String((e as Error).message ?? e)
      .replace(/^KaTeX parse error:\s*/, '')
      .replace(/\s*at (position \d+|end of input):.*$/s, '');
  }
}

/** Typeset HTML for a short snippet (autocomplete and the symbol palette). */
export function mathHTML(latex: string): string {
  if (!katex) return '';
  try {
    return katex.renderToString(latex, { ...OPTIONS, displayMode: false, output: 'html' });
  } catch {
    return '';
  }
}

/** MathML for a formula (the Word export builds equations from it), or '' before KaTeX loads. */
export function mathML(latex: string, display: boolean): string {
  if (!katex) return '';
  try {
    return katex.renderToString(latex, { ...OPTIONS, throwOnError: true, displayMode: display, output: 'mathml' });
  } catch {
    return '';
  }
}

export const katexLoaded = () => katex !== null;
