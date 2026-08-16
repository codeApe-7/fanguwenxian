// 游戏静态数据 + 由状态推导出的属性计算（纯函数，与终端/网页无关）。

import type { Player } from './types.js';
import { SPELLS, SPELL_MAX_LV } from './content/spells.js';

// ---- 大境界 ----
export interface RealmDef {
  name: string;
  stages: string[];
  lifespan: number;       // 突破此境后的寿元上限
  difficulty: number;     // 修炼难度系数（越小越慢）
  breakPill: string | null; // 突破至下一大境界所需丹药
}

export const REALMS: RealmDef[] = [
  { name: '炼气期', stages: ['初期', '中期', '后期', '大圆满'], lifespan: 100, difficulty: 1.0, breakPill: '筑基丹' },
  { name: '筑基期', stages: ['初期', '中期', '后期', '大圆满'], lifespan: 200, difficulty: 0.8, breakPill: '结丹丹' },
  { name: '结丹期', stages: ['初期', '中期', '后期', '大圆满'], lifespan: 500, difficulty: 0.6, breakPill: '婴变丹' },
  { name: '元婴期', stages: ['初期', '中期', '后期', '大圆满'], lifespan: 1000, difficulty: 0.45, breakPill: '化神丹' },
  { name: '化神期', stages: ['初期', '中期', '后期', '大圆满'], lifespan: 2000, difficulty: 0.34, breakPill: '炼虚丹' },
  { name: '炼虚期', stages: ['初期', '中期', '后期', '大圆满'], lifespan: 5000, difficulty: 0.25, breakPill: '合体丹' },
  { name: '合体期', stages: ['初期', '中期', '后期', '大圆满'], lifespan: 10000, difficulty: 0.18, breakPill: '大乘丹' },
  { name: '大乘期', stages: ['初期', '中期', '后期', '大圆满'], lifespan: 20000, difficulty: 0.13, breakPill: '渡劫丹' },
  { name: '渡劫期', stages: ['初期', '中期', '后期', '大圆满'], lifespan: 50000, difficulty: 0.1, breakPill: null },
];

// ---- 战力曲线 ----
// 大境界之间 ×2.2：越一阶如天堑，这才是「修为压制」四个字的数值形态。
// 境界内每小阶 ×1.18：同境界之间有操作空间，法宝、神通、丹药能翻盘。
export const REALM_STEP = 2.2;
export const STAGE_STEP = 1.18;

/** 战力基数：一切气血/攻击/防御都是「基础值 × 本函数 × (1+加成)」。 */
export function powerOf(realmIdx: number, stageIdx: number): number {
  return Math.pow(REALM_STEP, realmIdx) * Math.pow(STAGE_STEP, stageIdx);
}

/**
 * 各项属性的炼气初期基准值。曲线只有一条，差别全在这五个数上。
 * 气血 ≈ 4 倍攻击：同境界对拼约 9~10 回合见分晓，用得好神通与丹药则 6~7 回合。
 */
export const BASE_STATS = { hp: 48, atk: 12, def: 4, spd: 4, sense: 4 };

// ---- 五行 ----
// 灵根不是一个档位，是五个数值：金木水火土各有深浅，决定你能把哪一系练到极致。
export type Element = '金' | '木' | '水' | '火' | '土';
export const ELEMENTS: Element[] = ['金', '木', '水', '火', '土'];

/** 相生：木生火、火生土、土生金、金生水、水生木。上一式生本式，即为【连击】。 */
export const SHENG: Record<Element, Element> = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
/** 相克：木克土、土克水、水克火、火克金、金克木。 */
export const KE: Record<Element, Element> = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };

// ---- 心境七档 ----
// 心境不只是突破成功率上的一个加数，它是称谓、是剧情门槛、是渡劫时挡在你身前的那层东西。
export const HEART_TIERS: Array<{ min: number; name: string }> = [
  { min: 0, name: '心猿意马' },
  { min: 15, name: '神静气安' },
  { min: 30, name: '古井不波' },
  { min: 50, name: '六情沉寂' },
  { min: 70, name: '看破红尘' },
  { min: 85, name: '超然物外' },
  { min: 95, name: '物我合一' },
];

/** 心境档位下标（0~6）。 */
export function heartTier(heart: number): number {
  let i = 0;
  for (let k = 0; k < HEART_TIERS.length; k++) if (heart >= HEART_TIERS[k].min) i = k;
  return i;
}

export function heartName(heart: number): string {
  return HEART_TIERS[heartTier(heart)].name;
}

// ---- 灵根 ----
export interface RootDef {
  name: string;
  mult: number;   // 修炼倍率
  prob: number;   // 出现概率
  elems: number;  // 具备的五行数目（1=单灵根…5=五灵根）
  peak: number;   // 主属性的灵根值（越高，本系神通越强、金丹品质上限越高）
}

export const ROOTS: RootDef[] = [
  { name: '天灵根', mult: 5.0, prob: 0.02, elems: 1, peak: 95 },
  { name: '异灵根', mult: 3.0, prob: 0.05, elems: 1, peak: 80 },
  { name: '双灵根', mult: 1.8, prob: 0.13, elems: 2, peak: 70 },
  { name: '三灵根', mult: 1.0, prob: 0.25, elems: 3, peak: 55 },
  { name: '四灵根', mult: 0.6, prob: 0.30, elems: 4, peak: 42 },
  { name: '五灵根', mult: 0.5, prob: 0.25, elems: 5, peak: 34 },
];

/**
 * 按灵根档位铺出五行灵根值。
 * 单灵根是一柱擎天，五灵根是五处平庸——档位第一次有了具体形状。
 * `picks` 由调用方给定（创角随机 / 旧档按主属性反推），保证同一角色每次算出的值一致。
 */
export function rootsFor(rootName: string, picks: Element[]): Record<Element, number> {
  const def = ROOTS.find((r) => r.name === rootName) ?? ROOTS[3];
  const out = { 金: 0, 木: 0, 水: 0, 火: 0, 土: 0 } as Record<Element, number>;
  for (let i = 0; i < def.elems; i++) {
    const e = picks[i % picks.length];
    // 主属性最深，其余依次递减一成——双灵根也有主次之分
    out[e] = Math.max(out[e], Math.round(def.peak * Math.pow(0.9, i)));
  }
  // 没占到的五行留一点底子：万物皆通一线，只是不成气候
  for (const e of ELEMENTS) if (out[e] === 0) out[e] = 5;
  return out;
}

/**
 * 本命五行的入门一式：人人开局都会一式，否则炼气期的战斗只剩下反复戳「普通攻击」。
 * 这也让「本命五行」这个创角选择在第一场战斗里就能被感觉到。
 */
export const STARTER_SPELLS: Record<Element, string> = {
  金: '金刃术', 木: '木灵刺', 水: '冰锥术', 火: '火球术', 土: '落石击',
};

/** 灵根最深的一系，即本命属性。 */
export function mainElement(roots: Record<Element, number>): Element {
  return ELEMENTS.reduce((a, b) => (roots[b] > roots[a] ? b : a), ELEMENTS[0]);
}

/** 灵根纯度 0~1：单灵根近 1，五灵根近 0。金丹品质与神通亲和都看它。 */
export function rootPurity(roots: Record<Element, number>): number {
  const total = ELEMENTS.reduce((s, e) => s + roots[e], 0);
  if (total <= 0) return 0;
  return roots[mainElement(roots)] / total;
}

// ---- 修炼功法 ----
// 加成一律用百分比：同一柄剑在炼气期是天、在化神期是噪声，这种事不该发生。
export interface TechniqueDef {
  mult: number;       // 修炼倍率
  atkPct?: number;    // 攻击加成 %（主修时生效，随熟练度放大）
  defPct?: number;    // 防御加成 %
  hpPct?: number;     // 气血加成 %
  spd?: number;       // 遁速加成（定值，遁速按差值用，不随境界膨胀）
  sense?: number;     // 神识加成（定值）
  lifespan?: number;  // 初次修习寿元 +N（一次性）
  sect?: string;      // 镇宗功法：仅该宗门藏经阁可兑换
  tier?: 1 | 2 | 3;   // 品阶：1=凡品（缺省） 2=灵品 3=仙品（仙品不售，仅残篇/奇遇）
  spells?: string[];  // 修习时附带的法术/神通
  desc: string;       // 功效描述
}

