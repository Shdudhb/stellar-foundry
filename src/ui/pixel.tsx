import { ITEMS } from '../data/items';
import { MACHINES } from '../data/machines';

/**
 * Original 16x16 pixel art, drawn as character maps and rendered to crisp SVG.
 *
 * Shade letters take their colour from the layer's base colour:
 *   o outline · d dark · m mid · l light · h highlight
 * Fixed letters are the same in every icon:
 *   k stone outline · S stone dark · s stone · t stone light · w glass · W glass edge · x near-black · y warm yellow
 * '.' is transparent. An icon is a stack of layers; later layers paint over earlier ones.
 */

type Rows = string[];
type Layer = [template: string, color: string];

// ---------- colour ----------

function mix(hex: string, to: string, t: number): string {
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt(to.slice(1), 16);
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}

const FIXED: Record<string, string> = {
  k: '#1b1d22', S: '#4a4d55', s: '#6c707a', t: '#9097a2',
  w: '#d6eef7', W: '#7fa3b5', x: '#121417', y: '#ffd35a',
};

function shades(c: string): Record<string, string> {
  return { o: mix(c, '#000000', 0.68), d: mix(c, '#000000', 0.32), m: c, l: mix(c, '#ffffff', 0.3), h: mix(c, '#ffffff', 0.62) };
}

// ---------- procedural shapes ----------

/** Shade a filled shape: outline on the rim, lit from the top left */
function solid(inside: (x: number, y: number) => boolean, light = 1): Rows {
  const rows: Rows = [];
  for (let y = 0; y < 16; y++) {
    let row = '';
    for (let x = 0; x < 16; x++) {
      if (!inside(x, y)) {
        row += '.';
        continue;
      }
      const rim = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
      if (rim) {
        row += 'o';
        continue;
      }
      const t = ((x - 7.5) + (y - 7.5)) / 15 / light;
      row += t < -0.42 ? 'h' : t < -0.16 ? 'l' : t < 0.22 ? 'm' : 'd';
    }
    rows.push(row);
  }
  return rows;
}

const disc = (cx: number, cy: number, r: number) => (x: number, y: number) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

function gear(): Rows {
  return solid((x, y) => {
    const dx = x - 7.5;
    const dy = y - 7.5;
    const r = Math.hypot(dx, dy);
    if (r < 2.1) return false;
    const a = Math.atan2(dy, dx);
    const tooth = Math.cos(a * 8) > 0.25;
    return r <= (tooth ? 7.6 : 5.8);
  });
}

function hexagon(): Rows {
  return solid((x, y) => {
    const dx = Math.abs(x - 7.5);
    const dy = Math.abs(y - 7.5);
    return dy <= 7 && dx <= 6.6 && dx * 0.55 + dy <= 8.2;
  });
}

// ---------- hand-drawn templates ----------

