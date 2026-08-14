// 角色生成（纯逻辑）。

import type { Player, FemaleLead } from '../types.js';
import {
  ROOTS, ORIGINS, SECTS, REALMS, PILLS, MATERIALS, TECHNIQUES,
  SURNAMES, FEMALE_GIVEN, TITLES, APPEARANCES, PERSONALITIES,
} from '../content.js';
import type { OriginDef, SectDef } from '../content.js';
import { pick, weightedPick } from './rng.js';

/** 随机测灵根，返回 { name, mult }。 */
export function rollRoot(): { name: string; mult: number } {
  const name = weightedPick(ROOTS.map((r) => [r.name, r.prob] as const));
  const mult = ROOTS.find((r) => r.name === name)!.mult;
  return { name, mult };
}

/** 创建初始玩家。 */
export function createPlayer(name: string, origin: OriginDef, sect: SectDef): Player {
  const pills0 = Object.fromEntries(Object.keys(PILLS).map((k) => [k, 0]));
  const mats0 = Object.fromEntries(Object.keys(MATERIALS).map((k) => [k, 0]));
  if (origin.pill) pills0[origin.pill] = 1;
  const p: Player = {
    name,
    origin: origin.name,
    sect: sect.name,
    scenario: '',
    storyStep: 0,
    betrayedSect: null,
    betrayYears: 0,
    sectContribution: 0,
    sectRank: 0,
    sectMaster: false,
    mastered: [],
    techProficiency: {},
    fragments: {},
    spells: [],
    pillToxin: 0,
    root: '三灵根',
    rootMult: 1.2,
    realmIdx: 0,
    stageIdx: 0,
    cultivation: 0,
    age: 16,
    lifespan: 100,
    spirit: origin.spirit,
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
  if (def?.spells) p.spells = [...def.spells];
  return p;
}

/** 随机生成一位女主，修为大致围绕玩家境界。 */
export function makeLead(player: Player): FemaleLead {
  const name = pick(SURNAMES) + pick(FEMALE_GIVEN);
  const offset = pick([-1, 0, 0, 1]);
  const idx = Math.max(0, Math.min(REALMS.length - 2, player.realmIdx + offset));
  const realm = REALMS[idx].name + pick(REALMS[idx].stages);
  return {
    name,
    title: pick(TITLES),
    appearance: pick(APPEARANCES),
    personality: pick(PERSONALITIES),
    realm,
    favor: 0,
    met: true,
    dao: false,
  };
}
