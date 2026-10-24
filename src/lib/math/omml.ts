/**
 * Formulas for Word: LaTeX → MathML (KaTeX) → Office Math (OMML), so an
 * exported document has real equations Word can edit, not pictures or
 * source. Covers what notes use: fractions, roots, scripts, big operators,
 * accents, matrices and cases. Anything else keeps its symbols in a row.
 */

import { mathML } from './katex';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const BIG = /^[∑∏∐⋃⋂⨁⨂∫∬∭∮∯∰]$/;

function run(text: string, upright = false): string {
  if (!text) return '';
  return `<m:r>${upright ? '<m:rPr><m:sty m:val="p"/></m:rPr>' : ''}<m:t xml:space="preserve">${esc(text)}</m:t></m:r>`;
}

const kids = (el: Element) => Array.from(el.children);
const tag = (el: Element | undefined) => el?.localName ?? '';
const e = (inner: string) => `<m:e>${inner}</m:e>`;

/** An n-ary operator (∑, ∫) with its limits, taking what follows as its body. */
function nary(op: string, sub: string | null, sup: string | null, body: string): string {
  const pr = `<m:naryPr><m:chr m:val="${esc(op)}"/><m:limLoc m:val="${/[∫∬∭∮]/.test(op) ? 'subSup' : 'undOvr'}"/>${sub === null ? '<m:subHide m:val="1"/>' : ''}${sup === null ? '<m:supHide m:val="1"/>' : ''}</m:naryPr>`;
  return `<m:nary>${pr}<m:sub>${sub ?? ''}</m:sub><m:sup>${sup ?? ''}</m:sup>${e(body)}</m:nary>`;
}

/** The big operator a script element is built on, if it is one. */
function bigOp(el: Element): string | null {
  const base = el.children[0];
  return tag(base) === 'mo' && BIG.test(base.textContent?.trim() ?? '') ? base.textContent!.trim() : null;
}

const isFence = (el: Element | undefined) => tag(el) === 'mo' && el!.getAttribute('fence') === 'true';

/** A row of children; a big operator takes the next item as its body. */
function row(list: Element[]): string {
  // \left( … \right) and the like: brackets that grow with what they hold.
  if (list.length > 1 && isFence(list[0])) {
    const close = isFence(list.at(-1)) ? list.at(-1)! : null;
    const inner = list.slice(1, close ? -1 : undefined);
    const beg = list[0].textContent?.trim() ?? '';
    const end = close?.textContent?.trim() ?? '';
    return `<m:d><m:dPr><m:begChr m:val="${esc(beg)}"/><m:endChr m:val="${esc(end)}"/></m:dPr>${e(row(inner))}</m:d>`;
  }
  const out: string[] = [];
  for (let i = 0; i < list.length; i++) {
    const el = list[i];
    // Scripts on nothing (chemistry writes H then _2 apart) go on what came before.
    if (['msub', 'msup', 'msubsup'].includes(tag(el)) && !node(el.children[0]) && out.length) {
      const c = kids(el);
      const base = e(out.pop()!);
      const t = tag(el);
      out.push(
        t === 'msub'
          ? `<m:sSub>${base}<m:sub>${node(c[1])}</m:sub></m:sSub>`
          : t === 'msup'
            ? `<m:sSup>${base}<m:sup>${node(c[1])}</m:sup></m:sSup>`
            : `<m:sSubSup>${base}<m:sub>${node(c[1])}</m:sub><m:sup>${node(c[2])}</m:sup></m:sSubSup>`,
      );
      continue;
    }
    const op = ['msub', 'msup', 'msubsup', 'munder', 'mover', 'munderover'].includes(tag(el)) ? bigOp(el) : tag(el) === 'mo' && BIG.test(el.textContent?.trim() ?? '') ? el.textContent!.trim() : null;
    if (op) {
      const c = kids(el);
      const t = tag(el);
      const sub = t === 'msub' || t === 'msubsup' || t === 'munder' || t === 'munderover' ? node(c[1]) : null;
      const sup = t === 'msup' || t === 'mover' ? node(c[1]) : t === 'msubsup' || t === 'munderover' ? node(c[2]) : null;
      const body = i + 1 < list.length ? node(list[++i]) : '';
      out.push(nary(op, t === 'mo' ? null : sub, t === 'mo' ? null : sup, body));
      continue;
    }
    const made = node(el);
    if (made) out.push(made);
  }
  return out.join('');
}