const T: Record<string, Rows> = {
  rock: [
    '................',
    '......oooo......',
    '....oolllloo....',
    '...olllmmmmdo...',
    '..ollmmmmmmmdo..',
    '..olmmmmlmmmddo.',
    '.olmmmmmmmmmmdo.',
    '.olmmmdmmmmmmdo.',
    '.ommmmmmmmlmmddo',
    '.ommmmmmmmmmmddo',
    '.odmmmlmmmmmddo.',
    '..odmmmmmmdddo..',
    '..oddmmmddddo...',
    '...ooddddooo....',
    '.....oooo.......',
    '................',
  ],
  stone: [
    '................',
    '......kkkk......',
    '....kkttttkk....',
    '...ktttssssSk...',
    '..kttssssssSSk..',
    '..ktsssstsssSSk.',
    '.ktssssssssssSk.',
    '.ktsssSssssssSk.',
    '.ksssssssstssSSk',
    '.kssssssssssssSk',
    '.kSssstsssssSSk.',
    '..kSssssssSSSk..',
    '..kSSsssSSSSk...',
    '...kkSSSSkkk....',
    '.....kkkk.......',
    '................',
  ],
  flecks: [
    '................',
    '................',
    '................',
    '......lm........',
    '......md........',
    '...lm....lm.....',
    '...md....md.....',
    '................',
    '......lm...lm...',
    '......md...md...',
    '................',
    '....lm..lm......',
    '....md..md......',
    '................',
    '................',
    '................',
  ],
  ingot: [
    '................',
    '................',
    '................',
    '................',
    '................',
    '....oooooooo....',
    '...ohhhhhhhlo...',
    '..ohllllllllmo..',
    '.ohlmmmmmmmmmdo.',
    '.olmmmmmmmmmmdo.',
    '.oddddddddddddo.',
    '.oooooooooooooo.',
    '................',
    '................',
    '................',
    '................',
  ],
  glow: [
    '................',
    '.....h...h......',
    '...h...h....h...',
    '....l.h..l......',
    '.......l........',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '..l..........l..',
    '.h.l........l.h.',
    '................',
    '................',
  ],
  dust: [
    '................',
    '................',
    '................',
    '.......l........',
    '..m.........l...',
    '.....l..........',
    '......oooo......',
    '.....ohllmo.....',
    '....ohlmmmmo....',
    '...ohlmmmmmdo...',
    '..ohlmmmmmmmdo..',
    '.olmmmmmlmmmmdo.',
    '.odmmmmmmmmmddo.',
    '.oddddddddddddo.',
    '.oooooooooooooo.',
    '................',
  ],
  brick: [
    '................',
    '................',
    '.oooooooooooooo.',
    '.ohhhhhhohhhhlo.',
    '.olmmmmmolmmmdo.',
    '.odddddddoddddo.',
    '.oooooooooooooo.',
    '.ohhhohhhhhhhlo.',
    '.olmmolmmmmmmdo.',
    '.oddddoddddddo..',
    '.oooooooooooooo.',
    '.ohhhhhhohhhhlo.',
    '.olmmmmmolmmmdo.',
    '.oddddddodddddo.',
    '.oooooooooooooo.',
    '................',
  ],
  plate: [
    '................',
    '................',
    '................',
    '.......oooooo...',
    '.....oohhhhhho..',
    '...oohhllllllo..',
    '.oohhlllllllmo..',
    '.ohllllllllmmo..',
    '.olllllllmmmdo..',
    '.olllllmmmmddo..',
    '.olllmmmmmddoo..',
    '.olmmmmmdddo....',
    '.odmmmdddoo.....',
    '.odddddoo.......',
    '.ooooooo........',
    '................',
  ],
  coil: [
    '................',
    '....oooooooo....',
    '...odddddddddo..',
    '...oxxxxxxxxxo..',
    '...ohlhlhlhlmo..',
    '...olmlmlmlmdo..',
    '...ohlhlhlhlmo..',
    '...olmlmlmlmdo..',
    '...ohlhlhlhlmo..',
    '...olmlmlmlmdo..',
    '...ohlhlhlhlmo..',
    '...olmlmlmlmdo..',
    '...oxxxxxxxxxo..',
    '...odddddddddo..',
    '....oooooooo....',
    '................',
  ],
  cell: [
    '......oooo......',
    '.....oddddo.....',
    '.....oooooo.....',
    '....oWwwwwWo....',
    '...oWw....wWo...',
    '...oW......Wo...',
    '...oW......Wo...',
    '...oWhhhhhhWo...',
    '...oWlmmmmmWo...',
    '...oWlmmmmmWo...',
    '...oWmmmmmdWo...',
    '...oWmmmmddWo...',
    '...oWmmdddddo...',
    '....oWdddddo....',
    '.....oooooo.....',
    '................',
  ],
  gascell: [
    '......oooo......',
    '.....oddddo.....',
    '.....oooooo.....',
    '....oWwwwwWo....',
    '...oWhlllllWo...',
    '...oWlmhmmlWo...',
    '...oWlmmmlmWo...',
    '...oWmlhmmmWo...',
    '...oWmmmmhlWo...',
    '...oWlmmmmmWo...',
    '...oWmmhlmmWo...',
    '...oWmmmmmdWo...',
    '...oWmdmmdddo...',
    '....oWdddddo....',
    '.....oooooo.....',
    '................',
  ],
  crystal: [
    '................',
    '.......oo.......',
    '......ohlo......',
    '.....ohhlmo.....',
    '..oo.ohllmo.....',
    '.ohlo.ohlmdo.oo.',
    '.ohlmoohlmdoohlo',
    '.ohlmdohlmmdhlmo',
    '.ohlmdohlmmdhlmo',
    '.ohlmdohlmmdhmdo',
    '..olmdohlmmdlmdo',
    '..olmddolmmddmo.',
    '...olmdolmmddo..',
    '....ooooooooo...',
    '................',
    '................',
  ],
  chip: [
    '................',
    '...l..l..l..l...',
    '...l..l..l..l...',
    '..oooooooooooo..',
    'lloxxxxxxxxxxoll',
    '..oxhhhhhhhhxo..',
    '..oxhmmmmmmlxo..',
    'lloxhmyyyymlxoll',
    '..oxhmyyyymlxo..',
    '..oxhmmmmmmlxo..',
    'lloxllllllllxoll',
    '..oxxxxxxxxxxo..',
    '..oooooooooooo..',
    '...l..l..l..l...',
    '...l..l..l..l...',
    '................',
  ],
  board: [
    '................',
    '................',
    '.oooooooooooooo.',
    '.ollllllllllllo.',
    '.olmmyymmmmmmdo.',
    '.olmmmymmyyymdo.',
    '.olxxmymmmmymdo.',
    '.olxxmyyyymymdo.',
    '.olmmmmmmmmymdo.',
    '.olmyyyymmmmmdo.',
    '.olmmmmymxxxmdo.',
    '.olmmmmymxxxmdo.',
    '.oddddddddddddo.',
    '.oooooooooooooo.',
    '................',
    '................',
  ],
  flask: [
    '................',
    '......oooo......',
    '......oyyo......',
    '......oooo......',
    '......oWwo......',
    '......oWwo......',
    '.....oWw.Wo.....',
    '....oWw...Wo....',
    '...oWhhhhhhWo...',
    '...oWlmmmmmWo...',
    '..oWlmmmmmmdWo..',
    '..oWlmmmmmddWo..',
    '..oWmmmmmdddWo..',
    '..oWdddddddddo..',
    '...oooooooooo...',
    '................',
  ],
  bolt: [
    '................',
    '.........oooo...',
    '........ohhlo...',
    '.......ohhlo....',
    '......ohhlo.....',
    '.....ohhlo......',
    '....ohhlooooo...',
    '...ohhhhhhllo...',
    '...oooooohlo....',
    '.......ohlo.....',
    '......ohlo......',
    '.....ohmo.......',
    '....omdo........',
    '...omdo.........',
    '...ooo..........',
    '................',
  ],
  cloud: [
    '................',
    '................',
    '................',
    '......oooo......',
    '.....ohhhho.....',
    '..ooohhhlllooo..',
    '.ohhhhhlllllhho.',
    'ohhhhlllllllllmo',
    'ohllllllllllmmmo',
    'olllllllllmmmmdo',
    '.ommmmmmmmmmddo.',
    '..oooooooooooo..',
    '................',
    '...l....l....l..',
    '....l....l......',
    '................',
  ],
  lift: [
    '.......oo.......',
    '......ohlo......',
    '.....ohhlmo.....',
    '.....ohllmo.....',
    '.....olwwmo.....',
    '.....olwWmo.....',
    '.....ollmmo.....',
    '....oolllmdo....',
    '...omolllmdomo..',
    '..ommolllmdommo.',
    '..omoolllmdoomo.',
    '..oo.oooooo..oo.',
    '......oyyo......',
    '.....oyyyyo.....',
    '......oyyo......',
    '.......oo.......',
  ],
  rocket: [
    '................',
    '.......oo.......',
    '......ohlo......',
    '.....ohhlmo.....',
    '....ohhllmdo....',
    '....ohlllmdo....',
    '...ohhllllmdo...',
    '...ohlllllmdo...',
    '...oxxxxxxxxo...',
    '...ohlllllmdo...',
    '...ohl.oo.mdo...',
    '...ohlo..omdo...',
    '...ohlo..omdo...',
    '...oooo..oooo...',
    '................',
    '................',
  ],
  canister: [
    '................',
    '...oooo.........',
    '...odho..oooo...',
    '...oooooooddo...',
    '..ohhhhhhhhlmo..',
    '..ohlllllllmdo..',
    '..ohlxxxxxxmdo..',
    '..ohlxyyyyxmdo..',
    '..ohlxyyyyxmdo..',
    '..ohlxxxxxxmdo..',
    '..ohlllllllmdo..',
    '..ohlllllllmdo..',
    '..ommmmmmmmmdo..',
    '..oddddddddddo..',
    '..oooooooooooo..',
    '................',
  ],
  kit: [
    '................',
    '................',
    '.....oooooo.....',
    '.....o....o.....',
    '..oooooooooooo..',
    '.ohhhhhhhhhhhlo.',
    '.ohllllllllllmo.',
    '.ohllllwwllllmo.',
    '.oxxxxxwwxxxxxo.',
    '.ohllllwwllllmo.',
    '.ohlllllllllmmo.',
    '.ommmmmmmmmmmdo.',
    '.oddddddddddddo.',
    '.oooooooooooooo.',
    '................',
    '................',
  ],
  panel: [
    '................',
    '................',
    '.ooooooooooooooo',
    '.ohhlohhlohhlmo.',
    '.ohlmohlmohlmdo.',
    '.oooooooooooooo.',
    '.ohhlohhlohhlmo.',
    '.ohlmohlmohlmdo.',
    '.oooooooooooooo.',
    '.ohhlohhlohhlmo.',
    '.ohlmohlmohlmdo.',
    '.oooooooooooooo.',
    '.......oo.......',
    '.......oo.......',
    '.....oooooo.....',
    '................',
  ],
  ice: [
    '................',
    '................',
    '...oooooooooo...',
    '..ohhhhhhhhhlo..',
    '.ohhhhhhhhhllmo.',
    '.oooooooooooomo.',
    '.ohhhhhhhhhlomo.',
    '.ohwwllllllmomo.',
    '.ohwllllllmmomo.',
    '.ohlllllwlmmomo.',
    '.ohllllwwmmmoo..',
    '.ohlllllmmmmo...',
    '.ommmmmmmmddo...',
    '.oooooooooooo...',
    '................',
    '................',
  ],
  cubes: [
    '................',
    '................',
    '................',
    '.....ooooo......',
    '.....ohhlo......',
    '.....olmdo......',
    '.....ooooo......',
    '..ooooo.ooooo...',
    '..ohhlo.ohhlo...',
    '..olmdo.olmdo...',
    '..ooooo.ooooo...',
    '.......ooooo....',
    '.ooooo.ohhlo....',
    '.ohhlo.olmdo....',
    '.olmdo.ooooo....',
    '.ooooo..........',
  ],
  can: [
    '................',
    '..........oo....',
    '.........oho....',
    '........oho.....',
    '..oooooohoo.....',
    '..ohhhhlmo......',
    '.ohhlllllmo.....',
    '.ohllllllmdo....',
    '.ohlxxxxxmdo....',
    '.ohlxyyyxmdo....',
    '.ohlxxxxxmdo....',
    '.ohlllllmmdo....',
    '.ommmmmmmddo....',
    '.ooooooooooo....',
    '................',
    '................',
  ],
  lattice: [
    '................',
    '..oooooooooooo..',
    '.ohhohhohhohhlo.',
    '.ohlolmolmolmdo.',
    '.ooohooohooohoo.',
    '.ohlolmolmolmdo.',
    '.ohhohhohhohhlo.',
    '.ohlolmolmolmdo.',
    '.ooohooohooohoo.',
    '.ohlolmolmolmdo.',
    '.ohhohhohhohhlo.',
    '.ohlolmolmolmdo.',
    '.ooohooohooohoo.',
    '.ommommommommdo.',
    '..oooooooooooo..',
    '................',
  ],
  sparkle: [
    '................',
    '.......h........',
    '.......h........',
    '................',
    '..h.........h...',
    '................',
    '................',
    'hh...........hh.',
    '................',
    '................',
    '..h.........h...',
    '................',
    '................',
    '.......h........',
    '.......h........',
    '................',
  ],
  cage: [
    '....oooooooo....',
    '...oo.o..o.oo...',
    '..o...o..o...o..',
    '.o....o..o....o.',
    '.oooooooooooooo.',
    'o.....o..o.....o',
    'o.....o..o.....o',
    'o.....o..o.....o',
    'o.....o..o.....o',
    'o.....o..o.....o',
    '.oooooooooooooo.',
    '.o....o..o....o.',
    '..o...o..o...o..',
    '...oo.o..o.oo...',
    '....oooooooo....',
    '................',
  ],
  swarm: [
    '..l.....l....l..',
    '................',
    'l....l....l.....',
    '.........m....l.',
    '...m............',
    '.......oooo....l',
    'l.....ohhhlo....',
    '....m.ohyhlmo...',
    '......olhlmmo.m.',
    '.l.....ommdo....',
    '........ooo.....',
    '...m........l...',
    '..........m.....',
    'l.....l.........',
    '...........l....',
    '..l.............',
  ],
  core: [
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '.......yy.......',
    '......yyyy......',
    '......yyyy......',
    '.......yy.......',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
  grid: [
    '................',
    '................',
    '................',
    '................',
    '.....o..o..o....',
    '................',
    '...o..o..o..o...',
    '................',
    '....o..o..o..o..',
    '................',
    '...o..o..o..o...',
    '................',
    '.....o..o..o....',
    '................',
    '................',
    '................',
  ],
  data: [
    '................',
    '................',
    '................',
    '................',
    '................',
    '.......hh.......',
    '......h..h......',
    '....hh.hh.hh....',
    '....h..hh..h....',
    '......h..h......',
    '.......hh.......',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
  atom: [
    '................',
    '..hh........hh..',
    '.h..h......h..h.',
    '.h...h....h...h.',
    '..h...h..h...h..',
    '...h...hh...h...',
    '....h.hllh.h....',
    '.....hllmmh.....',
    '.....hlmmdh.....',
    '....h.hmdh.h....',
    '...h...hh...h...',
    '..h...h..h...h..',
    '.h...h....h...h.',
    '.h..h......h..h.',
    '..hh........hh..',
    '................',
  ],
  spoolend: [
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '..........oooo..',
    '.........ohhlo..',
    '.........olmdo..',
    '..........oooo..',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
  chest: [
    '................',
    '................',
    '.oooooooooooooo.',
    '.ohhhhhhhhhhhlo.',
    '.ohllllllllllmo.',
    '.ommmmmmmmmmmdo.',
    '.oooooooyyoooooo',
    '.ohllllloylllmo.',
    '.ohlllllyylllmo.',
    '.ohllllllllllmo.',
    '.ohllllllllllmo.',
    '.ommmmmmmmmmmdo.',
    '.oddddddddddddo.',
    '.oooooooooooooo.',
    '................',
    '................',
  ],
  factory: [
    '................',
    '..........oo....',
    '..........oo....',
    '.........ooooo..',
    '.oo......ohlmo..',
    '.oho..o..ohlmo..',
    '.ohlo.oo.ohlmo..',
    '.ohllooloohlmo..',
    '.ohlllolllolmoo.',
    '.ohllllllllllmo.',
    '.ohlyylyylyylmo.',
    '.ohlyylyylyylmo.',
    '.ohllllllllllmo.',
    '.oddddddddddddo.',
    '.oooooooooooooo.',
    '................',
  ],
  monument: [
    '.......oo.......',
    '......oyyo......',
    '.......oo.......',
    '......ohlo......',
    '......ohlo......',
    '.....ohllmo.....',
    '.....ohlmmo.....',
    '.....ohlmdo.....',
    '....ohllmmdo....',
    '....ohlmmmdo....',
    '...ohhllmmddo...',
    '...ohlllmmddo...',
    '..oooooooooooo..',
    '.ohhhhhhhhhhhlo.',
    '.oddddddddddddo.',
    '.oooooooooooooo.',
  ],
  portal: [
    '.....oooooo.....',
    '...oohhhhlloo...',
    '..ohhlo..ollmo..',
    '.ohlo.......mo..',
    '.ohl...yy...mdo.',
    'ohl...y..y...mdo',
    'ohl..y.yy.y..mdo',
    'ohl..y.yy.y..mdo',
    'ohl...y..y...mdo',
    '.ohl...yy...mdo.',
    '.ohlo......omdo.',
    '..ohlmo..omddo..',
    '...oommmmddoo...',
    '.....oooooo.....',
    '................',
    '................',
  ],
  wrench: [
    '................',
    '..........ooo...',
    '.........ohlo.o.',
    '.........ohoohlo',
    '........ohlllmo.',
    '.......ohllmmo..',
    '......ohlmmdo...',
    '.....ohlmdo.....',
    '....ohlmdo......',
    '...ohlmdo.......',
    '..ohlmdo........',
    '.ohlmdo.........',
    '.olmdo..........',
    '.oddo...........',
    '.ooo............',
    '................',
  ],
  ball: solid(disc(7.5, 8, 6.4)),
  orb: solid(disc(7.5, 7.5, 5.6), 0.7),
  star: solid(disc(7.5, 7.5, 5.2), 1.4),
  wafer: solid(disc(7.5, 7.5, 7.2)),
  gear: gear(),
  hex: hexagon(),
};

/** A tiny GT-style block: tier-coloured frame around a dark face, with screws in the corners */
T.casing = (() => {
  const rows: Rows = [];
  for (let y = 0; y < 16; y++) {
    let row = '';
    for (let x = 0; x < 16; x++) {
      const edge = x === 0 || y === 0 || x === 15 || y === 15;
      const frame = x === 1 || y === 1 || x === 14 || y === 14;
      const screw = (x === 2 || x === 13) && (y === 2 || y === 13);
      if (edge) row += 'o';
      else if (frame) row += x === 14 || y === 14 ? 'd' : x === 1 || y === 1 ? 'l' : 'm';
      else if (screw) row += 't';
      else row += x + y < 12 ? 's' : 'S';
    }
    rows.push(row);
  }
  return rows;
})();

// ---------- machine glyphs (drawn on the casing face, 10x10 at offset 3) ----------

/** '#' = glyph colour, '+' = warm accent */
const GLYPHS: Record<string, Rows> = {
  mining: ['..######..', '..######..', '...####...', '...#++#...', '....##....', '....#+....', '....##....', '.....#....', '..........', '+.+....+.+'],
  smelting: ['....#.....', '...##.....', '...###.#..', '..####.##.', '..#####+#.', '.###+++##.', '.##++++##.', '.##+++###.', '..######..', '##########'],
  crafting: ['..........', '#########.', '#########.', '...++.....', '...++.....', '...++.....', '...++.....', '...++.....', '...++.....', '..........'],
  research: ['...####...', '....##....', '....##....', '...#..#...', '..#....#..', '.#++++++#.', '#++++++++#', '#++++++++#', '.########.', '..........'],
  burning: ['.########.', '#........#', '#..####..#', '#........#', '.########.', '..........', '..+...+...', '.+++.+++..', '+++++++++.', '##########'],
  coking: ['......##..', '......##..', '##########', '#..#...#.#', '##########', '#.##++##.#', '###++++###', '#.#++++#.#', '###++++###', '##########'],
  turbine: ['....###...', '.....###..', '#.....##..', '##...##...', '.###++....', '....++###.', '...##...##', '..##.....#', '..###.....', '...###....'],
  solar: ['....+.....', '.+..+..+..', '..+++++...', '++++++++..', '..+++++...', '##########', '#..#..#..#', '##########', '#..#..#..#', '##########'],
  blasting: ['..#....#..', '..######..', '..#....#..', '.##....##.', '.#......#.', '.#......#.', '##..++..##', '#..++++..#', '#..++++..#', '##########'],
  crushing: ['.###..###.', '#...##...#', '#.#.##.#.#', '#...##...#', '.###..###.', '..........', '....+.....', '...+..+...', '....+..+..', '..+...+...'],
  electrolysis: ['..#....#..', '..#....#..', '#.#....#.#', '#.#....#.#', '#.#.+..#.#', '#++++++++#', '#++#++#++#', '#+++++++++', '#++++++++#', '##########'],
  mixing: ['....##....', '....##....', '....##....', '..######..', '..#.##.#..', '#........#', '#.++++++.#', '#++++++++#', '.#++++++#.', '..######..'],
  assembling: ['......###.', '.....#..#.', '....#..##.', '...#......', '..#.......', '.##.......', '####......', '.##....+..', '.##...+++.', '##########'],
  arc: ['..##..##..', '..##..##..', '..##..##..', '##########', '#...++...#', '#...+....#', '#....+...#', '#...++...#', '#..++++..#', '##########'],
  pumping: ['.......##.', '########.#', '.#....#...', '.#....#...', '.#...###..', '.#..#...#.', '.#.#.....#', '.##.......', '###...++..', '##########'],
  distilling: ['...####...', '...#..#...', '...####+++', '...#..#...', '...####+++', '...#..#...', '...####+++', '...#..#...', '..######..', '##########'],
  compressing: ['##########', '....##....', '...####...', '....##....', '..........', '..........', '.########.', '.#++++++#.', '.########.', '##########'],
  combustion: ['....##....', '....##....', '..######..', '..#....#..', '###.++.###', '..#.++.#..', '..#....#..', '..######..', '...#..#...', '..##..##..'],
  chemistry: ['...####...', '....##....', '....##....', '....##....', '...#..#...', '..#....#..', '.#++++++#.', '.#+++++++#', '.#++++++#.', '..######..'],
  vacuum: ['##########', '#........#', '#.#....#.#', '#.#....#.#', '#..#..#..#', '#..#..#..#', '#...##...#', '#........#', '#..++++..#', '##########'],
  freezing: ['....#.....', '.#..#..#..', '..#.#.#...', '...###....', '#########.', '...###....', '..#.#.#...', '.#..#..#..', '....#.....', '..........'],
  cooling: ['..+..+....', '...+..+...', '..+..+....', '.########.', '..#....#..', '...#..#...', '...#..#...', '..#....#..', '.#......#.', '##########'],
  launch: ['....##....', '...####...', '...#..#...', '...####...', '...####...', '..######..', '.##.##.##.', '....++....', '...++++...', '##########'],
  elevator: ['.###.###..', '....#.....', '....#.....', '...###....', '....#.....', '....#.....', '....#.....', '..#####...', '.#######..', '##########'],
  asteroid: ['..........', '...####...', '..#..###..', '.#.####.#.', '.###..###.', '.##.##.##.', '..#####...', '......+...', '.....+.+..', '....+...+.'],
  solar_wind: ['+.........', '.+.+......', '..+..###..', '+.+.#..#..', '...#..#...', '..#..#....', '..#.#.....', '...#......', '..###.....', '.#####....'],
  microgravity: ['..........', '##....##..', '##.##.##..', '##.##.##..', '####.####.', '##.##.##..', '##.##.##..', '##....##..', '....+.....', '...+.+....'],
  fusion: ['..######..', '.#......#.', '#..++++..#', '#.+....+.#', '#.+....+.#', '#..++++..#', '.#......#.', '..######..', '..........', '##########'],
  neutron: ['....#.....', '....#.....', '...###....', '..........', '##..++..##', '.#.++++.#.', '##..++..##', '..........', '...###....', '....#.....'],
  swarm: ['+...+...+.', '..........', '.+..##..+.', '...####...', '+.######.+', '+.######.+', '...####...', '.+..##..+.', '..........', '+...+...+.'],
  collider: ['..######..', '.#......#.', '#........#', '#..+..+..#', '#...++...#', '#...++...#', '#..+..+..#', '#........#', '.#......#.', '..######..'],
  stabilizer: ['##########', '.#......#.', '..#++++#..', '...#++#...', '....##....', '....##....', '...#..#...', '..#.++.#..', '.#++++++#.', '##########'],
};

// ---------- what each item and machine looks like ----------

const ORE = (fleck: string): Layer[] => [['stone', ''], ['flecks', fleck]];
const one = (t: string, c: string): Layer[] => [[t, c]];

const ITEM_ART: Record<string, Layer[]> = {
  stone: one('stone', ''),
  iron_ore: ORE('#c46a4a'),
  copper_ore: ORE('#e8914f'),
  coal: one('rock', '#3c4048'),
  iron_ingot: one('ingot', '#b8c0ca'),
  copper_ingot: one('ingot', '#e0864c'),
  stone_brick: one('brick', '#a49b8c'),
  gear: one('gear', '#a4adb8'),
  copper_wire: one('coil', '#e0864c'),
  steel: one('ingot', '#77869a'),
  slag: one('dust', '#6e6157'),
  bauxite: ORE('#d07a44'),
  coke: one('rock', '#55504c'),
  coal_tar: one('cell', '#3a2f28'),
  sand: one('dust', '#e2cf98'),
  bauxite_dust: one('dust', '#c66d3e'),
  aluminum_dust: one('dust', '#c9d1da'),
  oxygen: one('gascell', '#78c3ee'),
  iron_oxide: one('dust', '#a0442e'),
  aluminum: one('ingot', '#d4dce4'),
  silicon: one('crystal', '#8592a6'),
  rubber: one('ball', '#5a5d63'),
  cable: [['coil', '#4a525c'], ['spoolend', '#e0864c']],
  circuit: one('chip', '#3f9a5a'),
  chromite: ORE('#c8d2de'),
  chromite_dust: one('dust', '#7f8b9c'),
  chromium: one('ingot', '#dfe5ee'),
  stainless: one('plate', '#bcc7d2'),
  crude_oil: one('cell', '#433a33'),
  heavy_oil: one('cell', '#6a4524'),
  light_oil: one('cell', '#ddaa45'),
  refinery_gas: one('gascell', '#cdb27c'),
  sulfur: one('dust', '#e6d24a'),
  ethylene: one('gascell', '#a2dcc8'),
  plastic: one('plate', '#eceef1'),
  sulfuric_acid: one('cell', '#d9e05c'),
  pcb: one('board', '#2f7a4a'),
  adv_circuit: one('chip', '#3a80c8'),
  lubricant: one('can', '#d9b44a'),
  maintenance_kit: one('kit', '#d9503c'),
  rutile: ORE('#e0663e'),
  rutile_dust: one('dust', '#ba5a3c'),
  salt: one('cubes', '#ebe8e1'),
  sodium: one('rock', '#c8ced6'),
  chlorine: one('gascell', '#c6e05c'),
  ticl4: one('cell', '#e6e8a6'),
  carbon_monoxide: one('gascell', '#9ba2ab'),
  hot_titanium: [['ingot', '#f08a3c'], ['glow', '#ffcc66']],
  titanium: one('ingot', '#b4a8dc'),
  coolant: one('cell', '#3fb8da'),
  hot_coolant: one('cell', '#ea7a3c'),
  wolframite: ORE('#98a0ae'),
  wolframite_dust: one('dust', '#555b65'),
  sodium_tungstate: one('crystal', '#dde2e8'),
  tungstic_acid: one('dust', '#e6d36a'),
  hot_tungsten: [['ingot', '#f5a242'], ['glow', '#ffe08a']],
  tungsten: one('ingot', '#59606b'),
  wafer: [['wafer', '#8fa1ba'], ['grid', '#3e4a5c']],
  precision_circuit: one('chip', '#9a62d4'),
  rocket_fuel: one('canister', '#e8743a'),
  rocket_part: one('rocket', '#d9dee6'),
  meteor_ore: ORE('#6fdcc8'),
  meteor_dust: one('dust', '#5a958e'),
  iridium_chloride: one('crystal', '#d0b84e'),
  iridium: one('ingot', '#eaf1f6'),
  helium_3: one('atom', '#7fe0c2'),
  zg_crystal: one('crystal', '#bc8ff2'),
  nanotube: one('lattice', '#7d8ca0'),
  comet_ice: one('ice', '#bfe8f6'),
  deuterium: one('atom', '#6fb4f0'),
  helium: one('gascell', '#f0d98f'),
  liquid_helium: one('cell', '#a6e6ff'),
  superconductor: [['coil', '#4f6690'], ['spoolend', '#6fe4ec']],
  neutronium: [['star', '#c4cfff'], ['sparkle', '#ffffff']],
  dyson_panel: one('panel', '#3e72d6'),
  dyson_swarm: [['swarm', '#f2b73e'], ['core', '']],
  exotic_matter: [['orb', '#e45ad2'], ['sparkle', '#ffd0f6']],
  stable_exotic: [['orb', '#b45ce2'], ['cage', '#d8dde6']],
  red_pack: one('flask', '#e5604f'),
  green_pack: one('flask', '#4fbf7d'),
  blue_pack: one('flask', '#5a8fe6'),
  purple_pack: one('flask', '#a86fe0'),
  yellow_pack: one('flask', '#e0c341'),
  white_pack: one('flask', '#e2e7ec'),
  data: [['hex', '#c84a3e'], ['data', '#ffd6cf']],
  data_green: [['hex', '#3e9e64'], ['data', '#d4ffe4']],
  data_blue: [['hex', '#4474c8'], ['data', '#d8e6ff']],
  data_purple: [['hex', '#8a56c4'], ['data', '#eedcff']],
  data_yellow: [['hex', '#c4a22e'], ['data', '#fff4c8']],
  data_white: [['hex', '#a8b0ba'], ['data', '#ffffff']],
  lift: one('lift', '#d6dee8'),
  eu: one('bolt', '#f5cf4a'),
  steam: one('cloud', '#cfd7df'),
};

/** Machine tier colours, used for the casing frame */
export const TIER_COLORS = ['#8a8f99', '#c0803e', '#5f8fbf', '#d9893a', '#c85a54', '#7d6fd6', '#3fb6a8', '#e8c76a'];

/** Category glyph colour on the casing face */
const GLYPH_COLOR = '#e8edf2';

// ---------- rendering ----------

/** One SVG path per colour, from runs of the same letter */
function paths(layers: Array<[Rows, (ch: string) => string | undefined]>, ox = 0, oy = 0): Map<string, string> {
  const grid: (string | undefined)[][] = Array.from({ length: 16 }, () => Array(16).fill(undefined));
  for (const [rows, color] of layers) {
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const c = color(row[x]);
        if (c) grid[y + oy][x + ox] = c;
      }
    });
  }
  const out = new Map<string, string>();
  for (let y = 0; y < 16; y++) {
    let x = 0;
    while (x < 16) {
      const c = grid[y][x];
      let end = x + 1;
      while (end < 16 && grid[y][end] === c) end++;
      if (c) out.set(c, (out.get(c) ?? '') + `M${x} ${y}h${end - x}v1h${x - end}z`);
      x = end;
    }
  }
  return out;
}

