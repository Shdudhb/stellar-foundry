// Vite plugin: the game's two fonts, with matched vertical metrics.
//
// Oxanium (Latin, digits) and Noto Sans TC (Chinese) report very different ascents and descents
// (0.79/0.21 vs 1.16/0.29 of the em), so a line of digits and a line of Chinese got different boxes, and
// icons centred beside them sat high or low depending on the text. Both faces are declared here with the
// same ascent/descent overrides, so every line box centres the same way.
//
// The Chinese font is also cut down to the characters the game actually shows.
//
// The full font comes in ~108 unicode-range slices (4 MB). The game's ~900 Chinese characters are spread
// over 34 of them, so a browser would fetch ~1.9 MB to draw them. Instead, each of those slices is subset
// to just the game's characters (~330 KB in all, every weight kept) and written to src/generated/, which
// main.tsx imports. It runs when the dev server or a build starts, and again in dev when source text
// gains a new character, so new text never needs a manual step.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import subsetFont from 'subset-font';
import type { Plugin } from 'vite';

export const CJK_FAMILY = 'Noto Sans TC Game';
export const LATIN_FAMILY = 'Oxanium Game';
const SOURCE = 'node_modules/@fontsource-variable/noto-sans-tc';
const LATIN_SOURCE = 'node_modules/@fontsource-variable/oxanium';
const OUT = 'src/generated/cjk-font';
/** Shared line metrics: the CJK ideographic em box (top 0.88, bottom −0.12), so Chinese sits centred */
const METRICS = '  ascent-override: 88%;\n  descent-override: 12%;\n  line-gap-override: 0%;\n';

/** Every character from U+2000 up in the game's source: CJK text and punctuation, arrows, symbols */
function gameChars(root: string): string {
  const chars = new Set<string>();
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== 'generated') walk(p);
      } else if (/\.(ts|tsx|css)$/.test(e.name) && !/\.test\./.test(e.name)) {
        for (const c of fs.readFileSync(p, 'utf8')) if (c.codePointAt(0)! >= 0x2000) chars.add(c);
      }
    }
  };
  walk(path.join(root, 'src'));
  for (const c of fs.readFileSync(path.join(root, 'index.html'), 'utf8')) if (c.codePointAt(0)! >= 0x2000) chars.add(c);
  return [...chars].sort().join('');
}

/** "U+4E00,U+4E09-4E0B": codepoints folded into runs */
function unicodeRange(chars: string): string {
  const cps = [...chars].map((c) => c.codePointAt(0)!).sort((a, b) => a - b);
  const runs: string[] = [];
  for (let i = 0; i < cps.length; i++) {
    let j = i;
    while (j + 1 < cps.length && cps[j + 1] === cps[j] + 1) j++;
    const hex = (n: number) => n.toString(16).toUpperCase();
    runs.push(i === j ? `U+${hex(cps[i])}` : `U+${hex(cps[i])}-${hex(cps[j])}`);
    i = j;
  }
  return runs.join(',');
}

/** Glyphs in an sfnt font, from its maxp table; 1 means only the .notdef box */
function glyphCount(sfnt: Buffer): number {
  const tables = sfnt.readUInt16BE(4);
  for (let i = 0; i < tables; i++) {
    const rec = 12 + i * 16;
    if (sfnt.toString('latin1', rec, rec + 4) === 'maxp') return sfnt.readUInt16BE(sfnt.readUInt32BE(rec + 8) + 4);
  }
  return 0;
}

async function generate(root: string): Promise<void> {
  const chars = gameChars(root);
  const sourceCss = fs.readFileSync(path.join(root, SOURCE, 'index.css'), 'utf8');
  const latinCss = fs.readFileSync(path.join(root, LATIN_SOURCE, 'index.css'), 'utf8');
  const out = path.join(root, OUT);
  const key = createHash('sha1').update(chars).update(sourceCss).update(latinCss).update(METRICS).update('skip-empty').digest('hex');
  const keyFile = path.join(out, 'key');
  if (fs.existsSync(keyFile) && fs.readFileSync(keyFile, 'utf8') === key) return;

  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const faces: string[] = [];
  let bytes = 0;
  // Oxanium as published, under its own family name with the shared metrics
  for (const m of latinCss.matchAll(/url\(\.\/files\/([^)]+\.woff2)\)[\s\S]*?unicode-range: ([^;]+);/g)) {
    fs.copyFileSync(path.join(root, LATIN_SOURCE, 'files', m[1]), path.join(out, m[1]));
    faces.push(
      `@font-face {\n  font-family: '${LATIN_FAMILY}';\n  font-style: normal;\n  font-display: swap;\n  font-weight: 200 800;\n` +
        `  src: url(./${m[1]}) format('woff2-variations');\n${METRICS}  unicode-range: ${m[2]};\n}`,
    );
  }
  for (const m of sourceCss.matchAll(/url\(\.\/files\/([^)]+\.woff2)\)[\s\S]*?unicode-range: ([^;]+);/g)) {
    const ranges = m[2].split(',').map((r) => r.trim().slice(2).split('-').map((x) => parseInt(x, 16)));
    const mine = [...chars].filter((c) => {
      const cp = c.codePointAt(0)!;
      return ranges.some(([a, b = a]) => cp >= a && cp <= b);
    }).join('');
    if (!mine) continue;
    const source = fs.readFileSync(path.join(root, SOURCE, 'files', m[1]));
    // A slice can claim a codepoint it has no glyph for (✦): a subset of only those is an empty font,
    // which browsers refuse to decode. Leave it out, and the next font in the stack draws the character
    if (glyphCount(await subsetFont(source, mine, { targetFormat: 'sfnt' })) <= 1) continue;
    const font = await subsetFont(source, mine, { targetFormat: 'woff2' });
    const file = `cjk-${faces.length}.woff2`;
    fs.writeFileSync(path.join(out, file), font);
    bytes += font.length;
    faces.push(
      `@font-face {\n  font-family: '${CJK_FAMILY}';\n  font-style: normal;\n  font-display: swap;\n  font-weight: 100 900;\n` +
        `  src: url(./${file}) format('woff2-variations');\n${METRICS}  unicode-range: ${unicodeRange(mine)};\n}`,
    );
  }
  fs.writeFileSync(path.join(out, 'fonts.css'), `/* Generated by scripts/cjk-font.ts: do not edit */\n${faces.join('\n')}\n`);
  fs.writeFileSync(keyFile, key);
  console.log(`[cjk-font] ${[...chars].length} characters → ${faces.length} files, ${Math.round(bytes / 1024)} KB`);
}

export function cjkFont(): Plugin {
  let root = process.cwd();
  return {
    name: 'cjk-font-subset',
    configResolved(config) {
      root = config.root;
    },
    async buildStart() {
      // Tests never load the page, so they skip the work
      if (!process.env.VITEST) await generate(root);
    },
    async handleHotUpdate({ file }) {
      if (/[\\/]src[\\/]/.test(file) && !/[\\/]generated[\\/]/.test(file) && /\.(ts|tsx|css)$/.test(file)) await generate(root);
    },
  };
}
