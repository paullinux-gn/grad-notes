/**
 * LaTeX the math editor suggests as you type a backslash, and the symbol
 * palette. `insert` is what goes in: empty `{}` are slots Tab moves between,
 * and `|` (if any) is where the caret starts.
 */

export interface MathCommand {
  /** What's typed after the backslash to find it. */
  name: string;
  insert: string;
  /** Typeset as the button / suggestion face. */
  preview: string;
  /** Plain words that also find it. */
  words?: string;
}

const c = (name: string, insert = `\\${name}`, preview = insert.replace(/\{\}/g, '{\\square}').replace('|', ''), words = ''): MathCommand => ({
  name,
  insert,
  preview,
  words,
});
const sym = (names: string, words = '') => names.split(' ').map((n) => c(n, `\\${n}`, `\\${n}`, words));

export const STRUCTURES: MathCommand[] = [
  c('frac', '\\frac{}{}', '\\frac{a}{b}', 'fraction divide over'),
  c('sqrt', '\\sqrt{}', '\\sqrt{x}', 'square root radical'),
  c('nroot', '\\sqrt[]{}', '\\sqrt[n]{x}', 'nth root cube root'),
  c('sup', '^{}', 'x^{n}', 'power exponent superscript'),
  c('sub', '_{}', 'x_{i}', 'subscript index'),
  c('sum', '\\sum_{}^{}', '\\sum_{i=1}^{n}', 'sigma summation series'),
  c('prod', '\\prod_{}^{}', '\\prod_{i=1}^{n}', 'product pi'),
  c('int', '\\int_{}^{}', '\\int_{a}^{b}', 'integral'),
  c('iint', '\\iint_{}', '\\iint_{D}', 'double integral'),
  c('oint', '\\oint_{}', '\\oint_{C}', 'contour line integral'),
  c('lim', '\\lim_{ \\to }', '\\lim_{x\\to 0}', 'limit'),
  c('dv', '\\frac{d}{d}', '\\frac{dy}{dx}', 'derivative'),
  c('pdv', '\\frac{\\partial }{\\partial }', '\\frac{\\partial f}{\\partial x}', 'partial derivative'),
  c('vec', '\\vec{}', '\\vec{v}', 'vector arrow'),
  c('hat', '\\hat{}', '\\hat{x}', 'unit vector operator'),
  c('bar', '\\bar{}', '\\bar{x}', 'mean average conjugate'),
  c('dot', '\\dot{}', '\\dot{x}', 'time derivative'),
  c('ddot', '\\ddot{}', '\\ddot{x}', 'second derivative acceleration'),
  c('overline', '\\overline{}', '\\overline{AB}', 'line segment'),
  c('binom', '\\binom{}{}', '\\binom{n}{k}', 'choose combination'),
  c('abs', '\\left| | \\right|', '|x|', 'absolute value modulus'),
  c('norm', '\\left\\| | \\right\\|', '\\|v\\|', 'norm length'),
  c('paren', '\\left( | \\right)', '\\left(\\square\\right)', 'parentheses brackets'),
  c('pmatrix', '\\begin{pmatrix} | &  \\\\  &  \\end{pmatrix}', '\\left(\\begin{smallmatrix} a & b \\\\ c & d \\end{smallmatrix}\\right)', 'matrix'),
  c('bmatrix', '\\begin{bmatrix} | &  \\\\  &  \\end{bmatrix}', '\\left[\\begin{smallmatrix} a & b \\\\ c & d \\end{smallmatrix}\\right]', 'matrix square brackets'),
  c('vmatrix', '\\begin{vmatrix} | &  \\\\  &  \\end{vmatrix}', '\\left|\\begin{smallmatrix} a & b \\\\ c & d \\end{smallmatrix}\\right|', 'determinant'),
  c('cases', '\\begin{cases} | & \\text{if }  \\\\  & \\text{otherwise} \\end{cases}', '\\left\\{\\begin{smallmatrix} a \\\\ b \\end{smallmatrix}\\right.', 'piecewise'),
  c('aligned', '\\begin{aligned} | &=  \\\\  &=  \\end{aligned}', '\\begin{smallmatrix} a=b \\\\ \\;\\;=c \\end{smallmatrix}', 'align derivation steps equations'),
  c('text', '\\text{}', '\\text{abc}', 'words units'),
  c('mathbb', '\\mathbb{}', '\\mathbb{R}', 'reals naturals integers set'),
  c('mathbf', '\\mathbf{}', '\\mathbf{v}', 'bold vector'),
  c('mathrm', '\\mathrm{}', '\\mathrm{d}x', 'roman upright'),
  c('ce', '\\ce{}', '\\ce{H2O}', 'chemistry chemical formula reaction'),
  c('pu', '\\pu{}', '\\pu{m/s^2}', 'physical unit'),
];