const painter = (base: string) => {
  const sh = base ? shades(base) : {};
  return (ch: string) => (ch === '.' ? undefined : FIXED[ch] ?? (sh as Record<string, string>)[ch]);
};

const cache = new Map<string, Map<string, string>>();

function itemPaths(id: string): Map<string, string> {
  const key = `i:${id}`;
  let p = cache.get(key);
  if (!p) {
    const art = ITEM_ART[id] ?? one('rock', '#888888');
    p = paths(art.map(([t, c]) => [T[t], painter(c)] as [Rows, (ch: string) => string | undefined]));
    cache.set(key, p);
  }
  return p;
}

function machinePaths(id: string): Map<string, string> {
  const key = `m:${id}`;
  let p = cache.get(key);
  if (!p) {
    const m = MACHINES[id];
    const tierColor = TIER_COLORS[Math.min(m?.tier ?? 0, TIER_COLORS.length - 1)];
    const glyph = GLYPHS[m?.categories[0] ?? ''] ?? GLYPHS.crafting;
    const casing = paths([[T.casing, painter(tierColor)]]);
    const face = paths([[glyph, (ch) => (ch === '#' ? GLYPH_COLOR : ch === '+' ? FIXED.y : undefined)]], 3, 3);
    p = new Map(casing);
    for (const [c, d] of face) p.set(c, (p.get(c) ?? '') + d);
    cache.set(key, p);
  }
  return p;
}

