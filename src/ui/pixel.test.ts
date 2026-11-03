import { describe, expect, it } from 'vitest';
import { ITEM_ORDER } from '../data/items';
import { MACHINE_LIST } from '../data/machines';
import { PIXEL_FIXED, PIXEL_GLYPHS, PIXEL_ITEM_ART, PIXEL_TEMPLATES, crispSize } from './pixel';

const SHADES = 'odmlh';

describe('crisp icon sizes', () => {
  it('draws every cell as a whole number of screen pixels', () => {
    for (const dpr of [1, 1.5, 2, 2.625, 2.75, 3]) {
      for (const size of [16, 20, 24, 28, 32, 40, 44, 48, 64]) {
        const cell = (crispSize(size, dpr) * dpr) / 16;
        expect(Math.abs(cell - Math.round(cell)), `${size}px at ${dpr}x`).toBeLessThan(1e-9);
        // and stays near what was asked for
        expect(Math.abs(crispSize(size, dpr) - size)).toBeLessThanOrEqual(8 / dpr + 1e-9);
      }
    }
  });

  it('leaves sizes that are already whole cells alone', () => {
    expect(crispSize(32, 1)).toBe(32);
    expect(crispSize(24, 2)).toBe(24);
    expect(crispSize(16, 3)).toBe(16);
  });
});

describe('pixel art', () => {
  it('draws every template on a 16x16 grid with known letters', () => {
    const known = new Set(['.', ...SHADES, ...Object.keys(PIXEL_FIXED)]);
    for (const [name, rows] of Object.entries(PIXEL_TEMPLATES)) {
      expect(rows.length, name).toBe(16);
      rows.forEach((row, y) => {
        expect(row.length, `${name} row ${y}: "${row}"`).toBe(16);
        for (const ch of row) expect(known.has(ch), `${name} row ${y}: '${ch}'`).toBe(true);
      });
    }
  });

  it('draws every machine glyph on a 10x10 grid', () => {
    for (const [name, rows] of Object.entries(PIXEL_GLYPHS)) {
      expect(rows.length, name).toBe(10);
      rows.forEach((row, y) => {
        expect(row.length, `${name} row ${y}: "${row}"`).toBe(10);
        expect(/^[.#+]+$/.test(row), `${name} row ${y}`).toBe(true);
      });
    }
  });

  it('has art for every item and every machine category', () => {
    for (const id of ITEM_ORDER) {
      expect(PIXEL_ITEM_ART[id], id).toBeDefined();
      for (const [t] of PIXEL_ITEM_ART[id]) expect(PIXEL_TEMPLATES[t], `${id} uses ${t}`).toBeDefined();
    }
    for (const m of MACHINE_LIST) expect(PIXEL_GLYPHS[m.categories[0]], m.id).toBeDefined();
  });
});
