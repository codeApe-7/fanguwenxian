// 角色生成（纯逻辑）。

import type { Player, FemaleLead } from '../types.js';
import {
  ROOTS, ORIGINS, SECTS, REALMS, PILLS, MATERIALS, TECHNIQUES, ELEMENTS,
  SURNAMES, FEMALE_GIVEN, TITLES, APPEARANCES, PERSONALITIES,
  rootsFor, learnSpell, mainElement, STARTER_SPELLS,
} from '../content.js';
import type { OriginDef, SectDef, Element } from '../content.js';
import { pick, weightedPick, randint, shuffle } from './rng.js';

/** 随机测灵根，返回 { name, mult }。 */
export function rollRoot(): { name: string; mult: number } {
  const name = weightedPick(ROOTS.map((r) => [r.name, r.prob] as const));
  const mult = ROOTS.find((r) => r.name === name)!.mult;
  return { name, mult };
}

/** 随机铺一副五行灵根值：先摇属性顺序，再按档位分深浅。 */
export function rollRoots(rootName: string): Record<Element, number> {
  return rootsFor(rootName, shuffle([...ELEMENTS]));
}

/** 创建初始玩家。 */
export function createPlayer(
  name: string,
  origin: OriginDef,
  sect: SectDef,
  roots: Record<Element, number> = rollRoots('三灵根'),
): Player {
  const pills0 = Object.fromEntries(Object.keys(PILLS).map((k) => [k, 0]));
  const mats0 = Object.fromEntries(Object.keys(MATERIALS).map((k) => [k, 0]));
  if (origin.pill) pills0[origin.pill] = 1;
  const p: Player = {
    name,
    origin: origin.name,
    sect: sect.name,
    scenario: '',
    storyStep: 0,
    storyDone: [],
    storyMissed: [],
    flags: {},
    biography: [],
    taskCd: {},
    lettersSent: [],
    pendingLetters: [],
    worldSeen: [],
    betrayedSect: null,
    betrayYears: 0,
    sectContribution: 0,
    sectRank: 0,
    sectMaster: false,
    mastered: [],
    techProficiency: { [origin.technique]: 0 },
    fragments: {},
    spells: [],
    spellLv: {},
    insight: 0,
    roots,
    abode: '山中茅舍',
    goldenCore: null,
    yuanying: null,
    daoPath: null,
    pillToxin: 0,
    root: '三灵根',
    rootMult: 1.0,
    aptitude: 1.0,
    realmIdx: 0,
    stageIdx: 0,
    cultivation: 0,
    age: 16,
    lifespan: 100,
    spirit: origin.spirit,
    spiritWarm: 0,
    technique: origin.technique,
    treasure: '无',
    maxHp: 40 + origin.hpBonus,
    heart: origin.heart,
    pills: pills0,
    materials: mats0,
    skills: [],
    formation: '无',
    talismans: {},
    daoCompanion: null,
    goldenFinger: null,
    cheatBonus: 1.0,
    fightsWon: 0,
  };
  // 初始功法附带神通
  const def = TECHNIQUES[origin.technique];
  if (def?.spells) for (const s of def.spells) learnSpell(p, s);
  // 本命五行的入门一式：谁都不该赤手空拳踏上仙途
  learnSpell(p, STARTER_SPELLS[mainElement(p.roots)]);
  return p;
}

/**
 * 随机生成一位女主，修为围绕玩家境界、可高于主角（前辈/师姐）。
 * favor 由邂逅场景决定：萍水相逢低、救命之恩高，需与该处旁白口吻相称。
 */
export function makeLead(player: Player, favor = 0): FemaleLead {
  const name = pick(SURNAMES) + pick(FEMALE_GIVEN);
  const offset = pick([-1, 0, 0, 1, 1, 2]); // 可高主角两阶，少数低一阶
  const idx = Math.max(0, Math.min(REALMS.length - 1, player.realmIdx + offset));
  const stageIdx = randint(0, REALMS[idx].stages.length - 1);
  const realm = REALMS[idx].name + REALMS[idx].stages[stageIdx];
  return {
    name,
    title: pick(TITLES),
    appearance: pick(APPEARANCES),
    personality: pick(PERSONALITIES),
    realm,
    realmIdx: idx,
    stageIdx,
    favor: Math.max(0, Math.min(100, favor)),
    met: true,
    dao: false,
  };
}
