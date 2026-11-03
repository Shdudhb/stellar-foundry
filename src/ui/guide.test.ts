import { describe, expect, it } from 'vitest';
import { MACHINES } from '../data/machines';
import { OBJECTIVES } from '../data/objectives';
import { RECIPES } from '../data/recipes';
import { MILESTONES, TECHS } from '../data/tech';
import { newGame } from '../state/save';
import { nextStep } from './guide';

const find = (text: string) => OBJECTIVES.find((o) => o.text.includes(text))!;

describe('objective shortcuts', () => {
  it('point at things that exist', () => {
    for (const o of OBJECTIVES) {
      const go = o.go ?? {};
      if (go.machine) expect(MACHINES[go.machine], o.text).toBeDefined();
      if (go.recipe) expect(RECIPES[go.recipe], o.text).toBeDefined();
      if (go.tech) expect(TECHS[go.tech], o.text).toBeDefined();
      if (go.milestone) expect(MILESTONES[go.milestone], o.text).toBeDefined();
    }
  });

  it('give every step something to tap from a fresh game, except the ones done by hand', () => {
    const s = newGame();
    const missing = OBJECTIVES.filter((o) => !nextStep(s, o)).map((o) => o.text);
    expect(missing).toEqual(['手動採集 10 個石頭', '採集鐵礦與煤，讓石爐冶煉出 5 個鐵錠']);
  });

  it('send a new player to build the stone furnace, then to its line once it exists', () => {
    const s = newGame();
    const o = find('石爐」生產線');
    expect(nextStep(s, o)).toEqual({ kind: 'picker', query: '石爐' });
    s.lines.push({ id: 7, machine: 'stone_furnace', recipe: 'smelt_iron', count: 0, enabled: true });
    expect(nextStep(s, o)).toEqual({ kind: 'line', line: 7 });
  });

  it('send the player to research a named tech, or to the megastructure it waits on', () => {
    const s = newGame();
    expect(nextStep(s, find('蒸汽動力'))).toEqual({ kind: 'research', tech: 'steam_power' });
    // A late step from the start: the first thing on the way is research that can be done now
    const far = nextStep(s, find('建成星門'));
    expect(far?.kind).toBe('research');
    expect(TECHS[(far as { tech: string }).tech].requires).toEqual([]);
  });

  it('send the player to the megastructures tab once its research is done', () => {
    const s = newGame();
    const o = find('建成高爐');
    s.techs.push(...Object.keys(TECHS).filter((t) => TECHS[t].unlockMilestone === 'blast_furnace'));
    expect(nextStep(s, o)).toEqual({ kind: 'milestone', milestone: 'blast_furnace' });
  });
});
