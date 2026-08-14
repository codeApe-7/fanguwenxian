// 剧本专属主线事件链：随年龄推进，每次触发当前剧本的下一个剧情节点。
// 与游历随机事件区分——这里是确定性的、贯穿全程的专属剧情。

import type { GameIO } from '../io.js';
import type { GameState, Player } from '../types.js';
import { STORYLINES, SCENARIO_HEROINES, playerTitle } from '../content.js';
import type { StoryEffects } from '../content.js';
import { magenta } from '../colors.js';
import { combat } from './combat.js';

function applyEffects(p: Player, e?: StoryEffects): void {
  if (!e) return;
  if (e.spirit) p.spirit += e.spirit;
  if (e.heart) p.heart = Math.max(0, Math.min(100, p.heart + e.heart));
  if (e.cult) p.cultivation = Math.min(100, p.cultivation + e.cult);
  if (e.pill) p.pills[e.pill] = (p.pills[e.pill] ?? 0) + 1;
  if (e.material) for (const [m, n] of Object.entries(e.material)) p.materials[m] = (p.materials[m] ?? 0) + n;
  if (e.skill && !p.skills.includes(e.skill)) p.skills.push(e.skill);
}

/** 引入剧本专属女主（已存在则跳过），初始好感 35。 */
function introduceHeroine(state: GameState, name: string): void {
  if (state.leads.some((l) => l.name === name)) return;
  const h = SCENARIO_HEROINES[name];
  if (!h) return;
  state.leads.push({
    name: h.name,
    title: h.title,
    appearance: h.appearance,
    personality: h.personality,
    realm: playerTitle(state.player),
    realmIdx: state.player.realmIdx,
    stageIdx: state.player.stageIdx,
    favor: 35,
    met: true,
    dao: false,
  });
}

/** 应用剧情效果：玩家数值 + 女主登场。 */
function applyStoryEffects(state: GameState, e?: StoryEffects): void {
  if (!e) return;
  applyEffects(state.player, e);
  if (e.heroine) introduceHeroine(state, e.heroine);
}

/** 检查并触发当前剧本的下一个主线事件（每年最多一段）。返回是否触发。 */
export async function maybeTriggerStory(state: GameState, io: GameIO): Promise<boolean> {
  const p = state.player;
  const line = STORYLINES[p.scenario];
  if (!line) return false;
  const step = p.storyStep ?? 0;
  const beat = line[step];
  if (!beat) return false;
  if (p.age < beat.age) return false;

  io.print();
  await io.narrate(magenta(`【主线 · ${p.scenario}】`));
  for (const t of beat.text) await io.narrate(t);

  if (beat.choices && beat.choices.length > 0) {
    beat.choices.forEach((c, i) => io.print(` ${i + 1}) ${c.label}`));
    const nums = beat.choices.map((_, i) => String(i + 1));
    const ch = parseInt(await io.ask('你的选择：', nums, '1'), 10) - 1;
    const choice = beat.choices[ch];
    for (const r of choice.result) await io.narrate(r);
    if (choice.combat) {
      const c = choice.combat;
      const outcome = await combat(p, state.leads, io, c.intro);
      if (outcome === 'win') {
        for (const t of c.winText) await io.narrate(t);
        applyStoryEffects(state, c.winEffects);
      } else {
        for (const t of c.loseText) await io.narrate(t);
        applyStoryEffects(state, c.loseEffects);
      }
    } else {
      applyStoryEffects(state, choice.effects);
    }
  } else {
    applyStoryEffects(state, beat.effects);
  }

  p.storyStep = step + 1;
  return true;
}