export const TECHNIQUES: Record<string, TechniqueDef> = {
  // —— 通用主修（凡品，坊市/藏经阁有售） ——
  基础吐纳术: { mult: 1.0, desc: '入门吐纳，无甚出奇。' },
  青灵诀: { mult: 1.3, spells: ['回春术'], desc: '青木灵气，滋养经脉。' },
  玄霜诀: { mult: 1.5, spells: ['冰锥术'], desc: '凝气成霜，道基渐固。' },
  紫薇心经: { mult: 2.0, sense: 2, spells: ['掌心雷'], desc: '接引紫薇星力，妙不可言。' },
  九转玄元功: { mult: 2.5, sense: 2, spells: ['五雷轰顶'], desc: '九转轮回，玄元不息。' },
  太上忘尘经: { mult: 3.0, sense: 3, spells: ['摄魂术'], desc: '太上忘情，尘缘尽断。' },
  // —— 通用炼体 / 养寿 / 攻伐（凡品，坊市有售） ——
  金刚淬体功: { mult: 1.1, hpPct: 0.25, defPct: 0.20, spells: ['金刚罩'], desc: '炼体功法，铜皮铁骨。' },
  铁骨功: { mult: 1.1, hpPct: 0.30, defPct: 0.25, spells: ['战意诀'], desc: '锻骨如铁，气血悠长。' },
  龟息诀: { mult: 1.0, sense: 2, lifespan: 15, spells: ['敛息术'], desc: '龟息吐纳，延年益寿。' },
  养生诀: { mult: 1.1, lifespan: 10, spells: ['甘霖咒'], desc: '调和阴阳，颐养天年。' },
  御风诀: { mult: 1.2, atkPct: 0.08, spd: 3, spells: ['疾风斩', '土遁术'], desc: '身法御风，疾如流影。' },
  烈阳掌: { mult: 1.2, atkPct: 0.12, spells: ['火球术'], desc: '至阳掌力，焚金裂石。' },
  玄冥劲: { mult: 1.2, atkPct: 0.12, spells: ['冰封千里'], desc: '阴寒劲力，透骨伤髓。' },
  狂雷劲: { mult: 1.25, atkPct: 0.15, spells: ['掌心雷'], desc: '雷霆劲力，刚猛无俦。' },
  磐石功: { mult: 1.1, hpPct: 0.35, defPct: 0.30, spells: ['金刚罩'], desc: '立如磐石，稳若泰山。' },
  洗髓经: { mult: 1.3, hpPct: 0.10, defPct: 0.10, spells: ['回春术'], desc: '洗髓伐骨，脱胎换骨。' },
  玄龟甲功: { mult: 1.05, hpPct: 0.40, defPct: 0.38, spells: ['金刚罩'], desc: '玄龟负甲，刀枪难入。' },
  延寿经: { mult: 1.0, lifespan: 20, spells: ['甘霖咒'], desc: '静心延寿，颐养天年。' },
  回春功: { mult: 1.2, lifespan: 8, hpPct: 0.05, spells: ['枯木逢春'], desc: '枯木回春，气血渐旺。' },
  青囊诀: { mult: 1.15, lifespan: 12, sense: 1, spells: ['回春术'], desc: '青囊妙法，济世养身。' },
  凝神诀: { mult: 1.35, sense: 3, spells: ['定身术'], desc: '凝神静气，事半功倍。' },
  五禽戏: { mult: 1.15, hpPct: 0.08, defPct: 0.08, spd: 1, lifespan: 5, spells: ['战意诀'], desc: '五禽之戏，强身健骨。' },
  // —— 镇宗功法（灵品，各宗门藏经阁专属） ——
  青霄剑诀: { mult: 1.4, atkPct: 0.28, spd: 2, sect: '太乙剑宗', tier: 2, spells: ['御剑术', '剑气纵横'], desc: '剑意冲霄，无坚不摧。' },
  太清玉册: { mult: 1.6, sense: 3, sect: '玄清门', tier: 2, spells: ['掌心雷', '定身术'], desc: '太清正法，中正平和。' },
  阴阳和合功: { mult: 1.5, hpPct: 0.15, sect: '合欢宗', tier: 2, spells: ['甘霖咒'], desc: '阴阳相济，神完气足。' },
  血煞魔功: { mult: 1.9, atkPct: 0.18, sect: '血煞魔宗', tier: 2, spells: ['血祭大法'], desc: '血煞入体，杀伐速成。' },
  金刚降魔功: { mult: 1.5, hpPct: 0.25, defPct: 0.25, sect: '净禅寺', tier: 2, spells: ['金刚罩', '困神术'], desc: '金刚怒目，降魔护体。' },
  青木养气诀: { mult: 1.3, lifespan: 15, sense: 2, sect: '丹霞谷', tier: 2, spells: ['枯木逢春'], desc: '青木药气，养寿延年。' },
  九炼玄体功: { mult: 1.3, hpPct: 0.20, defPct: 0.20, sect: '天工坊', tier: 2, spells: ['战意诀'], desc: '九炼淬体，器修根基。' },
  符胆真经: { mult: 1.4, atkPct: 0.12, sense: 3, sect: '万符门', tier: 2, spells: ['困神术'], desc: '符胆藏神，一笔御敌。' },
  星罗阵诀: { mult: 1.5, hpPct: 0.10, sense: 3, sect: '太虚阵宗', tier: 2, spells: ['困神术'], desc: '星罗棋布，借阵护身。' },
  // —— 五行流派（灵品，坊市/藏经阁有售） ——
  庚金诀: { mult: 1.25, atkPct: 0.12, tier: 2, spells: ['御剑术'], desc: '金行功法，锐不可当。' },
  乙木经: { mult: 1.25, hpPct: 0.10, tier: 2, spells: ['回春术'], desc: '木行功法，生机绵长。' },
  离火诀: { mult: 1.25, atkPct: 0.12, tier: 2, spells: ['烈焰焚天'], desc: '火行功法，烈焰灼灼。' },
  碧波心法: { mult: 1.25, hpPct: 0.08, tier: 2, spells: ['甘霖咒'], desc: '水行功法，润泽万物。' },
  厚土功: { mult: 1.25, hpPct: 0.12, defPct: 0.15, tier: 2, spells: ['金刚罩'], desc: '土行功法，厚重如山。' },
  // —— 冷门流派（灵品，坊市/藏经阁有售） ——
  清音诀: { mult: 1.3, hpPct: 0.05, sense: 2, tier: 2, spells: ['天音破'], desc: '音修功法，余音绕梁。' },
  天籁真经: { mult: 1.5, hpPct: 0.15, sense: 3, tier: 2, spells: ['天音破'], desc: '天籁之音，震人心魄。' },
  傀儡真解: { mult: 1.3, atkPct: 0.08, tier: 2, spells: ['傀儡术'], desc: '傀修功法，操偶如臂。' },
  万傀大法: { mult: 1.5, atkPct: 0.15, tier: 2, spells: ['傀儡术'], desc: '万傀齐出，如臂使指。' },
  御兽心经: { mult: 1.3, hpPct: 0.08, tier: 2, spells: ['御兽突袭'], desc: '御兽之法，灵兽护身。' },
  万兽诀: { mult: 1.4, hpPct: 0.15, tier: 2, spells: ['御兽突袭'], desc: '万兽听令，莫敢不从。' },
  万毒真经: { mult: 1.4, atkPct: 0.15, tier: 2, spells: ['毒雾术'], desc: '毒修功法，百毒不侵。' },
  蛊心诀: { mult: 1.5, atkPct: 0.18, tier: 2, spells: ['万蛊噬心'], desc: '蛊术心法，噬心蚀骨。' },
  纯阳诀: { mult: 1.45, hpPct: 0.08, tier: 2, spells: ['烈焰焚天'], desc: '纯阳之体，百邪不侵。' },
  太阴炼神诀: { mult: 1.4, sense: 4, tier: 2, spells: ['摄魂术'], desc: '太阴炼神，神识大增。' },
  // —— 仙品（不售，仅残篇/奇遇可得） ——
  太虚引星诀: { mult: 2.8, atkPct: 0.22, sense: 4, tier: 3, spells: ['万剑归宗'], desc: '引星辰之力，无坚不摧。' },
  混沌归元功: { mult: 2.6, hpPct: 0.30, defPct: 0.30, tier: 3, spells: ['枯木逢春'], desc: '混沌归元，生生不息。' },
  造化长生经: { mult: 2.2, lifespan: 30, sense: 3, tier: 3, spells: ['甘霖咒'], desc: '造化加身，长生可期。' },
  混元一气功: { mult: 2.4, atkPct: 0.15, hpPct: 0.20, defPct: 0.15, tier: 3, spells: ['五雷轰顶'], desc: '混元一气，天地同力。' },
  无上剑经: { mult: 2.3, atkPct: 0.35, spd: 4, tier: 3, spells: ['万剑归宗'], desc: '无上剑道，一剑破万法。' },
};

// ---- 神通 / 法术 ----
// 数据量大，独立成库：见 content/spells.ts（效果组合 / 五行 / 灵气消耗 / 画面描写）。
export type { EffectKind, SpellEffect, SpellDef } from './content/spells.js';
export {
  SPELLS, SPELL_LV_MULT, SPELL_LV_COST, SPELL_MAX_LV, SPELL_TIER_NAMES, SPELL_LV_SUSTAIN,
  FATIGUE, spellPower, spellSustain, spellsOfTier, jadeSlipPrice,
} from './content/spells.js';

/** 主修功法进阶顺序（道统现世/宗门战争/宗主传承按此升级）。 */
export const TECH_ORDER = ['基础吐纳术', '青灵诀', '玄霜诀', '紫薇心经', '九转玄元功', '太上忘尘经'];

