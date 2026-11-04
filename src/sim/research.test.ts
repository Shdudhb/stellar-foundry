import { describe, expect, it } from 'vitest';
import { newGame } from '../state/save';
import { simulateOffline } from './offline';
import { queueNext, runQueue, toggleQueued } from './research';

describe('research queue', () => {
  it('queues the prerequisites first, in an order that can be researched', () => {
    const s = newGame();
    toggleQueued(s, 'slag_recycling');
    expect(s.queue).toEqual(['steam_power', 'compression', 'slag_recycling']);
    // Adding a tech that shares prerequisites doesn't queue them twice
    toggleQueued(s, 'steam_mining');
    expect(s.queue).toEqual(['steam_power', 'compression', 'slag_recycling', 'steam_mining']);
    toggleQueued(s, 'compression');
    expect(s.queue).toEqual(['steam_power', 'slag_recycling', 'steam_mining']);
  });

  it('researches in order and waits for the first one rather than skipping to a cheaper one', () => {
    const s = newGame();
    s.queue = ['zoning_1', 'steam_power'];
    s.items.data = 40;
    // zoning_1 costs 50: steam_power (30) is affordable but has to wait its turn
    expect(queueNext(s)).toBe(null);
    s.items.data = 85;
    expect(runQueue(s)).toEqual(['zoning_1', 'steam_power']);
    expect(s.items.data).toBe(5);
    expect(s.queue).toEqual([]);
  });

  it('passes over a tech still locked behind a megastructure', () => {
    const s = newGame();
    s.techs = ['steam_power'];
    s.queue = ['electricity', 'steam_mining'];
    s.items.data = 200;
    expect(runQueue(s)).toEqual(['steam_mining']);
    expect(s.queue).toEqual(['electricity']);
  });

  it('keeps researching while away as data comes in', () => {
    const s = newGame();
    s.lines = [{ id: 1, machine: 'basic_drill', recipe: 'mine_iron', count: 0, enabled: true }];
    s.items.data = 0;
    s.queue = ['steam_power'];
    // No data income: nothing happens
    let report = simulateOffline(s, 60);
    expect(report.researched).toEqual([]);
    s.items.data = 30;
    report = simulateOffline(s, 5);
    expect(report.researched).toEqual(['steam_power']);
    expect(s.techs).toContain('steam_power');
  });
});