function node(el: Element | undefined): string {
  if (!el) return '';
  const c = kids(el);
  switch (tag(el)) {
    case 'mi': {
      const text = el.textContent ?? '';
      // Single letters are italic in math; names (sin, log) and \mathrm are not.
      return run(text, !!el.closest('[mathvariant="normal"]') || text.length > 1);
    }
    case 'mn':
    case 'mo':
      return run(el.textContent ?? '', true);
    case 'mtext':
      return run(el.textContent ?? '', true);
    case 'mspace':
      return run(' ', true);
    case 'msup':
      return `<m:sSup>${e(node(c[0]))}<m:sup>${node(c[1])}</m:sup></m:sSup>`;
    case 'msub':
      return `<m:sSub>${e(node(c[0]))}<m:sub>${node(c[1])}</m:sub></m:sSub>`;
    case 'msubsup':
      return `<m:sSubSup>${e(node(c[0]))}<m:sub>${node(c[1])}</m:sub><m:sup>${node(c[2])}</m:sup></m:sSubSup>`;
    case 'mfrac': {
      const bar = el.getAttribute('linethickness');
      const pr = bar && parseFloat(bar) === 0 ? '<m:fPr><m:type m:val="noBar"/></m:fPr>' : '';
      return `<m:f>${pr}<m:num>${node(c[0])}</m:num><m:den>${node(c[1])}</m:den></m:f>`;
    }
    case 'msqrt':
      return `<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/>${e(row(c))}</m:rad>`;
    case 'mroot':
      return `<m:rad><m:deg>${node(c[1])}</m:deg>${e(node(c[0]))}</m:rad>`;
    case 'mover': {
      const mark = c[1];
      if (!node(mark)) return node(c[0]);
      if (el.getAttribute('accent') === 'true' && tag(mark) === 'mo') {
        const chr = mark.textContent?.trim() ?? '';
        if (chr === '‾' || chr === '¯' || chr === '_') return `<m:bar><m:barPr><m:pos m:val="top"/></m:barPr>${e(node(c[0]))}</m:bar>`;
        return `<m:acc><m:accPr><m:chr m:val="${esc(chr)}"/></m:accPr>${e(node(c[0]))}</m:acc>`;
      }
      return `<m:limUpp>${e(node(c[0]))}<m:lim>${node(c[1])}</m:lim></m:limUpp>`;
    }
    case 'munder':
      if (!node(c[1])) return node(c[0]);
      return `<m:limLow>${e(node(c[0]))}<m:lim>${node(c[1])}</m:lim></m:limLow>`;
    case 'munderover':
      return `<m:limUpp>${e(`<m:limLow>${e(node(c[0]))}<m:lim>${node(c[1])}</m:lim></m:limLow>`)}<m:lim>${node(c[2])}</m:lim></m:limUpp>`;
    case 'mtable': {
      const rows = c.filter((r) => tag(r) === 'mtr');
      const cols = Math.max(1, ...rows.map((r) => r.children.length));
      const mr = rows.map((r) => `<m:mr>${kids(r).map((cell) => e(row(kids(cell)))).join('')}</m:mr>`).join('');
      return `<m:m><m:mPr><m:mcs><m:mc><m:mcPr><m:count m:val="${cols}"/><m:mcJc m:val="center"/></m:mcPr></m:mc></m:mcs></m:mPr>${mr}</m:m>`;
    }
    case 'mphantom':
    case 'annotation':
    case 'annotation-xml':
      return '';
    case 'semantics':
      return node(c[0]);
    default:
      // mrow, mstyle, mpadded, menclose, math…
      return row(c);
  }
}

/** A formula as Office Math, or null if it can't be built (then show its source). */
export function toOmml(latex: string, display: boolean): string | null {
  const ml = mathML(latex, display);
  if (!ml) return null;
  const math = new DOMParser().parseFromString(ml, 'text/html').querySelector('math');
  if (!math || math.querySelector('merror')) return null;
  const body = `<m:oMath>${node(math)}</m:oMath>`;
  return display ? `<m:oMathPara>${body}</m:oMathPara>` : body;
}