/** 功法功效摘要（展示用，含品阶前缀）。 */
export function techniqueSummary(name: string): string {
  const d = TECHNIQUES[name];
  if (!d) return '';
  const tier = ['', '', '灵品·', '仙品·'][d.tier ?? 1];
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const parts = [`修炼×${d.mult}`];
  if (d.atkPct) parts.push(`攻击+${pct(d.atkPct)}`);
  if (d.defPct) parts.push(`防御+${pct(d.defPct)}`);
  if (d.hpPct) parts.push(`气血+${pct(d.hpPct)}`);
  if (d.spd) parts.push(`遁速+${d.spd}`);
  if (d.sense) parts.push(`神识+${d.sense}`);
  if (d.lifespan) parts.push(`寿元+${d.lifespan}`);
  if (d.spells?.length) parts.push(`神通：${d.spells.join('/')}`);
  return tier + parts.join('，');
}

/** 习得功法：记录入库（不自动改修），结算一次性效果（寿元等仅首次生效），附带神通。 */
export function learnTechnique(p: Player, name: string): void {
  p.techProficiency ??= {};
  p.techProficiency[name] ??= 0; // 习得入库
  const def = TECHNIQUES[name];
  if (def?.lifespan && !p.mastered.includes(name)) {
    p.mastered.push(name);
    p.lifespan += def.lifespan;
  }
  if (def?.spells) {
    for (const s of def.spells) learnSpell(p, s);
  }
}

/** 切换主修功法（须已习得），返回是否成功。 */
export function switchTechnique(p: Player, name: string): boolean {
  if (!(name in (p.techProficiency ?? {}))) return false;
  p.technique = name;
  return true;
}

/** 主修功法提升一阶（按 TECH_ORDER），返回新功法名（已最高则 null）。 */
export function upgradeTechnique(p: Player): string | null {
  const cur = TECHNIQUES[p.technique]?.mult ?? 1;
  const next = TECH_ORDER.find((n) => (TECHNIQUES[n]?.mult ?? 0) > cur);
  if (!next) return null;
  learnTechnique(p, next);
  return next;
}

// ---- 功法熟练度（入门 → 小成 → 大成 → 圆满） ----
export const TECH_LEVELS = ['入门', '小成', '大成', '圆满'];

/** 熟练度 -> 层级下标（0-29 入门，30-59 小成，60-89 大成，90-100 圆满）。 */
export function techLevelOf(prof: number): number {
  if (prof >= 90) return 3;
  if (prof >= 60) return 2;
  if (prof >= 30) return 1;
  return 0;
}

/** 指定功法的熟练度倍率（层级越高功效越强）。 */
export function techPowerOf(p: Player, name: string): number {
  const prof = p.techProficiency?.[name] ?? 0;
  return [1, 1.15, 1.3, 1.5][techLevelOf(prof)];
}

/** 当前主修功法的熟练度倍率。 */
export function techPower(p: Player): number {
  return techPowerOf(p, p.technique);
}

/** 当前主修功法的熟练度层级名。 */
export function techLevelName(p: Player): string {
  const prof = p.techProficiency?.[p.technique] ?? 0;
  return TECH_LEVELS[techLevelOf(prof)];
}

/** 集齐多少篇残篇可参悟补全一部功法。 */
export const FRAGMENT_NEED = 3;

// ---- 丹药 ----
export type PillType = 'xiu' | 'heal' | 'break' | 'detox';

export interface PillDef {
  type: PillType;
  value: number;   // 修为丹效果值 / 疗伤丹回血「百分比」 / 解毒丹清除丹毒量
  price: number;
}

export const PILLS: Record<string, PillDef> = {
  凝气丹: { type: 'xiu', value: 40, price: 30 },
  聚灵丹: { type: 'xiu', value: 80, price: 80 },
  疗伤丹: { type: 'heal', value: 25, price: 20 },   // 回 25% 气血
  回春丹: { type: 'heal', value: 50, price: 60 },   // 回 50% 气血
  净元丹: { type: 'detox', value: 30, price: 120 },
  筑基丹: { type: 'break', value: 0, price: 200 },
  结丹丹: { type: 'break', value: 0, price: 600 },
  婴变丹: { type: 'break', value: 0, price: 1500 },
  化神丹: { type: 'break', value: 0, price: 4000 },
  炼虚丹: { type: 'break', value: 0, price: 8000 },
  合体丹: { type: 'break', value: 0, price: 15000 },
  大乘丹: { type: 'break', value: 0, price: 25000 },
  渡劫丹: { type: 'break', value: 0, price: 50000 },
};

/** 丹毒对修炼效率的惩罚倍率（30/60/90 三档阈值，无丹毒为 1）。 */
export function toxinPenalty(p: Player): number {
  const t = p.pillToxin ?? 0;
  if (t >= 90) return 0.5;
  if (t >= 60) return 0.75;
  if (t >= 30) return 0.9;
  return 1;
}

// ---- 材料（名称 -> 单价） ----
export const MATERIALS: Record<string, number> = {
  灵草: 10,
  灵花: 30,
  妖兽内丹: 80,
  灵石精: 200,
};

// ---- 收入随境界等比缩放（锚定突破丹价格，使「打赢 ~5 场 ≈ 一颗突破丹」恒定） ----
// 与战力曲线同量级（每境约 ×2.2），否则后期打一场架的收益追不上一颗丹的价钱。
export const INCOME_SCALE = [1, 2.2, 5, 11, 24, 53, 116, 256, 563]; // 按 realmIdx

export function incomeScale(realmIdx: number): number {
  return INCOME_SCALE[Math.min(realmIdx, INCOME_SCALE.length - 1)] ?? 1;
}

/**
 * 按境界缩放后的灵石收益——**永远取整**。
 *
 * 灵石是可数的东西，不该出现半块。INCOME_SCALE 里有 2.2 这样的小数，
 * 直接 `randint(20,60) * incomeScale()` 会得到 103.4，几十笔攒下来就是
 * 面板上那句「灵石：345.4000000000001」（IEEE 754 的老毛病）。
 * 一切灵石进项都从这里过一道，别在调用点各写各的 Math.round。
 */
export function spiritGain(base: number, realmIdx: number): number {
  return Math.round(base * incomeScale(realmIdx));
}

// ---- 洞府 / 灵脉 ----
// 修炼快慢主要不看你是谁，看你在哪修——「找洞府、抢灵脉」因此才是玩法目标，不是装饰。
export interface AbodeDef {
  name: string;
  speed: number;   // 闭关效率百分比，100 = 基准
  desc: string;
  price?: number;  // 坊市地契价（缺省＝不售，只能靠机缘/宗门/剧情）
}

export const ABODES: AbodeDef[] = [
  { name: '山中茅舍', speed: 100, desc: '寻常居所，灵气与山野等同。' },
  { name: '坊市洞府', speed: 150, desc: '依坊市灵脉余泽凿山而成，吐纳略胜山野。', price: 800 },
  { name: '灵脉支洞', speed: 250, desc: '一道灵脉支流自洞底穿过，闭关如饮甘泉。', price: 5000 },
  { name: '上品灵脉', speed: 400, desc: '整条灵脉尽归一人，山门为之侧目。', price: 30000 },
  { name: '龙脉之地', speed: 700, desc: '地气如龙盘踞，凡俗久居必疯，修士视若性命。', price: 200000 },
  { name: '洞天福地', speed: 1000, desc: '自成一方小天地，洞中一日，人间旬月。' },
];

export function abodeOf(name: string): AbodeDef {
  return ABODES.find((a) => a.name === name) ?? ABODES[0];
}

/** 当前法宝品阶（无法宝为 0）。品阶取代了旧的「比攻击高低」。 */
export function treasureTier(p: Player): number {
  return TREASURES[p.treasure]?.tier ?? 0;
}

/** 比现有法宝更高一阶的法宝名列表（拍卖/掉落/剧情赠予都用它挑）。 */
export function betterTreasures(p: Player): string[] {
  const cur = treasureTier(p);
  return Object.keys(TREASURES).filter((t) => TREASURES[t].tier > cur);
}

/** 法宝功效摘要（展示用）。 */
export function treasureSummary(name: string): string {
  const d = TREASURES[name];
  if (!d) return '';
  const parts = [`攻+${Math.round(d.atkPct * 100)}%`, `防+${Math.round(d.defPct * 100)}%`];
  if (d.spd) parts.push(`遁速+${d.spd}`);
  return parts.join(' ');
}

// ---- 结丹：金丹的「型」与「品」 ----
// 型由本命五行定，品由灵根纯度定——开局那次灵根测定，在两百年后又兑现了一次。
export interface CoreTypeDef { name: string; element: Element; desc: string }

