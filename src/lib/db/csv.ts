/** CSV and tab-separated text: reading spreadsheets in, writing tables out. */

/** The separator a file most likely uses: tab, comma or semicolon. */
export function detectDelimiter(text: string): string {
  const head = text.slice(0, 4000).split(/\r?\n/).slice(0, 10);
  let best = ',';
  let bestScore = -1;
  for (const d of ['\t', ',', ';']) {
    const counts = head.map((line) => splitLine(line, d).length);
    const first = counts[0] ?? 1;
    // The right separator splits every line into the same number of fields.
    const steady = counts.filter((c) => c === first).length;
    const score = first > 1 ? steady * 10 + first : 0;
    if (score > bestScore) {
      best = d;
      bestScore = score;
    }
  }
  return best;
}

function splitLine(line: string, d: string): string[] {
  return parse(line, d)[0] ?? [];
}

/**
 * Parses CSV/TSV with quoted fields ("a, b", "say ""hi""", line breaks
 * inside quotes). Blank lines are skipped.
 */
export function parse(text: string, delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;
  if (text.charCodeAt(0) === 0xfeff) i = 1; // byte order mark
  const endRow = () => {
    row.push(field);
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
    field = '';
  };
  for (; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === '') {
      quoted = true;
    } else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      endRow();
    } else field += c;
  }
  if (field !== '' || row.length) endRow();
  return rows;
}

function quote(value: string, delimiter: string): string {
  return /["\r\n]/.test(value) || value.includes(delimiter) || /^\s|\s$/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * A value that a spreadsheet would run as a formula (=, +, -, @ at the start)
 * gets a leading apostrophe, which spreadsheets read as "this is text", so a
 * shared file can't carry a formula that runs when it's opened. Numbers
 * like -3 are left as they are.
 */
export function guardCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) && !/^[+-]?\d[\d.,\s]*%?$/.test(value) ? `'${value}` : value;
}

/** Undoes `guardCell` for values read from a spreadsheet. */
export function unguardCell(value: string): string {
  return /^'[=+\-@\t\r]/.test(value) ? value.slice(1) : value;
}

/** Rows of text as CSV (comma) or TSV (tab, for the clipboard). */
export function stringify(rows: string[][], delimiter = ','): string {
  return rows.map((r) => r.map((v) => quote(v, delimiter)).join(delimiter)).join('\r\n');
}
