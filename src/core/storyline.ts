// 主线剧情调度器。
// 旧版按 storyStep 线性播放（怎么玩都看完全部剧情，永不错过）；
// 新版每年扫描节点库：年龄窗/境界窗/flag 前置互斥/系统条件（when），
// 一年至多触发一节点；窗口关闭即永久错过，并在关窗当年播报错过反馈。
// 「修得快」与「吃满剧情」自此不可兼得——这正是取舍的来源。

import type { GameIO } from '../io.js';
import type { GameState, Player } from '../types.js';
import { STORY_NODES, SCENARIO_HEROINES } from '../content/story.js';
import type { StoryEffects, StoryNode, FlagReq } from '../content/story.js';
import { playerTitle, learnTechnique, TREASURES, treasureTier } from '../content.js';
import { PLACES } from '../content/world.js';
import { magenta, yellow } from '../colors.js';
import { fill, addBio } from './text.js';
import { pick } from './rng.js';
import { combat } from './combat.js';

// ---- flag 工具 ----

export function flagOf(p: Player, name: string): number {
  return p.flags?.[name] ?? 0;
}

function flagOk(p: Player, r: FlagReq): boolean {
  const v = flagOf(p, r.flag);
  const op = r.op ?? '>=';
  const val = r.value ?? 1;
  if (op === '>=') return v >= val;
  if (op === '<') return v < val;
  return v === val;
}

// ---- 效果结算 ----

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
    seen: {},
  });
}

/** 应用剧情效果，返回本次写入大事记的文本（无则 null）。 */
export function applyStoryEffects(state: GameState, e?: StoryEffects): string | null {
  if (!e) return null;
  const p = state.player;
  if (e.spirit) p.spirit = Math.max(0, p.spirit + e.spirit);
  if (e.heart) p.heart = Math.max(0, Math.min(100, p.heart + e.heart));
  if (e.cult) p.cultivation = Math.max(0, Math.min(100, p.cultivation + e.cult));
  if (e.life) p.lifespan = Math.max(p.age + 1, p.lifespan + e.life);
  if (e.toxin) p.pillToxin = Math.max(0, Math.min(100, (p.pillToxin ?? 0) + e.toxin));
  if (e.pill) p.pills[e.pill] = (p.pills[e.pill] ?? 0) + 1;
  if (e.material) for (const [m, n] of Object.entries(e.material)) p.materials[m] = (p.materials[m] ?? 0) + n;
  if (e.skill && !p.skills.includes(e.skill)) p.skills.push(e.skill);
  if (e.technique) learnTechnique(p, e.technique);
  if (e.fragment) p.fragments[e.fragment] = (p.fragments[e.fragment] ?? 0) + 1;
  if (e.treasure) {
    // 剧情所得法宝：优于现有则换装，否则折价变卖
    const cur = treasureTier(p);
    const got = TREASURES[e.treasure];
    if (got && got.tier > cur) p.treasure = e.treasure;
    else if (got) p.spirit += Math.floor(got.price / 2);
  }
  if (e.heroine) introduceHeroine(state, e.heroine);
  if (e.favor) {
    for (const [name, delta] of Object.entries(e.favor)) {
      const l = state.leads.find((x) => x.name === name);
      if (l) l.favor = Math.max(0, Math.min(100, l.favor + delta));
    }
  }
  if (e.flags) {
    p.flags ??= {};
    for (const [k, v] of Object.entries(e.flags)) p.flags[k] = (p.flags[k] ?? 0) + v;
  }
  if (e.pardon) {
    p.betrayedSect = null;
    p.betrayYears = 0;
  }
  if (e.log) {
    addBio(p, e.log);
    return e.log;
  }
  return null;
}

// ---- 触发判定 ----

/** 该剧本可见的节点：剧本专属优先，共用节点殿后。 */
function nodesOf(p: Player): StoryNode[] {
  return STORY_NODES.filter((n) => n.scenario === p.scenario).concat(
    STORY_NODES.filter((n) => !n.scenario),
  );
}