export const CORE_TYPES: Record<Element, CoreTypeDef> = {
  金: { name: '庚金丹', element: '金', desc: '丹上有纹如刃，转动时室内器物齐鸣。' },
  木: { name: '青元丹', element: '木', desc: '丹色青碧，凑近闻得见雨后草木的气味。' },
  水: { name: '玄溟丹', element: '水', desc: '丹面终年蒙一层薄霜，握在掌心不化。' },
  火: { name: '赤离丹', element: '火', desc: '丹心一点红，像隔着一层纸看远处的灯。' },
  土: { name: '厚黄丹', element: '土', desc: '丹身沉坠，托在手上比同大的铁还压手。' },
};

/** 灵根纯度决定金丹品质上限：天灵根可结九品，五灵根封顶三品。 */
export function coreQualityCap(purity: number): number {
  if (purity >= 0.75) return 9;
  if (purity >= 0.55) return 7;
  if (purity >= 0.40) return 5;
  if (purity >= 0.30) return 4;
  return 3;
}

/** 金丹品质带来的永久增益：每一品 +5% 气血，四品起每回合多聚灵气。 */
export function coreBonus(quality: number): { hpPct: number; qi: number } {
  const q = Math.max(0, Math.min(9, quality));
  return { hpPct: q * 0.05, qi: q >= 7 ? 2 : q >= 4 ? 1 : 0 };
}

export const CORE_QUALITY_NAMES = ['', '一品', '二品', '三品', '四品', '五品', '六品', '七品', '八品', '九品'];

// ---- 元婴：灵机引擎（战斗资源循环，一次性抉择） ----
export interface YuanyingDef {
  name: string;
  kind: 'qi' | 'regen' | 'shield' | 'ward' | 'thorn' | 'surge';
  value: number;
  desc: string;
}

export const YUANYING_VISIONS: YuanyingDef[] = [
  { name: '灵潮', kind: 'qi', value: 2, desc: '回合结束时多聚 2 点灵气——神通接得上，才谈得上连招。' },
  { name: '春生', kind: 'regen', value: 4, desc: '回合结束时回复 4% 气血——耗得起，就熬得过。' },
  { name: '玄壳', kind: 'shield', value: 25, desc: '每场战斗首回合自结 25% 气血的护罩。' },
  { name: '神御', kind: 'ward', value: 3, desc: '每三个回合免疫一次伤害——总有一刀砍在空处。' },
  { name: '反照', kind: 'thorn', value: 18, desc: '受击时反弹 18% 伤害，全场持续。' },
  { name: '锋锐', kind: 'surge', value: 20, desc: '每回合第一式神通威力 +20%。' },
];

// ---- 化神：入道流派（专属被动 + 专属仙法） ----
export interface DaoPathDef {
  name: string;
  element?: Element;   // 五行入道：本系神通威力大增
  spell: string;       // 专属仙法（入道即得）
  desc: string;
}

export const DAO_PATHS: DaoPathDef[] = [
  { name: '以金入道', element: '金', spell: '天罡剑域', desc: '金系神通威力 +30%，出手先声夺人。' },
  { name: '以木入道', element: '木', spell: '万蕊化生', desc: '木系神通威力 +30%，回合结束时自愈 3% 气血。' },
  { name: '以水入道', element: '水', spell: '归墟', desc: '水系神通威力 +30%，受到的伤害 −10%。' },
  { name: '以火入道', element: '火', spell: '焚天劫火', desc: '火系神通威力 +30%，火系必附一层灼烧。' },
  { name: '以土入道', element: '土', spell: '须弥山', desc: '土系神通威力 +30%，护罩效果 +50%。' },
  { name: '以剑入道', spell: '万剑归宗', desc: '普通攻击威力 +60%，每回合首击必附剑气。' },
  { name: '以体入道', spell: '金身不坏', desc: '气血 +40%，防御 +25%——道理讲不通时，肉身就是道理。' },
  { name: '以神入道', spell: '摄魂术', desc: '神识 +6，命中与破隐大增，敌方定身多持续一回合。' },
  { name: '以气入道', spell: '归元诀', desc: '灵气上限 +6，每回合多回 2 点——你比谁都撑得久。' },
];

/** 化神入道给的固定加成（战斗与属性两处都读它）。 */
export function daoPathOf(name: string | null | undefined): DaoPathDef | undefined {
  return name ? DAO_PATHS.find((d) => d.name === name) : undefined;
}

// ---- 炼丹配方（成品 -> {材料 -> 数量}） ----
export const RECIPES: Record<string, Record<string, number>> = {
  凝气丹: { 灵草: 2 },
  聚灵丹: { 灵草: 3, 灵花: 1 },
  疗伤丹: { 灵草: 1 },
  回春丹: { 灵花: 2 },
  净元丹: { 灵花: 1, 灵草: 2 },
  筑基丹: { 妖兽内丹: 1, 灵花: 2 },
  结丹丹: { 妖兽内丹: 2, 灵石精: 1 },
  婴变丹: { 妖兽内丹: 4, 灵石精: 2 },
};

// ---- 法宝（名称 -> 属性与价格，纯装备：被动加攻/防） ----
// 加成用百分比：一柄剑在炼气期是天、在化神期是噪声，这种事在指数曲线下必须避免。
export interface TreasureDef {
  tier: number;     // 品阶，缴获时按此比高低（数值可比，语义也可读）
  atkPct: number;   // 攻击加成 %
  defPct: number;   // 防御加成 %
  spd?: number;     // 遁速加成（定值）
  price: number;    // 售价（灵石，按境界收入等比缩放前的基准价）
}

export const TREASURES: Record<string, TreasureDef> = {
  松纹剑: { tier: 1, atkPct: 0.10, defPct: 0.04, price: 120 },
  赤鳞刀: { tier: 2, atkPct: 0.18, defPct: 0.06, price: 350 },
  寒玉剑: { tier: 3, atkPct: 0.26, defPct: 0.10, price: 900 },
  流光梭: { tier: 4, atkPct: 0.30, defPct: 0.08, spd: 3, price: 1800 },
  惊雷鞭: { tier: 5, atkPct: 0.38, defPct: 0.14, price: 2500 },
  玄龟盾: { tier: 6, atkPct: 0.12, defPct: 0.45, price: 4000 },
  云海扇: { tier: 7, atkPct: 0.50, defPct: 0.20, spd: 2, price: 7000 },
  九幽幡: { tier: 8, atkPct: 0.62, defPct: 0.24, price: 12000 },
  太虚剑: { tier: 9, atkPct: 0.75, defPct: 0.30, spd: 3, price: 25000 },
  混天珠: { tier: 10, atkPct: 0.90, defPct: 0.45, spd: 4, price: 60000 },
};

// ---- 四艺副业技能名（需机缘解锁） ----
export const SKILLS = ['炼丹', '炼器', '阵法', '符箓'] as const;

// ---- 炼器配方（成品法宝 -> {材料 -> 数量}） ----
export const FORGE_RECIPES: Record<string, Record<string, number>> = {
  松纹剑: { 妖兽内丹: 1, 灵石精: 1 },
  赤鳞刀: { 妖兽内丹: 2, 灵石精: 1 },
  寒玉剑: { 妖兽内丹: 3, 灵石精: 2 },
  流光梭: { 妖兽内丹: 4, 灵石精: 2 },
  惊雷鞭: { 妖兽内丹: 5, 灵石精: 3 },
  玄龟盾: { 妖兽内丹: 6, 灵石精: 4 },
  云海扇: { 妖兽内丹: 8, 灵石精: 5 },
  九幽幡: { 妖兽内丹: 11, 灵石精: 7 },
  太虚剑: { 妖兽内丹: 15, 灵石精: 10 },
  混天珠: { 妖兽内丹: 22, 灵石精: 15 },
};

// ---- 阵法（名称 -> 定义） ----
export interface FormationDef {
  cost: Record<string, number>; // 布阵消耗材料
  desc: string;
  atkPct: number;  // 攻击加成 %
  defPct: number;  // 防御加成 %
  cult: number;    // 修炼倍率加成（1 = 无加成）
}

export const FORMATIONS: Record<string, FormationDef> = {
  聚灵阵: { cost: { 灵草: 3 }, desc: '修炼速度 +20%', atkPct: 0, defPct: 0, cult: 1.2 },
  铁壁阵: { cost: { 妖兽内丹: 2 }, desc: '防御 +25%', atkPct: 0, defPct: 0.25, cult: 1.0 },
  七杀阵: { cost: { 妖兽内丹: 3, 灵石精: 2 }, desc: '攻击 +25%', atkPct: 0.25, defPct: 0, cult: 1.0 },
};

// ---- 符箓（名称 -> 定义） ----
// 战斗用符的效果一律按百分比计，否则后期全成废纸。
export interface TalismanDef {
  cost: Record<string, number>; // 制符消耗材料
  type: 'atk' | 'def' | 'cult'; // 攻击符 / 护身符 / 聚灵符
  value: number;                // atk=攻击的百分比，def=最大气血的百分比，cult=修为定值
  desc: string;
}

