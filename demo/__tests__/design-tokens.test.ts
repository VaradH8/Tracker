import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chart, palette } from "@/lib/design-tokens";

/**
 * Guards for the design system (docs/design-system.md): text colours meet
 * WCAG AA contrast, and components use tokens rather than one-off values.
 */

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const { brand, ink, white } = palette;
const SURFACES = { white, "ink-50": ink[50], "ink-100": ink[100] };
const AA = 4.5;

describe("text colours meet WCAG AA (4.5:1)", () => {
  const textTokens = {
    "ink-900": ink[900],
    "ink-800": ink[800],
    "ink-700": ink[700],
    "ink-600": ink[600],
    "ink-500": ink[500],
    "ink-400": ink[400],
    blueText: brand.blueText,
    redText: brand.redText,
    yellowText: brand.yellowText,
    greenText: brand.greenText,
  };

  for (const [name, fg] of Object.entries(textTokens)) {
    for (const [surface, bg] of Object.entries(SURFACES)) {
      it(`${name} on ${surface}`, () => {
        expect(contrast(fg, bg)).toBeGreaterThanOrEqual(AA);
      });
    }
  }

  it.each([
    ["blueText on blueBg (pill-blue)", brand.blueText, brand.blueBg],
    ["redText on redBg (pill-red)", brand.redText, brand.redBg],
    ["yellowText on yellowBg (pill-yellow)", brand.yellowText, brand.yellowBg],
    ["greenText on greenBg (pill-green)", brand.greenText, brand.greenBg],
    ["white on blue (primary button)", white, brand.blue],
    ["white on redText (danger button, Admin avatar)", white, brand.redText],
    ["white on redHover (danger button hover)", white, brand.redHover],
    ["white on greenText (Developer avatar)", white, brand.greenText],
    ["white on yellowText (BD avatar)", white, brand.yellowText],
    ["chart labels (muted) on white", chart.muted, white],
    ["chart late label (criticalText) on white", chart.criticalText, white],
  ])("%s", (_name, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(AA);
  });

  it("documents why ink-300 is decorative only", () => {
    expect(contrast(ink[300], white)).toBeLessThan(AA);
  });
});

describe("components use tokens, not one-off values", () => {
  // readdirSync({ recursive }) rather than fs.globSync: CI and the
  // production image run Node 20, and globSync only arrived in Node 22.
  const tsxUnder = (dir: string) =>
    (readdirSync(dir, { recursive: true }) as string[])
      .filter((f) => f.endsWith(".tsx"))
      .map((f) => join(dir, f));
  const files = [...tsxUnder("app"), ...tsxUnder("components")];
  const offenders = (re: RegExp) =>
    files.flatMap((f) =>
      readFileSync(f, "utf8")
        .split("\n")
        .flatMap((line, i) => (re.test(line) ? [`${f}:${i + 1}: ${line.trim()}`] : [])),
    );

  it("no hex colour literals (use lib/design-tokens.ts)", () => {
    expect(offenders(/["'`]#[0-9a-fA-F]{3,8}\b/)).toEqual([]);
  });

  it("no text below 12px", () => {
    expect(offenders(/text-\[(\d|1[01])(\.\d+)?px\]|fontSize=\{(\d|1[01])(\.\d+)?\}/)).toEqual([]);
  });

  it("every ink-N class names a shade that exists", () => {
    const defined = new Set(Object.keys(ink));
    const unknown = files.flatMap((f) =>
      [...readFileSync(f, "utf8").matchAll(/(?<![\w])(?:[a-z]+-)+ink-(\d+)(?![\w-])/g)]
        .filter((m) => !defined.has(m[1]))
        .map((m) => `${f}: ${m[0]}`),
    );
    expect(unknown).toEqual([]);
  });

  it("no bright brand colours or ink-300 used as text (use the *Text shades / ink-400+)", () => {
    expect(
      offenders(/(?<![\w-])text-(brand-(blue|red|yellow|green)|ink-300)(?![\w-])/),
    ).toEqual([]);
  });
});
