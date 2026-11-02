import { describe, expect, it } from 'vitest';
import { costsOverCap, tierCosts } from './balance';

describe('balance', () => {
  it('makes every tier cost more than the one before (research + milestone)', () => {
    const tiers = tierCosts();
    for (let i = 1; i < tiers.length; i++) {
      expect(tiers[i].total, `T${tiers[i].tier} vs T${tiers[i - 1].tier}`).toBeGreaterThan(tiers[i - 1].total * 1.2);
    }
  });

  it('fits every cost in the storage the player has when it unlocks', () => {
    expect(costsOverCap()).toEqual([]);
  });
});