export const TALISMANS: Record<string, TalismanDef> = {
  烈焰符: { cost: { 灵花: 1, 灵草: 1 }, type: 'atk', value: 120, desc: '战斗中造成 120% 攻击的伤害' },
  护身符: { cost: { 灵草: 2 }, type: 'def', value: 30, desc: '战斗中恢复 30% 气血' },
  聚灵符: { cost: { 灵草: 3, 灵花: 1 }, type: 'cult', value: 15, desc: '修炼时修为 +15' },
};

// ---- 角色设定（主角模板，决定修炼倍率与天赋点预算） ----
export interface ArchetypeDef {
  name: string;
  desc: string;
  cheatBonus: number; // 修炼倍率
  budget: number;     // 起始天赋点
}

export const ARCHETYPES: ArchetypeDef[] = [
  { name: '天命主角', desc: '命定之子，气运加身，诸事顺遂。', cheatBonus: 1.3, budget: 20 },
  { name: '龙傲天', desc: '天之骄子，天资绝世，一路碾压。', cheatBonus: 1.5, budget: 16 },
  { name: '异世傲天', desc: '怀揣异宝穿越而来的天命之子。', cheatBonus: 1.8, budget: 12 },
  { name: '红尘众生', desc: '芸芸众生中的平凡一人，一步一个脚印。', cheatBonus: 1.0, budget: 30 },
];

// ---- 出身标签 ----
// 「儿时/青年经历」靠标签与出生对齐：孤儿没有家世可败落，也不会有婚约可退。
// 先天项（资质/体质/灵根）与出身无关，不参与过滤。
export type OriginTag =
  | '孤儿'   // 无父无母
  | '有家'   // 有家族/亲长
  | '富庶'   // 家中有产
  | '清贫'   // 家中无产
  | '书香'   // 识文断字
  | '武门'   // 习武传家
  | '仙门'   // 沾亲带故的修仙门第
  | '魔道'   // 自幼浸染魔气
  | '市井'   // 长于城镇集市
  | '山野';  // 长于山林水泽

// ---- 开局天赋（天赋点加点，cost 负=花费、正=返还） ----
export interface Talent {
  name: string;
  desc: string;
  cost: number;             // 负=花费天赋点，正=返还天赋点
  needTags?: OriginTag[];   // 出身需命中任一标签，方可选择（缺省=不限）
  banTags?: OriginTag[];    // 出身命中任一标签即不可选
  apply: (p: Player) => void;
}

/** 按出身筛出可选的经历。cost 为 0 的中性缺省项必须对所有出身成立。 */
export function talentsFor(list: Talent[], origin: OriginDef): Talent[] {
  return list.filter((t) => {
    if (t.banTags?.some((g) => origin.tags.includes(g))) return false;
    if (t.needTags && !t.needTags.some((g) => origin.tags.includes(g))) return false;
    return true;
  });
}

/** 灵根花费（沿用 ROOTS，cost 负=花费、正=返还）。 */
export const ROOT_COSTS: Record<string, number> = {
  天灵根: -14,
  异灵根: -8,
  双灵根: -4,
  三灵根: 0,
  四灵根: 3,
  五灵根: 5,
};

/** 资质（→ aptitude 修炼倍率）。 */
export const TALENT_APTITUDES: Talent[] = [
  { name: '天纵之才', desc: '资质绝世，修炼 ×1.5。', cost: -8, apply: (p) => { p.aptitude = 1.5; } },
  { name: '惊才绝艳', desc: '资质上上，修炼 ×1.4。', cost: -6, apply: (p) => { p.aptitude = 1.4; } },
  { name: '资质上佳', desc: '资质优秀，修炼 ×1.25。', cost: -4, apply: (p) => { p.aptitude = 1.25; } },
  { name: '中上之姿', desc: '略胜常人，修炼 ×1.12。', cost: -2, apply: (p) => { p.aptitude = 1.12; } },
  { name: '中人之姿', desc: '资质寻常，修炼 ×1.0。', cost: 0, apply: (p) => { p.aptitude = 1.0; } },
  { name: '资质平平', desc: '资质略逊，修炼 ×0.9。', cost: 2, apply: (p) => { p.aptitude = 0.9; } },
  { name: '资质驽钝', desc: '资质驽钝，修炼 ×0.82。', cost: 5, apply: (p) => { p.aptitude = 0.82; } },
  { name: '资质愚钝', desc: '资质愚钝，修炼 ×0.72。', cost: 8, apply: (p) => { p.aptitude = 0.72; } },
  { name: '天生废柴', desc: '毫无资质，修炼 ×0.6。', cost: 12, apply: (p) => { p.aptitude = 0.6; } },
];

/** 先天体质（→ 气血 / 修炼 / 寿元 / 心境）。 */
export const TALENT_BODIES: Talent[] = [
  { name: '无特殊体质', desc: '凡胎俗骨，无甚特异。', cost: 0, apply: () => {} },
  { name: '先天道体', desc: '天生近道，修炼 +10%。', cost: -3, apply: (p) => { p.aptitude *= 1.1; } },
  { name: '神魔血脉', desc: '血脉磅礴，气血 +30。', cost: -5, apply: (p) => { p.maxHp += 30; } },
  { name: '龙族血脉', desc: '真龙遗脉，气血 +15、寿元 +30。', cost: -7, apply: (p) => { p.maxHp += 15; p.lifespan += 30; } },
  { name: '冰灵圣体', desc: '冰肌玉骨，气血 +10、心境 +5。', cost: -4, apply: (p) => { p.maxHp += 10; p.heart = Math.min(100, p.heart + 5); } },
  { name: '混沌之体', desc: '混沌初开，修炼 +15%、气血 -10。', cost: -5, apply: (p) => { p.aptitude *= 1.15; p.maxHp -= 10; } },
  { name: '纯阳之体', desc: '至阳之躯，心境 +10。', cost: -4, apply: (p) => { p.heart = Math.min(100, p.heart + 10); } },
  { name: '玄阴绝脉', desc: '阴脉闭塞，修炼 -10%。', cost: 3, apply: (p) => { p.aptitude *= 0.9; } },
  { name: '孱弱多病', desc: '体弱多病，气血 -15。', cost: 5, apply: (p) => { p.maxHp -= 15; } },
  { name: '病入膏肓', desc: '沉疴缠身，气血 -30、寿元 -20。', cost: 9, apply: (p) => { p.maxHp -= 30; p.lifespan -= 20; } },
];

/** 儿时经历（→ 寿元 / 心境 / 气血 / 材料 / 修为）。needTags/banTags 与「角色出生」对齐。 */
export const TALENT_CHILDHOODS: Talent[] = [
  { name: '童年寻常', desc: '童年无甚可记之事。', cost: 0, apply: () => {} },
  { name: '无忧童年', desc: '亲长庇荫，安稳无忧，心境 +6。', cost: -1, banTags: ['孤儿', '清贫', '魔道'], apply: (p) => { p.heart = Math.min(100, p.heart + 6); } },
  { name: '道心坚定', desc: '自幼向道，心境 +10。', cost: -2, apply: (p) => { p.heart = Math.min(100, p.heart + 10); } },
  { name: '神奇温泉', desc: '幼年得温泉淬体，气血 +8。', cost: -2, apply: (p) => { p.maxHp += 8; } },
  { name: '诗书启蒙', desc: '幼读经史，心境 +8。', cost: -2, needTags: ['书香', '富庶', '仙门'], apply: (p) => { p.heart = Math.min(100, p.heart + 8); } },
  { name: '祠堂罚跪', desc: '犯错常跪祠堂，跪出一副硬骨（心境 +5、气血 +2）。', cost: -1, needTags: ['有家', '书香', '仙门'], apply: (p) => { p.heart = Math.min(100, p.heart + 5); p.maxHp += 2; } },
  { name: '习武打熬', desc: '幼年起打熬筋骨，气血 +15。', cost: -3, apply: (p) => { p.maxHp += 15; } },
  { name: '仙人指路', desc: '幼年得异人指点，修为 +15。', cost: -3, apply: (p) => { p.cultivation = Math.min(100, p.cultivation + 15); } },
  { name: '神秘绿瓶', desc: '捡到一只绿瓶，可催熟灵药（灵草×3）。', cost: -2, apply: (p) => { p.materials['灵草'] = (p.materials['灵草'] ?? 0) + 3; } },
  { name: '灵田杂役', desc: '替人看守灵田，识得百样灵苗（灵草×2、心境 +3）。', cost: -2, needTags: ['孤儿', '清贫', '山野'], apply: (p) => { p.materials['灵草'] = (p.materials['灵草'] ?? 0) + 2; p.heart = Math.min(100, p.heart + 3); } },
  { name: '山中野养', desc: '与山兽为伍，耳聪目明、皮实耐打（气血 +10）。', cost: -2, needTags: ['孤儿', '山野'], apply: (p) => { p.maxHp += 10; } },
  { name: '魔窟长成', desc: '在魔窟的刀口下活了下来（气血 +12、心境 -8）。', cost: -2, needTags: ['魔道'], apply: (p) => { p.maxHp += 12; p.heart = Math.max(0, p.heart - 8); } },
  { name: '青梅竹马', desc: '有青梅竹马相伴，心境 +5。', cost: -1, apply: (p) => { p.heart = Math.min(100, p.heart + 5); } },
  { name: '家道中落', desc: '幼年家道中落（灵石 -50、心境 +5）。', cost: 1, needTags: ['有家'], banTags: ['清贫'], apply: (p) => { p.spirit = Math.max(0, p.spirit - 50); p.heart = Math.min(100, p.heart + 5); } },
  { name: '乞食街头', desc: '街头讨生，阅人无数（气血 -8、心境 +8）。', cost: 2, needTags: ['孤儿', '清贫', '市井'], apply: (p) => { p.maxHp -= 8; p.heart = Math.min(100, p.heart + 8); } },
  { name: '逃荒饥寒', desc: '逃荒途中九死一生（气血 -5、心境 +10）。', cost: 3, banTags: ['富庶', '仙门'], apply: (p) => { p.maxHp -= 5; p.heart = Math.min(100, p.heart + 10); } },
  { name: '大病一场', desc: '幼年重病，寿元 -15。', cost: 4, apply: (p) => { p.lifespan -= 15; } },
];