export const GREEK: MathCommand[] = sym(
  'alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa lambda mu nu xi pi rho sigma tau upsilon phi varphi chi psi omega Gamma Delta Theta Lambda Xi Pi Sigma Phi Psi Omega',
  'greek letter',
);

export const OPERATORS: MathCommand[] = [
  ...sym('pm mp times div cdot ast circ bullet oplus otimes', 'operator'),
  ...sym('partial nabla infty hbar ell Re Im angle degree', 'symbol'),
  ...sym('cup cap setminus emptyset forall exists nexists neg land lor', 'logic set'),
];

export const RELATIONS: MathCommand[] = [
  ...sym('neq leq geq ll gg approx equiv sim simeq cong propto', 'relation'),
  ...sym('in notin subset subseteq supset supseteq perp parallel mid', 'relation set'),
];

export const ARROWS: MathCommand[] = sym(
  'to rightarrow leftarrow leftrightarrow Rightarrow Leftarrow Leftrightarrow implies iff mapsto uparrow downarrow rightleftharpoons longrightarrow',
  'arrow',
);

/** Functions written upright (\sin x). Suggested, not on the palette. */
const FUNCTIONS: MathCommand[] = sym('sin cos tan csc sec cot arcsin arccos arctan sinh cosh tanh log ln exp det dim ker max min sup inf arg deg gcd', 'function');

/** A few more that only autocomplete knows. */
const EXTRA: MathCommand[] = [
  ...sym('cdots ldots vdots ddots quad qquad', 'dots space'),
  c('langle', '\\langle | \\rangle', '\\langle \\psi \\rangle', 'bra ket expectation'),
  c('left', '\\left( | \\right)', '\\left(\\square\\right)', 'brackets'),
  c('overrightarrow', '\\overrightarrow{}', '\\overrightarrow{AB}', 'vector'),
  c('underbrace', '\\underbrace{}_{}', '\\underbrace{a+b}_{n}', 'brace label'),
  c('boxed', '\\boxed{}', '\\boxed{x=1}', 'answer box'),
  c('cancel', '\\cancel{}', '\\cancel{x}', 'cross out'),
  c('mathcal', '\\mathcal{}', '\\mathcal{L}', 'calligraphic'),
  c('operatorname', '\\operatorname{}', '\\operatorname{rank}', 'function name'),
];

export const PALETTE: { name: string; items: MathCommand[] }[] = [
  { name: 'Structures', items: STRUCTURES },
  { name: 'Greek', items: GREEK },
  { name: 'Operators', items: OPERATORS },
  { name: 'Relations', items: RELATIONS },
  { name: 'Arrows', items: ARROWS },
];

const ALL: MathCommand[] = (() => {
  const seen = new Set<string>();
  return [...STRUCTURES, ...GREEK, ...OPERATORS, ...RELATIONS, ...ARROWS, ...FUNCTIONS, ...EXTRA].filter((m) => !seen.has(m.name) && seen.add(m.name));
})();

/** Suggestions for what follows a backslash: name prefix first, then contains, then words. */
export function suggest(query: string, limit = 8): MathCommand[] {
  const q = query.toLowerCase();
  if (!q) return STRUCTURES.slice(0, limit);
  const starts = ALL.filter((m) => m.name.toLowerCase().startsWith(q)).sort((a, b) => (a.name.startsWith(query) ? 0 : 1) - (b.name.startsWith(query) ? 0 : 1) || a.name.length - b.name.length);
  const contains = ALL.filter((m) => !starts.includes(m) && m.name.toLowerCase().includes(q));
  const words = q.length > 2 ? ALL.filter((m) => !starts.includes(m) && !contains.includes(m) && m.words?.includes(q)) : [];
  return [...starts, ...contains, ...words].slice(0, limit);
}
