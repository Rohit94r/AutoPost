import { countHashtags, validateText, type Platform, type ValidationIssue } from "@/lib/platforms";

/**
 * ContentQualityChecker — deterministic checks run on every AI output (server) and live in the
 * editor (client). These are heuristics: they flag, they never silently rewrite.
 */
export const CLICHES = [
  "i'm thrilled to announce",
  "i am thrilled to announce",
  "i'm excited to announce",
  "i am excited to share",
  "i'm humbled",
  "humbled and honored",
  "game-changer",
  "game changer",
  "in today's fast-paced world",
  "in today's digital age",
  "unlock your potential",
  "take it to the next level",
  "synergy",
  "leverage",
  "delve into",
  "embark on a journey",
  "a testament to",
  "never stop learning",
  "the sky is the limit",
  "stay tuned",
  "without further ado",
  "rest is history",
  "tapestry",
  "revolutionize",
];

const EMOJI_RE = /\p{Extended_Pictographic}/gu;
const NUMBER_RE = /\b\d[\d,.:/-]*\b/g;

export interface QualityInput {
  text: string;
  platform: Platform;
  /** Text the output must be grounded in (idea, reviewed facts, original draft). */
  sourceText?: string;
  avoidPhrases?: string[];
  emoji?: "none" | "minimal" | "moderate";
  hashtags?: "none" | "minimal" | "moderate" | "generous";
  mediaCount?: number;
  xMaxLength?: number;
}

export interface QualityReport {
  issues: ValidationIssue[];
  unsupportedNumbers: string[];
}

export function checkQuality(input: QualityInput): QualityReport {
  const issues: ValidationIssue[] = [...validateText(input.platform, input.text, { mediaCount: input.mediaCount, xMaxLength: input.xMaxLength })];
  const lower = input.text.toLowerCase();

  for (const phrase of CLICHES) {
    if (lower.includes(phrase)) issues.push({ level: "warning", code: "cliche", message: `Generic phrase: "${phrase}".` });
  }
  for (const phrase of input.avoidPhrases ?? []) {
    if (phrase.trim() && lower.includes(phrase.trim().toLowerCase())) {
      issues.push({ level: "warning", code: "avoided_phrase", message: `Uses a phrase on your avoid list: "${phrase}".` });
    }
  }

  const emojis = (input.text.match(EMOJI_RE) ?? []).length;
  const emojiMax = { none: 0, minimal: 2, moderate: 6 }[input.emoji ?? "moderate"];
  if (emojis > emojiMax) issues.push({ level: "warning", code: "emoji", message: `${emojis} emojis exceeds your "${input.emoji}" preference.` });

  const tags = countHashtags(input.text);
  const tagMax = { none: 0, minimal: 3, moderate: 6, generous: 30 }[input.hashtags ?? "generous"];
  if (tags > tagMax) issues.push({ level: "warning", code: "hashtags", message: `${tags} hashtags exceeds your "${input.hashtags}" preference.` });

  const exclamations = (input.text.match(/!/g) ?? []).length;
  if (exclamations > 3) issues.push({ level: "warning", code: "exclamations", message: "Lots of exclamation marks can read as forced." });

  const openings = input.text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim().split(/\s+/).slice(0, 2).join(" ").toLowerCase())
    .filter((s) => s.length > 2);
  const repeated = openings.find((o, i) => openings.indexOf(o) !== i && openings.filter((x) => x === o).length >= 3);
  if (repeated) issues.push({ level: "warning", code: "repetitive", message: `Several sentences start with "${repeated}".` });

  const unsupportedNumbers = input.sourceText !== undefined ? findUnsupportedNumbers(input.text, input.sourceText) : [];
  if (unsupportedNumbers.length) {
    issues.push({
      level: "warning",
      code: "unsupported_claim",
      message: `Check these figures. They don't appear in your source: ${unsupportedNumbers.join(", ")}.`,
    });
  }
  return { issues, unsupportedNumbers };
}

/** Numbers/dates in the output that are absent from the source — a cheap fabrication detector. */
export function findUnsupportedNumbers(output: string, source: string): string[] {
  const norm = (s: string) => s.replace(/[,]/g, "").replace(/[.:/-]+$/, "");
  const sourceNums = new Set((source.match(NUMBER_RE) ?? []).map(norm));
  const sourceDigits = source.replace(/\D/g, " ");
  const out = new Set<string>();
  for (const raw of output.match(NUMBER_RE) ?? []) {
    const n = norm(raw);
    if (!n || n.length < 1) continue;
    if (/^[1-9]$/.test(n)) continue; // small counts ("3 lessons") are usually structural
    if (sourceNums.has(n) || sourceDigits.includes(` ${n} `) || source.includes(n)) continue;
    out.add(raw);
  }
  return [...out];
}