/** 青年经历（→ 功法熟练 / 神通 / 法宝 / 灵石 / 副业 / 心境）。needTags/banTags 与「角色出生」对齐。 */
export const TALENT_YOUTHS: Talent[] = [
  { name: '平淡无奇', desc: '青年时代波澜不惊。', cost: 0, apply: () => {} },
  { name: '初窥门径', desc: '早得仙缘，起始功法熟练度 +30。', cost: -3, apply: (p) => { p.techProficiency[p.technique] = Math.min(100, (p.techProficiency[p.technique] ?? 0) + 30); } },
  { name: '后山奇遇', desc: '后山得宝，获松纹剑一柄。', cost: -4, apply: (p) => { if (p.treasure === '无') p.treasure = '松纹剑'; } },
  { name: '得授神通', desc: '机缘之下习得一式神通（冰锥术）。', cost: -4, apply: (p) => { learnSpell(p, '冰锥术'); } },
  { name: '游历四方', desc: '云游四海，灵石 +200、灵草 ×2。', cost: -4, apply: (p) => { p.spirit += 200; p.materials['灵草'] = (p.materials['灵草'] ?? 0) + 2; } },
  { name: '拜入散修', desc: '曾得散修指点，通晓炼丹之术。', cost: -3, apply: (p) => { if (!p.skills.includes('炼丹')) p.skills.push('炼丹'); } },
  { name: '商队历练', desc: '随商队跑商，灵石 +300。', cost: -3, apply: (p) => { p.spirit += 300; } },
  { name: '佣兵刀口', desc: '替人卖命换灵石（气血 +8、灵石 +150、心境 -3）。', cost: -3, needTags: ['孤儿', '清贫', '武门', '市井'], apply: (p) => { p.maxHp += 8; p.spirit += 150; p.heart = Math.max(0, p.heart - 3); } },
  { name: '护法血役', desc: '为魔宗执过几年刑（气血 +10、灵石 +200、心境 -10）。', cost: -3, needTags: ['魔道'], apply: (p) => { p.maxHp += 10; p.spirit += 200; p.heart = Math.max(0, p.heart - 10); } },
  { name: '潜心苦修', desc: '闭关苦修，修为 +20。', cost: -3, apply: (p) => { p.cultivation = Math.min(100, p.cultivation + 20); } },
  { name: '街头卖艺', desc: '卖艺糊口，身法灵便（气血 +3、灵石 +100）。', cost: -2, needTags: ['孤儿', '清贫', '市井'], apply: (p) => { p.maxHp += 3; p.spirit += 100; } },
  { name: '轻功高手', desc: '身手矫健，气血 +5、灵石 +50。', cost: -2, apply: (p) => { p.maxHp += 5; p.spirit += 50; } },
  { name: '卷入纷争', desc: '卷入江湖纷争（心境 -5、灵石 +150）。', cost: 1, apply: (p) => { p.heart = Math.max(0, p.heart - 5); p.spirit += 150; } },
  { name: '情伤难愈', desc: '为情所伤（心境 -15、气血 +5）。', cost: 2, apply: (p) => { p.heart = Math.max(0, p.heart - 15); p.maxHp += 5; } },
  { name: '惨遭退婚', desc: '遭人退婚，心境 -10。', cost: 2, needTags: ['有家', '富庶', '书香', '仙门'], apply: (p) => { p.heart = Math.max(0, p.heart - 10); } },
  { name: '守灵三年', desc: '为亲长守灵三年，误了修行（心境 +10、气血 -5）。', cost: 2, needTags: ['有家'], apply: (p) => { p.heart = Math.min(100, p.heart + 10); p.maxHp -= 5; } },
];

// ---- 主线事件链 ----
// 已重构至 content/story.ts（StoryNode 节点库 + core/storyline.ts 调度器）：
// 触发窗（年龄/境界）、flag 前置互斥、错过反馈、大事记一应在彼处。

// ---- 出身 ----
export interface OriginDef {
  name: string;
  desc: string;
  spirit: number;
  technique: string;
  hpBonus: number;
  heart: number;
  pill?: string;       // 开局赠送丹药
  cost: number;        // 天赋点花费（负=花费、正=返还）
  tags: OriginTag[];   // 出身标签，决定可选的儿时/青年经历
}

export const ORIGINS: OriginDef[] = [
  { name: '山村孤儿', desc: '自幼孤苦，历尽冷暖，心智坚韧。', spirit: 0, technique: '基础吐纳术', hpBonus: 0, heart: 60, cost: 0, tags: ['孤儿', '清贫', '山野'] },
  { name: '商贾之家', desc: '家财万贯，灵石富足。', spirit: 600, technique: '基础吐纳术', hpBonus: 0, heart: 50, cost: -6, tags: ['有家', '富庶', '市井'] },
  { name: '修仙世家旁支', desc: '没落世家，祖传一卷功法。', spirit: 100, technique: '青灵诀', hpBonus: 0, heart: 55, cost: -6, tags: ['有家', '仙门', '书香'] },
  { name: '猎户之子', desc: '自幼狩猎，体魄强健。', spirit: 50, technique: '基础吐纳术', hpBonus: 8, heart: 50, cost: -3, tags: ['有家', '清贫', '山野', '武门'] },
  { name: '书香门第', desc: '诗书传家，悟性不俗，家藏凝气丹。', spirit: 80, technique: '基础吐纳术', hpBonus: 0, heart: 68, pill: '凝气丹', cost: -4, tags: ['有家', '书香', '富庶'] },
  { name: '医家传人', desc: '悬壶济世，通晓药性，随身疗伤丹。', spirit: 60, technique: '基础吐纳术', hpBonus: 0, heart: 72, pill: '疗伤丹', cost: -3, tags: ['有家', '书香', '市井'] },
  { name: '没落贵族', desc: '家道中落，心有不甘，祖传青灵诀。', spirit: 150, technique: '青灵诀', hpBonus: 0, heart: 45, cost: -7, tags: ['有家', '富庶', '书香'] },
  { name: '镖局之后', desc: '自幼习武，体魄过人。', spirit: 120, technique: '基础吐纳术', hpBonus: 12, heart: 50, cost: -4, tags: ['有家', '武门', '市井'] },
  { name: '山野牧童', desc: '放牛南山，心性纯良。', spirit: 30, technique: '基础吐纳术', hpBonus: 5, heart: 58, cost: -2, tags: ['有家', '清贫', '山野'] },
  { name: '流民乞儿', desc: '阅尽人间冷暖，心智异常坚韧。', spirit: 0, technique: '基础吐纳术', hpBonus: -5, heart: 78, cost: 3, tags: ['孤儿', '清贫', '市井'] },
  { name: '渔家子弟', desc: '江上渔家，水性极佳。', spirit: 40, technique: '基础吐纳术', hpBonus: 6, heart: 52, cost: -2, tags: ['有家', '清贫', '山野'] },
  { name: '游方艺人之后', desc: '戏班杂耍出身，见多识广。', spirit: 60, technique: '基础吐纳术', hpBonus: 3, heart: 60, cost: -2, tags: ['有家', '清贫', '市井'] },
  { name: '魔门弃婴', desc: '被魔宗长老捡回的弃婴，浸染魔气。', spirit: 100, technique: '基础吐纳术', hpBonus: 0, heart: 35, cost: -2, tags: ['孤儿', '魔道'] },
  { name: '魔修之后', desc: '父母皆魔修，自幼修习魔功。', spirit: 150, technique: '基础吐纳术', hpBonus: 5, heart: 30, cost: 1, tags: ['有家', '魔道'] },
  { name: '乱葬岗弃婴', desc: '生于乱葬岗，命格奇诡，阴气入体。', spirit: 0, technique: '基础吐纳术', hpBonus: -3, heart: 65, cost: 2, tags: ['孤儿', '清贫'] },
  { name: '邪修养子', desc: '被邪修养大，通晓旁门左道。', spirit: 80, technique: '基础吐纳术', hpBonus: 2, heart: 40, cost: -1, tags: ['孤儿', '魔道'] },
];