/** 窗口是否已永久关闭（年龄超上限 / 境界冲过上限）。 */
function expired(p: Player, n: StoryNode): boolean {
  if (n.maxAge !== undefined && p.age > n.maxAge) return true;
  if (n.maxRealm !== undefined && p.realmIdx > n.maxRealm) return true;
  return false;
}

/**
 * 是否「刚刚」错过（关窗后第一时间）——只有这时才播报错过反馈。
 * 旧档迁移进来的陈年错过会静默归档，避免开局刷屏。
 */
function justExpired(p: Player, n: StoryNode): boolean {
  if (n.maxAge !== undefined && p.age === n.maxAge + 1) return true;
  if (n.maxRealm !== undefined && p.realmIdx === n.maxRealm + 1) return true;
  return false;
}

function eligible(state: GameState, n: StoryNode): boolean {
  const p = state.player;
  if (n.minAge !== undefined && p.age < n.minAge) return false;
  if (n.minRealm !== undefined && p.realmIdx < n.minRealm) return false;
  if (expired(p, n)) return false;
  if (n.require && !n.require.every((r) => flagOk(p, r))) return false;
  if (n.exclude && n.exclude.some((f) => flagOf(p, f) >= 1)) return false;
  if (n.when && !n.when(state)) return false;
  return true;
}

// ---- 主入口 ----

/**
 * 每年调用一次：先归档错过的节点（关窗当年播报反馈），
 * 再触发第一个符合条件的节点（每年至多一段）。返回是否触发了剧情。
 */
export async function maybeTriggerStory(state: GameState, io: GameIO): Promise<boolean> {
  const p = state.player;
  p.storyDone ??= [];
  p.storyMissed ??= [];
  p.flags ??= {};
  const list = nodesOf(p);

  // 1) 错过归档与反馈
  for (const n of list) {
    if (p.storyDone.includes(n.id) || p.storyMissed.includes(n.id)) continue;
    if (!expired(p, n)) continue;
    p.storyMissed.push(n.id);
    if (n.missText && n.missText.length > 0 && justExpired(p, n)) {
      io.print();
      await io.narrate(yellow(`【错过 · ${n.title}】`));
      const c = { name: p.name, sect: p.sect, place: pick(PLACES), realm: playerTitle(p) };
      for (const t of n.missText) await io.narrate(fill(t, c));
      addBio(p, `错过了「${n.title}」`);
    }
  }

  // 2) 触发第一个符合条件的节点
  const node = list.find(
    (n) => !p.storyDone.includes(n.id) && !p.storyMissed.includes(n.id) && eligible(state, n),
  );
  if (!node) return false;

  const c = { name: p.name, sect: p.sect, place: pick(PLACES), realm: playerTitle(p) };
  io.print();
  await io.narrate(magenta(`【主线 · ${p.scenario} · ${node.title}】`));
  for (const t of node.text) await io.narrate(fill(t, c));

  let loggedInEffects: string | null = null;
  if (node.choices && node.choices.length > 0) {
    node.choices.forEach((ch, i) => io.print(` ${i + 1}) ${ch.label}`));
    const nums = node.choices.map((_, i) => String(i + 1));
    const ans = parseInt(await io.ask('你的选择：', nums, '1'), 10) - 1;
    const choice = node.choices[ans];
    for (const r of choice.result) await io.narrate(fill(r, c));
    if (choice.combat) {
      const cb = choice.combat;
      const outcome = await combat(p, state.leads, io, {
        intro: cb.intro,
        boost: cb.boost ?? 0,
        kind: cb.kind ?? '妖兽',
        foe: cb.foe,
        title: `【主线】${node.title}`,
      });
      if (outcome === 'win') {
        for (const t of cb.winText) await io.narrate(fill(t, c));
        loggedInEffects = applyStoryEffects(state, cb.winEffects);
      } else {
        for (const t of cb.loseText) await io.narrate(fill(t, c));
        loggedInEffects = applyStoryEffects(state, cb.loseEffects);
      }
    } else {
      loggedInEffects = applyStoryEffects(state, choice.effects);
    }
  } else {
    loggedInEffects = applyStoryEffects(state, node.effects);
  }

  p.storyDone.push(node.id);
  if (!loggedInEffects && node.log) addBio(p, node.log);
  return true;
}
