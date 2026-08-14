// 游历探索 & 邂逅女主 & 随机事件调度。

import type { GameIO } from '../io.js';
import type { GameState } from '../types.js';
import { chance, weightedChoice } from './rng.js';
import { makeLead } from './character.js';
import { leadDescription } from './romance.js';
import { EVENTS } from './events.js';
import type { ExploreEvent } from './events.js';
import { sectOf, sectPower } from '../content.js';
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

  // 邂逅新女主（散修机缘更高）
  const eb = sectOf(p)?.exploreBonus ?? 0;
  const meetChance = 0.25 + (eb > 0 ? eb * sectPower(p) : eb);
  if (chance(meetChance) && state.leads.length < 5) {
    const lead = makeLead(p);
    state.leads.push(lead);
    await io.clear();
    await io.narrate('你于山水之间游历，忽见一位佳人……');
    io.print(leadDescription(lead));
    await io.narrate(`${lead.name} 与你偶遇，似乎对你颇有兴致。`);
    return;
  }

  const pool: Array<readonly [ExploreEvent, number]> = EVENTS.map((e) => [e, e.weight] as const);
  if (p.betrayedSect && (p.betrayYears ?? 0) > 0) pool.push([PURSUIT_EVENT, PURSUIT_EVENT.weight]);
  const ev = weightedChoice(pool);
  await io.clear();
  await ev.run(p, state, io);
}
