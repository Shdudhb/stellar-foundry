import { describe, expect, it } from 'vitest';
import { ITEM_ORDER } from '../data/items';
import { MACHINE_LIST } from '../data/machines';
import { PIXEL_FIXED, PIXEL_GLYPHS, PIXEL_ITEM_ART, PIXEL_TEMPLATES } from './pixel';

const SHADES = 'odmlh';

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