// ---- 宗门 ----
export interface SectDef {
  name: string;
  desc: string;
  bonus: string;         // 效果描述
  trait: string;         // 宗门特质（名——效果）
  rule: string;          // 门规（风味）
  traitKey?: 'battleHeart' | 'breakLossHalf' | 'battleLoot' | 'craftRefund'; // 实装的特质效果
  atkPct?: number;       // 攻击 +%
  breakBonus?: number;   // 突破成功率调整
  dualBonus?: number;    // 双修修炼加成（默认 0.2）
  exploreBonus?: number; // 游历机缘概率 +
  cultPct?: number;      // 修炼速度 +
  heartBonus?: number;   // 初始心境调整（仅开局生效）
  skill?: string;        // 入宗即掌握的副业
  craftBonus?: number;   // 对应副业成功率 +
  minRealm?: number;     // 加入门槛：最低大境界下标
  needDao?: boolean;     // 加入门槛：需与红颜结为道侣
  joinFee?: number;      // 加入缴纳灵石
  demonResist?: boolean; // 突破失败代价减半
  technique?: string;   // 镇宗功法（仅本宗藏经阁可兑换）
}

export const SECTS: SectDef[] = [
  { name: '散修', desc: '无门无派，逍遥天地。', bonus: '游历机缘概率提升', trait: '逍遥自在——天地任我行。', rule: '无门规约束，只凭本心。', exploreBonus: 0.15 },
  { name: '丹霞谷', desc: '丹道圣地，药香满谷。', bonus: '入宗即通炼丹，炼丹成功率 +10%', trait: '药香满谷——炼丹失败退还半数材料。', rule: '丹方乃宗门之秘，不得外传。', skill: '炼丹', craftBonus: 0.1, joinFee: 300, traitKey: 'craftRefund', technique: '青木养气诀' },
  { name: '天工坊', desc: '百炼成器，匠心通神。', bonus: '入宗即通炼器，炼器成功率 +10%', trait: '匠心独运——炼器失败退还半数材料。', rule: '匠人不许偷工减料。', skill: '炼器', craftBonus: 0.1, joinFee: 300, traitKey: 'craftRefund', technique: '九炼玄体功' },
  { name: '万符门', desc: '符箓传家，一笔通神。', bonus: '入宗即通符箓，制符成功率 +10%', trait: '笔走龙蛇——制符失败退还半数材料。', rule: '符箓之术，严禁私授外人。', skill: '符箓', craftBonus: 0.1, joinFee: 300, traitKey: 'craftRefund', technique: '符胆真经' },
  { name: '太虚阵宗', desc: '阵法通玄，借天地之力。', bonus: '入宗即通阵法，修炼速度 +10%', trait: '借天地之力——阵道引灵，修炼增速。', rule: '阵图不可私藏。', skill: '阵法', cultPct: 0.1, joinFee: 300, technique: '星罗阵诀' },
  { name: '净禅寺', desc: '佛门清净，明心见性。', bonus: '初始心境 +20，突破失败代价减半', trait: '明心见性——突破失败代价减半。', rule: '戒杀生，戒妄语。', heartBonus: 20, demonResist: true, technique: '金刚降魔功' },
  { name: '太乙剑宗', desc: '以剑入道，杀伐果决。', bonus: '战斗攻击 +20%', trait: '剑心通明——战斗胜利心境 +1。', rule: '剑在人在，不得弃剑。', atkPct: 0.2, minRealm: 1, traitKey: 'battleHeart', technique: '青霄剑诀' },
  { name: '玄清门', desc: '玄门正宗，中正平和。', bonus: '突破成功率 +10%', trait: '道基稳固——突破失败修为损失减半。', rule: '清修守正，不涉魔道。', breakBonus: 0.1, minRealm: 1, traitKey: 'breakLossHalf', technique: '太清玉册' },
  { name: '血煞魔宗', desc: '魔道宗门，杀伐速成。', bonus: '修炼 +15%、攻击 +10%，突破成功率 −5%', trait: '杀伐证道——战斗胜利灵石 +20%。', rule: '强者为尊，败者退避。', cultPct: 0.15, atkPct: 0.1, breakBonus: -0.05, minRealm: 1, traitKey: 'battleLoot', technique: '血煞魔功' },
  { name: '合欢宗', desc: '阴阳双修，道侣相济。', bonus: '双修修炼加成 +30%', trait: '阴阳相济——道侣合修，进境翻倍。', rule: '道侣之事，须两厢情愿。', dualBonus: 0.5, needDao: true, technique: '阴阳和合功' },
];

/** 当前宗门定义（未知宗门返回 undefined）。 */
export function sectOf(p: Player): SectDef | undefined {
  return SECTS.find((s) => s.name === p.sect);
}

// ---- 宗门职阶（贡献 + 修为双门槛晋升，职阶越高宗门效果越强） ----
export const SECT_RANKS = ['外门弟子', '内门弟子', '真传弟子', '长老'];
export const SECT_RANK_NEED = [0, 100, 300, 600]; // 晋升所需累计贡献
export const SECT_RANK_POWER = [1, 1.25, 1.5, 2]; // 宗门效果倍率
export const SECT_RANK_REALM = [0, 1, 2, 3]; // 晋升所需最低大境界下标（外门炼气/内门筑基/真传结丹/长老元婴）

/** 当前职阶的宗门效果倍率（散修恒为 1）。 */
export function sectPower(p: Player): number {
  if (p.sect === '散修') return 1;
  const rank = Math.min(p.sectRank ?? 0, SECT_RANK_POWER.length - 1);
  return SECT_RANK_POWER[rank];
}

// ---- 命运剧本（开局背景，决定序章剧情与起始加成） ----
export interface ScenarioDef {
  name: string;
  tagline: string;       // 一句话定位
  intro: string[];       // 序章剧情（逐句旁白）
  hook: string;          // 专属开局伏笔
}

export const SCENARIOS: ScenarioDef[] = [
  {
    name: '天命凡骨', tagline: '生而平凡，逆天改命',
    intro: [
      '测灵根那日，仙师的铜镜照了你三遍，摇了摇头。',
      '「凡骨。」两个字，断了山村少年全部的念想——旁人如是说。',
      '可你偏不信：灵根定的是快慢，未必是生死。',
      '仙路九重，你打算用脚一步步量过去。',
    ],
    hook: '离乡前夜，你在村口乱葬岗捡到一枚微微发烫的骨片——荒草埋了它千年，它偏在你路过时烫了一下。',
  },
  {
    name: '世家贵子', tagline: '出身豪门，恩怨缠身',
    intro: [
      '你出身修行世家，自幼锦衣玉食，剑与算学各请了三位西席。',
      '十二岁那年起，父亲每晚多点一盏灯，核对各房的门禁名册。',
      '你后来才懂：树大招风，你家这棵树底下，早埋好了斧子。',
      '出门远行是历练，也是长辈们把你送离漩涡的手段。',
    ],
    hook: '离府那日，一封血书钉在门楣上，无名无款，只有八个字：「灭门之日，为期不远。」',
  },
  {
    name: '逍遥浪子', tagline: '无牵无挂，四海为家',
    intro: [
      '你记事起就在路上：商队、渡口、庙会、镖行，哪里有饭吃哪里就是家。',
      '无门无派，天地便是你的师承；世态炎凉，江湖便是你的功课。',
      '你信两样东西：手里的剑，和口袋里永远花不完的——好奇心。',
    ],
    hook: '某个雨天，你在旧货摊花三文钱淘到一张残破地图。摊主说是废纸，可图角那两个被虫蛀了一半的字，分明是——「浮玉」。',
  },
  {
    name: '魔星降世', tagline: '魔门出身，杀伐问道',
    intro: [
      '你生在魔道，摇篮曲是刀头舔血的调子。',
      '襁褓中你体内便结着一缕「魔胎」——长辈们说这是天大的造化，说这话时，眼神像在看一炉将熟的丹。',
      '魔胎让你天资妖孽，进境如飞；也让你夜夜梦见不属于自己的杀戮。',
      '人与魔的界线，从你出生那天起，就画在你身体里。',
    ],
    hook: '十六岁生辰夜，魔胎第一次开口。那声音贴着你的心跳响起来，只问了一个字：「饿。」',
  },
];

