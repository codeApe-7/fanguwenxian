// 游历探索 & 邂逅女主 & 随机事件调度。

import type { GameIO } from '../io.js';
import type { GameState } from '../types.js';
import { chance, weightedChoice, randint, pick } from './rng.js';
import { makeLead } from './character.js';
import { leadDescription } from './romance.js';
import { EVENTS } from './events.js';
import type { ExploreEvent } from './events.js';
import { sectOf, sectPower } from '../content.js';
import { PLACES } from '../content/world.js';
import { dialogueOf } from '../content/dialogue.js';
import { fill } from './text.js';
import { combat } from './combat.js';
import { red } from '../colors.js';

/** 旧宗追兵（叛宗惩罚：高权重加入游历事件池）。 */
const PURSUIT_EVENT: ExploreEvent = {
  name: '旧宗追兵',
  weight: 12,
  run: async (p, state, io) => {
    await combat(p, state.leads, io, `你叛出 ${red(p.betrayedSect ?? '旧宗')} 的消息走漏，追兵杀至——正是 {enemy}！`);
  },
};

export async function explore(state: GameState, io: GameIO): Promise<void> {
  const p = state.player;

  // 邂逅新女主（散修机缘更高；已有红颜越多，越难再遇新）
  const eb = sectOf(p)?.exploreBonus ?? 0;
  const base = 0.2 + (eb > 0 ? eb * sectPower(p) : eb);
  const meetChance = base * (1 - state.leads.length * 0.15);
  if (chance(meetChance) && state.leads.length < 5) {
    const lead = makeLead(p, randint(12, 22)); // 「颇有兴致」——已有初步好感
    state.leads.push(lead);
    await io.clear();
    await io.narrate(fill('你于{place}游历，山转水回处，迎面遇上一位佳人——', { place: pick(PLACES) }));
    io.print(leadDescription(lead));
    await io.narrate(fill(dialogueOf(lead.personality).meet, { name: p.name, her: lead.name }));
    return;
  }

  const pool: Array<readonly [ExploreEvent, number]> = EVENTS.map((e) => [e, e.weight] as const);
  if (p.betrayedSect && (p.betrayYears ?? 0) > 0) pool.push([PURSUIT_EVENT, PURSUIT_EVENT.weight]);
  const ev = weightedChoice(pool);
  await io.clear();
  await ev.run(p, state, io);
}
