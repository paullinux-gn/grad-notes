/**
 * Course grades from assignment scores. With category weights ("Exams 60%,
 * Homework 40%") each category's average counts by its weight, spread over
 * the categories that have grades so far; without weights the grade is
 * total points earned over points possible.
 */

import type { Assignment, Course } from './types';

export interface CategoryGrade {
  name: string;
  /** Percent of the course grade (null: the course has no weights). */
  weight: number | null;
  /** Average so far, 0–100 (null until something is graded). */
  percent: number | null;
  earned: number;
  possible: number;
  graded: number;
  /** Graded, but in a category the weights leave out. */
  uncounted: boolean;
}

export interface CourseGrade {
  /** 0–100, or null until something is graded. */
  percent: number | null;
  letter: string;
  categories: CategoryGrade[];
  graded: number;
  weighted: boolean;
}

/** Graded: has a score and something to score out of. */
export const isGraded = (a: Assignment) => a.score !== null && a.maxScore !== null && a.maxScore > 0;

/** Score as a percentage (an extra-credit score can pass 100). */
export const scorePercent = (a: Assignment) => (isGraded(a) ? (a.score! / a.maxScore!) * 100 : null);

const LETTERS: [number, string][] = [
  [93, 'A'],
  [90, 'A−'],
  [87, 'B+'],
  [83, 'B'],
  [80, 'B−'],
  [77, 'C+'],
  [73, 'C'],
  [70, 'C−'],
  [67, 'D+'],
  [63, 'D'],
  [60, 'D−'],
];

export function letterGrade(percent: number | null): string {
  if (percent === null) return '';
  return LETTERS.find(([min]) => percent >= min - 1e-9)?.[1] ?? 'F';
}

/** "92.5%", "100%". */
export function formatPercent(p: number | null): string {
  if (p === null) return '—';
  const r = Math.round(p * 10) / 10;
  return `${Number.isInteger(r) ? r : r.toFixed(1)}%`;
}

/** "18.5", "20". */
export const formatPoints = (n: number) => String(Math.round(n * 100) / 100);

export function courseGrade(course: Course, assignments: Assignment[]): CourseGrade {
  const mine = assignments.filter((a) => a.courseId === course.id && !a.deletedAt);
  const weights = course.weights ?? {};
  const weighted = Object.keys(weights).length > 0;

  const byName = new Map<string, CategoryGrade>();
  const category = (name: string) => {
    let c = byName.get(name);
    if (!c) {
      const w = weights[name];
      c = { name, weight: weighted ? (w ?? null) : null, percent: null, earned: 0, possible: 0, graded: 0, uncounted: false };
      byName.set(name, c);
    }
    return c;
  };
  // Weighted categories show even before anything in them is graded.
  for (const name of Object.keys(weights)) category(name);
  for (const a of mine) {
    if (!isGraded(a)) continue;
    const c = category(a.category || (weighted ? 'Other' : ''));
    c.earned += a.score!;
    c.possible += a.maxScore!;
    c.graded++;
  }
  for (const c of byName.values()) {
    c.percent = c.possible > 0 ? (c.earned / c.possible) * 100 : null;
    c.uncounted = weighted && c.graded > 0 && !(c.name in weights);
  }

  const categories = [...byName.values()]
    .filter((c) => c.name || c.graded)
    .sort((a, b) => (b.weight ?? -1) - (a.weight ?? -1) || a.name.localeCompare(b.name));
  const graded = mine.filter(isGraded).length;

  let percent: number | null = null;
  if (weighted) {
    let total = 0;
    let weight = 0;
    for (const c of byName.values()) {
      const w = weights[c.name];
      if (c.percent === null || !w) continue;
      total += c.percent * w;
      weight += w;
    }
    percent = weight > 0 ? total / weight : null;
  } else {
    let earned = 0;
    let possible = 0;
    for (const c of byName.values()) {
      earned += c.earned;
      possible += c.possible;
    }
    percent = possible > 0 ? (earned / possible) * 100 : null;
  }
  return { percent, letter: letterGrade(percent), categories, graded, weighted };
}

/** Category names a course uses: its weights first, then any others in use. */
export function courseCategories(course: Course | undefined, assignments: Assignment[]): string[] {
  const names = new Set(Object.keys(course?.weights ?? {}));
  for (const a of assignments) if (course && a.courseId === course.id && a.category && !a.deletedAt) names.add(a.category);
  return [...names];
}
