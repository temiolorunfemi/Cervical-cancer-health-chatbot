/**
 * The Flutter client sends the *displayed option text* the user tapped (e.g. "26-30",
 * "Yes", "Positive") rather than a stable option key/index, and that text is already
 * translated into whichever of the app's four languages (en/es/sw/yo) is active. These
 * helpers turn that free-text answer back into a value the scoring engine can reason
 * about, independent of language.
 *
 * This is a known tradeoff of the current client contract (see backend/README.md,
 * "Design choices and tradeoffs") — sending a stable option index instead would remove
 * the need for this parsing layer entirely.
 */

const YES_WORDS = ['yes', 'sí', 'si', 'ndiyo', 'bẹ́ẹ̀ni', 'beeni', 'ẹbẹẹni'];
const NO_WORDS = ['no', 'hapana', 'rárá', 'rara'];
const POSITIVE_WORDS = ['positive', 'positivo', 'chanya', 'rere'];
const NEGATIVE_WORDS = ['negative', 'negativo', 'hasi', 'kò sí àrùn', 'ko si arun'];
const ABNORMAL_WORDS = ['abnormal', 'anormal', 'isiyo ya kawaida', 'àìdáa', 'aidaa'];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

export function isAnswered(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** True/false for a yes/no style question, in any of the app's supported languages. */
export function parseYesNo(value: unknown): boolean {
  if (!isAnswered(value)) return false;
  const v = normalize(value);
  return YES_WORDS.some((w) => v === normalize(w) || v.includes(normalize(w)));
}

export function parseNo(value: unknown): boolean {
  if (!isAnswered(value)) return false;
  const v = normalize(value);
  return NO_WORDS.some((w) => v === normalize(w));
}

export type TestResult = 'positive' | 'negative' | 'abnormal' | 'unknown';

/** Positive / Negative / Abnormal / Not performed, in any supported language. */
export function parseTestResult(value: unknown): TestResult {
  if (!isAnswered(value)) return 'unknown';
  const v = normalize(value);
  if (POSITIVE_WORDS.some((w) => v.includes(normalize(w)))) return 'positive';
  if (ABNORMAL_WORDS.some((w) => v.includes(normalize(w)))) return 'abnormal';
  if (NEGATIVE_WORDS.some((w) => v.includes(normalize(w)))) return 'negative';
  return 'unknown';
}

/**
 * Bucketed numeric options ("26-30", "Under 20", "More than 10", "4 or more", "0") are
 * collapsed to a single representative number — the midpoint of a range, or the bound
 * itself for open-ended options. This intentionally loses precision in exchange for a
 * language-independent, dependency-free parse; see README for the tradeoff discussion.
 */
export function parseNumericBucket(value: unknown): number {
  if (!isAnswered(value)) return 0;
  const numbers = (value.match(/\d+(\.\d+)?/g) ?? []).map(Number);
  if (numbers.length === 0) return 0;
  if (numbers.length >= 2) return (numbers[0] + numbers[1]) / 2;

  const v = normalize(value);
  const n = numbers[0];
  if (v.includes('under') || v.includes('less than')) return Math.max(0, n - 1);
  if (v.includes('over') || v.includes('more than') || v.includes('or more')) return n + 1;
  return n;
}