function Svg({ p, size, title, class: cls }: { p: Map<string, string>; size: number; title?: string; class?: string }) {
  return (
    <svg
      class={`px ${cls ?? ''}`}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      shape-rendering="crispEdges"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : 'true'}
    >
      {title && <title>{title}</title>}
      {[...p].map(([c, d]) => (
        <path key={c} fill={c} d={d} />
      ))}
    </svg>
  );
}

export function ItemIcon({ id, size = 16, title }: { id: string; size?: number; title?: boolean }) {
  return <Svg p={itemPaths(id)} size={size} title={title ? ITEMS[id]?.name : undefined} />;
}

/** Tab and section icons */
const UI_ART: Record<string, Layer[]> = {
  production: one('factory', '#9aa6b4'),
  storage: one('chest', '#b0793e'),
  research: one('flask', '#5a8fe6'),
  milestones: one('monument', '#c9b27a'),
  legacy: one('portal', '#8f7ae6'),
  settings: one('wrench', '#a4adb8'),
};

export function UiIcon({ id, size = 20 }: { id: string; size?: number }) {
  const key = `u:${id}`;
  let p = cache.get(key);
  if (!p) {
    p = paths(UI_ART[id].map(([t, c]) => [T[t], painter(c)] as [Rows, (ch: string) => string | undefined]));
    cache.set(key, p);
  }
  return <Svg p={p} size={size} />;
}

export function MachineIcon({ id, size = 32, title }: { id: string; size?: number; title?: boolean }) {
  return <Svg p={machinePaths(id)} size={size} title={title ? MACHINES[id]?.name : undefined} class="px-machine" />;
}

// For tests and the art sheet
export const PIXEL_TEMPLATES = T;
export const PIXEL_GLYPHS = GLYPHS;
export const PIXEL_ITEM_ART = ITEM_ART;
export const PIXEL_FIXED = FIXED;