// ---- 女主姓名池 ----
export const SURNAMES = ['苏', '林', '沈', '柳', '白', '秦', '叶', '顾', '云', '洛', '慕', '楚', '江', '温', '宁', '萧'];
export const FEMALE_GIVEN = [
  '婉清', '雪见', '凝霜', '若曦', '月影', '清音', '梦瑶', '芷柔', '冰心',
  '采薇', '灵汐', '挽月', '含烟', '慕雪', '紫烟', '青鸾', '红拂', '素心',
  '念真', '如烟', '语嫣', '飞雪', '玲珑', '妙音',
];
export const TITLES = [
  '太乙剑宗圣女', '玄清门真传', '药王谷传人', '散修仙子', '魔道妖女',
  '灵兽峰峰主', '太虚幻境之主', '合欢宗长老', '符箓世家嫡女', '丹霞谷炼丹师',
];
export const APPEARANCES = [
  '冰肌玉骨，清冷出尘', '眉目如画，温婉动人', '明艳不可方物', '娇俏可人，笑靥如花',
  '英姿飒爽，眉眼含锋', '气质清雅，如空谷幽兰', '妖冶妩媚，魅惑众生',
];
export const PERSONALITIES = [
  '清冷孤傲', '温婉贤淑', '活泼灵动', '腹黑狡黠', '坚韧倔强', '洒脱不羁', '外冷内热', '古灵精怪',
];

// ---- 性格 → 互动数值倍率（交谈/论道/赠礼的好感增减） ----
export interface PersonalityDef {
  name: string;
  talk: number;    // 交谈好感倍率
  debate: number;  // 论道好感倍率
  gift: number;    // 赠礼好感倍率
}

export const PERSONALITY_MODS: Record<string, PersonalityDef> = {
  清冷孤傲: { name: '清冷孤傲', talk: 0.7, debate: 1.3, gift: 0.6 },
  温婉贤淑: { name: '温婉贤淑', talk: 1.2, debate: 0.9, gift: 1.2 },
  活泼灵动: { name: '活泼灵动', talk: 1.4, debate: 0.8, gift: 1.0 },
  腹黑狡黠: { name: '腹黑狡黠', talk: 0.8, debate: 1.1, gift: 1.3 },
  坚韧倔强: { name: '坚韧倔强', talk: 0.9, debate: 1.2, gift: 0.9 },
  洒脱不羁: { name: '洒脱不羁', talk: 1.3, debate: 1.0, gift: 0.8 },
  外冷内热: { name: '外冷内热', talk: 1.0, debate: 1.1, gift: 1.0 },
  古灵精怪: { name: '古灵精怪', talk: 1.2, debate: 0.9, gift: 1.1 },
};

// ---- 剧本专属女主 ----
// 已迁移至 content/story.ts（与主线节点同库，随剧情登场）。

// ---- 敌人（按「战斗类型」分池，再按境界分三档） ----
// 场合决定对手是什么：擂台上站的是同辈天骄，山道上拦路的才是妖兽。
// 一个池子打天下，就会写出「与你对阵的同辈天骄——正是碧鳞妖蟒」这种句子。
export type FoeKind =
  | '妖兽'   // 山野凶物
  | '修士'   // 散修/邪修/劫道之流
  | '魔修'   // 魔道人物
  | '天骄'   // 各宗同辈翘楚（擂台）
  | '同门';  // 本宗弟子（切磋/内乱）

export const ENEMY_POOLS: Record<FoeKind, string[][]> = {
  妖兽: [
    ['铁脊苍狼', '碧鳞妖蟒', '赤瞳妖狐', '青毛山魈'],
    ['六翼魔蝠', '赤鳞蛟', '白骨尸蟒', '玄铁犀'],
    ['荒古凶兽', '混沌异兽', '九首烛蟒', '陨星巨鲲'],
  ],
  修士: [
    ['夺舍散修', '劫道游侠', '亡命刀客', '采药野修'],
    ['邪修长老', '嗜血剑客', '傀儡术士', '御兽游修'],
    ['隐世散仙', '弑徒老怪', '万法游僧', '不老剑翁'],
  ],
  魔修: [
    ['血手魔徒', '尸傀道人', '阴风堡杀手', '噬心妖僧'],
    ['血煞魔修', '骨幡魔将', '摄魂魔女', '焚天魔道'],
    ['域外天魔', '无生魔宗长老', '万尸魔君', '心魔化影'],
  ],
  天骄: [[], [], []], // 走 randomFoeName()，见下
  同门: [[], [], []],
};

// ---- 男修姓名池（对手若是「人」，就得有人名） ----
export const MALE_GIVEN = [
  '青云', '子昂', '书白', '长风', '慕言', '砚秋', '临渊', '孤鸿',
  '重山', '寒声', '未晚', '知微', '归尘', '照野', '听澜', '奉先',
];
/** 道号 = 姓 + 道号字 + 尊称，给高境界对手用——称呼本身就是境界的一部分。 */
export const DAO_STEMS = ['玄', '虚', '清', '苍', '寒', '明', '离', '尘', '朔', '钧'];
export const DAO_STYLES = ['真人', '道人', '上人', '散人', '老祖'];

// ---- 由状态推导出的属性（纯函数） ----

export function realmAbs(p: Player): number {
  return p.realmIdx * 4 + p.stageIdx;
}

export function playerTitle(p: Player): string {
  return REALMS[p.realmIdx].name + REALMS[p.realmIdx].stages[p.stageIdx];
}

/** 当前战力基数（指数曲线，见 powerOf）。 */
export function playerPower(p: Player): number {
  return powerOf(p.realmIdx, p.stageIdx);
}

/** 化神入道给的固定属性加成（战斗内的五行乘区另在 combat.ts 结算）。 */
function daoStat(p: Player, key: 'defPct' | 'hpPct' | 'sense' | 'qi'): number {
  switch (p.daoPath) {
    case '以体入道': return key === 'hpPct' ? 0.4 : key === 'defPct' ? 0.25 : 0;
    case '以神入道': return key === 'sense' ? 6 : 0;
    case '以气入道': return key === 'qi' ? 6 : 0;
    default: return 0;
  }
}

export function playerAttack(p: Player): number {
  let pct = (TREASURES[p.treasure]?.atkPct ?? 0)
    + (FORMATIONS[p.formation]?.atkPct ?? 0)
    + (TECHNIQUES[p.technique]?.atkPct ?? 0) * techPower(p); // 功法加成随熟练度放大
  const atkPct = sectOf(p)?.atkPct ?? 0;                     // 太乙剑宗/血煞魔宗等
  pct += atkPct > 0 ? atkPct * sectPower(p) : atkPct;
  return Math.round(BASE_STATS.atk * playerPower(p) * (1 + pct));
}

export function playerDefense(p: Player): number {
  const pct = (TREASURES[p.treasure]?.defPct ?? 0)
    + (FORMATIONS[p.formation]?.defPct ?? 0)
    + (TECHNIQUES[p.technique]?.defPct ?? 0) * techPower(p)
    + daoStat(p, 'defPct');
  return Math.round(BASE_STATS.def * playerPower(p) * (1 + pct));
}

export function playerHp(p: Player): number {
  const pct = (TECHNIQUES[p.technique]?.hpPct ?? 0) * techPower(p)
    + coreBonus(p.goldenCore?.quality ?? 0).hpPct
    + daoStat(p, 'hpPct');
  // 先天气血（创角的体质/经历）是一个平移量：炼气期举足轻重，化神期自然淡出。
  // 一场童年大病不该拖累一位真君。
  return Math.round(BASE_STATS.hp * playerPower(p) * (1 + pct)) + (p.maxHp - 40);
}

/**
 * 遁速：先手、闪避与逃遁。
 * 走线性小数（4→22）而非指数——它按「差值」用，跟着战力指数膨胀就没法比了。
 */
export function playerSpeed(p: Player): number {
  const gear = (TREASURES[p.treasure]?.spd ?? 0) + (TECHNIQUES[p.technique]?.spd ?? 0);
  return Math.round(BASE_STATS.spd + realmAbs(p) * 0.4 + gear);
}

/** 神识：命中与破隐，也决定战前能不能看透对手的底细。同样走线性。 */
export function playerSense(p: Player): number {
  const gear = TECHNIQUES[p.technique]?.sense ?? 0;
  return Math.round(BASE_STATS.sense + realmAbs(p) * 0.4 + gear + daoStat(p, 'sense'));
}

/** 灵气上限：神通的施展次数由它管，不再是「每战限次」。 */
export function playerMaxQi(p: Player): number {
  return 8 + Math.floor(realmAbs(p) / 3) + daoStat(p, 'qi');
}

/** 每回合自然回复的灵气（金丹品质与入道会加，元婴异象在战斗里另算）。 */
export function playerQiRegen(p: Player): number {
  return 1 + coreBonus(p.goldenCore?.quality ?? 0).qi + (p.daoPath === '以气入道' ? 2 : 0);
}

/** 某式神通的当前等级（1~5）。 */
export function spellLevel(p: Player, name: string): number {
  return Math.max(1, Math.min(SPELL_MAX_LV, p.spellLv?.[name] ?? 1));
}

/** 习得一式神通：入库并置为一级；已会则返回 false。 */
export function learnSpell(p: Player, name: string): boolean {
  if (!SPELLS[name]) return false;
  p.spells ??= [];
  p.spellLv ??= {};
  if (p.spells.includes(name)) return false;
  p.spells.push(name);
  p.spellLv[name] ??= 1;
  return true;
}
