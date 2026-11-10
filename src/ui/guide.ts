// Where an objective sends the player: the one thing to do next for it, and the tap that gets them there
import { MACHINES } from '../data/machines';
import type { Objective } from '../data/objectives';
import { RECIPES } from '../data/recipes';
import { MILESTONES, TECH_LIST, TECHS } from '../data/tech';
import { RECIPE_LIST } from '../data/recipes';
import { PLANETS } from '../data/planets';
import { allLines, planetOf } from '../sim/planets';
import { canRun, isMachineUnlocked, isRecipeUnlocked, milestoneUnlocked, recipePlanet } from '../sim/rules';
import type { GameState } from '../sim/types';

export type Step =
  | { kind: 'research'; tech: string }
  | { kind: 'milestone'; milestone: string }
  | { kind: 'line'; line: number }
  | { kind: 'picker'; query: string; planet?: string }
  | { kind: 'routes' };

/** The tech that has to come first on the way to `techId`: a missing prerequisite, or the megastructure it waits for */
function pathTo(s: GameState, techId: string, seen = new Set<string>()): Step | null {
  if (s.techs.includes(techId) || seen.has(techId)) return null;
  seen.add(techId);
  const t = TECHS[techId];
  if (!t) return null;
  for (const r of t.requires) {
    const step = pathTo(s, r, seen);
    if (step) return step;
  }
  if (t.requiresMilestone && !s.milestones.includes(t.requiresMilestone)) return milestoneStep(s, t.requiresMilestone, seen);
  return { kind: 'research', tech: techId };
}

function milestoneStep(s: GameState, id: string, seen = new Set<string>()): Step | null {
  if (s.milestones.includes(id)) return null;
  if (milestoneUnlocked(s, id)) return { kind: 'milestone', milestone: id };
  const tech = TECH_LIST.find((t) => t.unlockMilestone === id);
  return tech ? pathTo(s, tech.id, seen) : null;
}

const unlocking = (pick: (t: (typeof TECH_LIST)[number]) => string[] | undefined, id: string) =>
  TECH_LIST.find((t) => pick(t)?.includes(id))?.id;

/** The next thing to do for this objective, or null when there's nothing to tap (gathering, waiting) */
export function nextStep(s: GameState, o: Objective): Step | null {
  const go = o.go ?? {};
  // Research it names (「蒸汽動力」), its own target, and whatever unlocks the machine or recipe it wants
  const named = [...o.text.matchAll(/「([^」]+)」/g)].flatMap((m) => TECH_LIST.filter((t) => t.name === m[1]).map((t) => t.id));
  const needed = [
    ...named,
    ...(go.tech ? [go.tech] : []),
    ...(go.machine && !isMachineUnlocked(s, go.machine) ? [unlocking((t) => t.unlockMachines, go.machine)] : []),
    ...(go.recipe && !isRecipeUnlocked(s, go.recipe) ? [unlocking((t) => t.unlockRecipes, go.recipe)] : []),
  ];
  for (const tech of needed) {
    const step = tech && pathTo(s, tech);
    if (step) return step;
  }
  if (go.machine) {
    const need = MACHINES[go.machine]?.requiresMilestone;
    const step = need && milestoneStep(s, need);
    if (step) return step;
  }
  if (go.milestone) return milestoneStep(s, go.milestone);
  if (go.recipe || go.machine) {
    const line = allLines(s).find((l) => (!go.machine || l.machine === go.machine) && (!go.recipe || l.recipe === go.recipe));
    if (line) return { kind: 'line', line: line.id };
    // The world it has to be built on, when there is only one: the recipe's, or the one all the machine's recipes share
    const m = go.machine ? MACHINES[go.machine] : undefined;
    const where = go.recipe
      ? recipePlanet(RECIPES[go.recipe])
      : [...new Set(RECIPE_LIST.filter((r) => canRun(m!, r)).map(recipePlanet))].find((p, _i, all) => all.length === 1 && p);
    const world = where ? PLANETS[where] : undefined;
    const first = (world?.unlockMilestone && milestoneStep(s, world.unlockMilestone)) || (world?.unlockTech && pathTo(s, world.unlockTech));
    if (first) return first;
    return {
      kind: 'picker', query: go.recipe ? RECIPES[go.recipe].name : m!.name,
      ...(where && where !== planetOf(s) ? { planet: where } : {}),
    };
  }
  if (go.route) return { kind: 'routes' };
  return null;
}

/** The button's words for a step */
export function stepLabel(step: Step): string {
  switch (step.kind) {
    case 'research': return `研究「${TECHS[step.tech].name}」`;
    case 'milestone': return `建造「${MILESTONES[step.milestone].name}」`;
    case 'line': return '前往生產線';
    case 'picker': return step.planet ? `到${PLANETS[step.planet].name}建立` : '建立生產線';
    case 'routes': return '新增航線';
  }
}
