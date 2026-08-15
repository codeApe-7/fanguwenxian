// 战斗系统。
//
// 战斗是有「类型」的：擂台上站的是同辈天骄，山道上拦路的才是妖兽，孤峰之巅落下来的是雷。
// 场合决定对手取名（FoeKind）、规则开关（能不能逃、能不能用丹药、几回合判定）与战利品。
//
// 三条让战斗不退化成「戳同一个键」的机制：
//   · 灵气——神通要花钱，普通攻击是聚气的手段，于是普攻不再是纯兜底；
//   · 后继无力——连发同一式威力锐减，逼你轮换；
//   · 五行——亲和 / 相生连击 / 相克三条乘区，轮换本身就有最优解可找。
//
// ★ 敌我共用同一套战斗语汇：敌人也有牌组、灵气、五行灵根，也吃后继无力与相生相克。
//   它和你的唯一区别是「选哪一式」由 AI 权重表决定（见 chooseFoeSpell）。
//
// 界面每回合整屏重绘一块面板（双血条 + 灵气 + 状态 + 最近战报），不往下刷屏。

import type { GameIO } from '../io.js';
import type { Player, FemaleLead } from '../types.js';
import type { FoeKind, Element, SpellEffect, EffectKind, SpellDef } from '../content.js';
import {
  ENEMY_POOLS, TREASURES, MATERIALS, TALISMANS, TECHNIQUES, SPELLS, REALMS, PILLS,
  SURNAMES, MALE_GIVEN, DAO_STEMS, DAO_STYLES, ELEMENTS, SHENG, KE, BASE_STATS,
  FATIGUE, YUANYING_VISIONS, SPELL_MAX_LV,
  powerOf, sectOf, playerAttack, playerDefense, playerHp, playerTitle, incomeScale,
  playerSpeed, playerSense, playerMaxQi, playerQiRegen, spellLevel, spellPower, learnSpell,
  rootsFor, mainElement,
} from '../content.js';
import { green, red, yellow, cyan, dim, bold, magenta } from '../colors.js';
import { pick, randint, chance, shuffle, weightedChoice } from './rng.js';

// ———————————— 对手 ————————————

export type FoeClass = FoeKind | '心魔' | '天劫';

export interface Enemy {
  name: string;
  realm: string;              // 对手境界，面板上要显示
  element: Element | '无';    // 本命五行，相克乘区看它
  roots: Record<Element, number>; // 五行灵根：敌人施法也吃亲和乘区
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  spd: number;                // 遁速：先手与闪避
  sense: number;              // 神识：你能不能看透它，也看它能不能看透你
  qi: number;
  maxQi: number;
  deck: string[];             // ★ 会的神通。杂鱼两式，天骄一整套
  spellLv: Record<string, number>;
  loot: number;
  kind: FoeClass;
  atkGrowth?: number;         // 每回合攻击自乘（天劫专用：一雷重过一雷）
  pierce?: number;            // 无视防御的比例 0~1（天劫专用）
  immortal?: boolean;         // 打不死（天劫：你只能撑过去，不能赢它）
}

/** 生成一个「人」的名字。境界越高越可能用道号——称呼本身就是境界的一部分。 */
export function randomFoeName(tier: number): string {
  const surname = pick(SURNAMES);
  if (tier >= 2 || (tier === 1 && chance(0.3))) return surname + pick(DAO_STEMS) + pick(DAO_STYLES);
  // 「白书白」这种姓名重字读着别扭，避开
  return surname + pick(MALE_GIVEN.filter((g) => !g.startsWith(surname)));
}

/** 对手类型带来的属性偏移：妖兽皮糙肉厚，魔修凶悍脆皮，天骄样样强一档。 */
const KIND_MODS: Record<FoeKind, { hp: number; atk: number; def: number; spd: number; sense: number }> = {
  妖兽: { hp: 1.15, atk: 1.0, def: 0.85, spd: 1, sense: -1 },
  修士: { hp: 1.0, atk: 1.0, def: 1.0, spd: 0, sense: 0 },
  魔修: { hp: 0.9, atk: 1.15, def: 0.95, spd: 0, sense: 1 },
  天骄: { hp: 1.1, atk: 1.1, def: 1.1, spd: 1, sense: 1 },
  同门: { hp: 0.95, atk: 0.95, def: 1.0, spd: 0, sense: 0 },
};

/**
 * 敌人也有家底。
 * 数据里每个 NPC 都带 equipWeapon / equipClothing / equipRing 三件装备，
 * 而玩家这边法宝+功法+阵法叠起来轻松 ×2——不给敌人配家当，同境界就成了单方面碾压。
 * 家底随境界铺开：炼气期的散修跟你一样穷，元婴之后才一身法宝。
 */
const KIND_GEAR: Record<FoeKind, number> = {
  妖兽: 1.0,   // 妖兽不穿装备，它的本钱是皮糙肉厚（见 KIND_MODS）
  修士: 1.55,
  魔修: 1.60,
  天骄: 2.00,  // 各宗天骄一身好法宝：擂台才是真正势均力敌的场合
  同门: 1.45,
};

function gearOf(kind: FoeKind, realmIdx: number): number {
  return 1 + (KIND_GEAR[kind] - 1) * Math.min(1, realmIdx / 3);
}

/**
 * 牌组：敌人会几式神通。
 * 杂兵两式、天骄一整套——「会几招」本身就是难度分层，而不是只把血量调高。
 */
function deckSizeOf(kind: FoeKind, realmIdx: number): number {
  const base = 2 + Math.floor(realmIdx / 2);
  const bonus = kind === '天骄' ? 1 : kind === '妖兽' ? -1 : 0;
  return Math.max(1, Math.min(6, base + bonus));
}

/** 该境界能用到的最高品阶：品阶不是靠等级白给的，低阶妖兽不会仙法。 */
function tierCapOf(realmIdx: number): number {
  if (realmIdx >= 6) return 4;
  if (realmIdx >= 4) return 3;
  if (realmIdx >= 2) return 2;
  return 1;
}

/** 每类对手的选材偏好：妖兽走本能，魔修爱吸血下毒，天骄什么都会。 */
function deckFilterOf(kind: FoeKind): (d: SpellDef) => boolean {
  const has = (d: SpellDef, k: EffectKind) => d.effects.some((e) => e.kind === k);
  switch (kind) {
    // 妖兽不通人间法术：只有本能——爪牙、毒、蛮力，不会遁法不会辅助
    case '妖兽': return (d) => d.element !== '无'
      && !has(d, 'escape') && !has(d, 'cleanse') && !has(d, 'qi')
      && !has(d, 'heal') && !has(d, 'regen') && !has(d, 'shield') && !has(d, 'guard');
    case '魔修': return (d) => !has(d, 'escape');
    default: return (d) => !has(d, 'escape');
  }
}

/** 抽一副牌组：本命属性优先，保证至少一式能打伤害。 */
function buildDeck(kind: FoeKind, realmIdx: number, element: Element): string[] {
  const cap = tierCapOf(realmIdx);
  const ok = deckFilterOf(kind);
  const pool = Object.keys(SPELLS).filter((n) => SPELLS[n].tier <= cap && ok(SPELLS[n]));
  const mine = pool.filter((n) => SPELLS[n].element === element);
  const rest = pool.filter((n) => SPELLS[n].element !== element);
  const size = deckSizeOf(kind, realmIdx);
  // 七成本命属性、三成杂学：既有流派感，又不至于被一种克制打死
  const want = [...shuffle(mine).slice(0, Math.ceil(size * 0.7)), ...shuffle(rest)];
  const deck = want.slice(0, size);
  if (!deck.some((n) => SPELLS[n].effects.some((e) => e.kind === 'dmg'))) {
    const atkPool = pool.filter((n) => SPELLS[n].effects.some((e) => e.kind === 'dmg'));
    if (atkPool.length > 0) deck[0] = pick(atkPool);
  }
  return [...new Set(deck)];
}

export interface EnemyOpts {
  boost?: number;      // 等级加成（宗门任务难度 / 大事凶险度）
  kind?: FoeKind;      // 取名池，缺省「妖兽」
  foe?: string;        // 指名道姓（现任宗主 / 无名剑客），优先于 kind
  element?: Element;   // 指定五行（缺省随机）
}

export function makeEnemy(p: Player, opts: EnemyOpts = {}): Enemy {
  const { boost = 0, kind = '妖兽', foe, element } = opts;
  const tier = Math.min(2, Math.floor(p.realmIdx / 3));
  const name = foe ?? (kind === '天骄' || kind === '同门' ? randomFoeName(tier) : pick(ENEMY_POOLS[kind][tier]));
  const abs = p.realmIdx * 4 + p.stageIdx;
  const level = Math.max(0, abs + pick([-1, 0, 0, 1, 1]) + boost);
  const ri = Math.min(REALMS.length - 1, Math.floor(level / 4));
  const si = Math.min(REALMS[ri].stages.length - 1, level % 4);
  const pw = powerOf(ri, si);
  const m = KIND_MODS[kind];
  const gear = gearOf(kind, ri);
  const hp = Math.round(BASE_STATS.hp * pw * m.hp * (1 + (gear - 1) * 0.5));
  const elem = element ?? pick(ELEMENTS);
  // 敌人也有一副五行灵根（数据里 NPC 五维和与玩家同量级），施法一样吃亲和
  const roots = rootsFor(kind === '天骄' ? '双灵根' : '三灵根', [elem, ...shuffle(ELEMENTS.filter((e) => e !== elem))]);
  const deck = buildDeck(kind, ri, elem);
  const lv = Math.max(1, Math.min(SPELL_MAX_LV, 1 + Math.floor(ri / 2)));
  return {
    name,
    realm: REALMS[ri].name + REALMS[ri].stages[si],
    element: elem,
    roots,
    hp,
    maxHp: hp,
    atk: Math.round(BASE_STATS.atk * pw * m.atk * gear),
    def: Math.round(BASE_STATS.def * pw * m.def * gear),
    spd: Math.round(BASE_STATS.spd + level * 0.4 + m.spd),
    sense: Math.round(BASE_STATS.sense + level * 0.4 + m.sense),
    qi: 3,
    maxQi: 8 + Math.floor(level / 3),
    deck,
    spellLv: Object.fromEntries(deck.map((n) => [n, lv])),
    loot: randint(20, 60) * incomeScale(p.realmIdx),
    kind,
  };
}

// ———————————— 战斗类型与规则开关 ————————————

export type CombatResult = 'win' | 'lose' | 'escape';

/** 连战容器：传入即以 hp 开局，战后写回剩余气血。 */
export interface CarryHp { hp: number }

export type FightKind = '普通' | '擂台' | '切磋' | '生死斗' | '心魔' | '天劫';

export interface CombatOpts {
  intro?: string;            // 开场白，{enemy} 会替换为敌人名
  boost?: number;            // 敌人等级加成
  kind?: FoeKind;            // 敌人取名池
  foe?: string;              // 指名道姓的对手
  element?: Element;         // 指定敌人五行
  fight?: FightKind;         // 规则预设（缺省由 arena 推导，再缺省「普通」）
  arena?: '擂台' | '切磋';    // 旧调用点沿用：点到为止
  title?: string;            // 面板顶栏
  carry?: CarryHp;           // 连战气血
  // —— 规则开关（缺省由 fight 预设填充，显式指定则覆盖）——
  noEscape?: boolean;        // 无路可退
  noItems?: boolean;         // 禁丹药与符箓：比的是修为与神通，不是家底
  noDeath?: boolean;         // 败不至死，气血保底 1
  roundLimit?: number;       // 回合上限
  onTimeout?: 'judge' | 'win' | 'lose'; // 到点怎么算：按血量比例判 / 算撑住了 / 算没撑住
  enemy?: Enemy;             // 直接给一个对手（心魔镜像 / 天劫）
  preShield?: number;        // 战前护罩（心境/丹药/一生抉择的兑现处）
  startHpPct?: number;       // 起始气血百分比（上一场没打好，这一场就带着伤上）
}

const FIGHT_RULES: Record<FightKind, Partial<CombatOpts>> = {
  普通: {},
  擂台: { noDeath: true, roundLimit: 30, onTimeout: 'judge' },
  切磋: { noDeath: true, roundLimit: 24, onTimeout: 'judge' },
  生死斗: { noEscape: true },
  心魔: { noEscape: true, noItems: true },
  天劫: { noEscape: true, noItems: true, roundLimit: 9, onTimeout: 'win' },
};

// ———————————— 战斗内的一方 ————————————

interface Buff {
  kind: EffectKind;
  label: string;
  value: number;
  turns: number;
  stacks: number;
}

interface Side {
  name: string;
  isPlayer: boolean;
  hp: number;
  maxHp: number;
  qi: number;
  maxQi: number;
  shield: number;
  atkBase: number;
  atkPct: number;    // 战意（buffAtk）累计
  weakPct: number;   // 被削（weaken）累计
  def: number;
  spd: number;
  sense: number;
  element: Element | '无';
  roots: Record<Element, number>;
  buffs: Buff[];
  deck: string[];
  spellLv: Record<string, number>;
  daoPath: string | null;
  // 后继无力与相生连击的状态，敌我各记各的
  lastSpell: string;
  repeat: number;
  prevElem: Element | '无';
}

const BUFF_LABELS: Partial<Record<EffectKind, string>> = {
  dot: '灼蚀', regen: '生机', vuln: '易伤', guard: '减伤',
  thorn: '反伤', dodge: '身法', stun: '定身',
};

function sumBuff(s: Side, kind: EffectKind): number {
  return s.buffs.filter((b) => b.kind === kind).reduce((n, b) => n + b.value * b.stacks, 0);
}

function hasBuff(s: Side, kind: EffectKind): boolean {
  return s.buffs.some((b) => b.kind === kind && b.turns > 0);
}

function addBuff(s: Side, kind: EffectKind, value: number, turns: number, stacks = 1): void {
  const label = BUFF_LABELS[kind] ?? kind;
  const same = s.buffs.find((b) => b.kind === kind && b.value === value);
  if (same) {
    same.stacks += stacks;
    same.turns = Math.max(same.turns, turns);
  } else {
    s.buffs.push({ kind, label, value, turns, stacks });
  }
}

/** 当前有效攻击（战意加、被削减）。 */
function atkOf(s: Side): number {
  return Math.max(1, Math.round(s.atkBase * (1 + s.atkPct / 100) * (1 - Math.min(0.7, s.weakPct / 100))));
}

/** 普通攻击的系数。它同时是「聚气动作」，所以刻意低于同阶神通。 */
export const PUNCH_COEF = 0.62;

/**
 * 伤害公式：比例减伤。
 * 量纲无关——在炼气期和渡劫期都成立，这是指数曲线下唯一站得住的减伤模型。
 */
function rawDamage(atk: number, def: number, coef: number): number {
  const eff = atk / (atk + Math.max(1, def));
  return Math.max(1, Math.round(atk * coef * eff));
}

/** 结算一次伤害：先过易伤/减伤，再破护罩，最后掉血。返回实际掉的血。 */
function dealDamage(to: Side, amount: number): number {
  let dmg = amount;
  dmg = Math.round(dmg * (1 + sumBuff(to, 'vuln') / 100));
  dmg = Math.round(dmg * (1 - Math.min(0.8, sumBuff(to, 'guard') / 100)));
  dmg = Math.max(1, dmg);
  if (to.shield > 0) {
    const absorbed = Math.min(to.shield, dmg);
    to.shield -= absorbed;
    dmg -= absorbed;
  }
  to.hp -= dmg;
  return dmg;
}

// ———————————— 五行三乘区 ————————————

interface ElemNote { mult: number; notes: string[] }

/**
 * 亲和（灵根越深越强）× 连击（上一式相生）× 相克（属性压制）。
 * 这三条乘区是「轮换神通」有最优解可找的原因——敌我同吃。
 */
function elementMult(
  roots: Record<Element, number> | undefined,
  spellElem: Element | '无',
  foeElem: Element | '无',
  prevElem: Element | '无',
): ElemNote {
  const notes: string[] = [];
  if (spellElem === '无') return { mult: 1, notes };
  let mult = 1;
  const affinity = roots?.[spellElem] ?? 0;
  if (affinity > 0) mult *= 1 + affinity / 200;
  if (prevElem !== '无' && SHENG[prevElem] === spellElem) {
    mult *= 1.25;
    notes.push(`连击 ${prevElem}生${spellElem}`);
  }
  if (foeElem !== '无') {
    if (KE[spellElem] === foeElem) { mult *= 1.3; notes.push(`${spellElem}克${foeElem}`); }
    else if (KE[foeElem] === spellElem) { mult *= 0.8; notes.push(`被${foeElem}所克`); }
  }
  return { mult, notes };
}

// ———————————— 敌人 AI：条件 × 权重 ————————————

/**
 * 每类对手的行事倾向。
 * 借鉴的是「一式一条规则、Yes/No 给权重、加权抽样」这套结构：
 * 不是决策树，所以同一个敌人打两次不会一模一样，但始终像那么回事。
 */
interface Mood { aggr: number; heal: number; guard: number; control: number; buff: number; dot: number }

const AI_MOODS: Record<FoeClass, Mood> = {
  // 妖兽只知道扑上去咬，不会疗伤也不懂控场
  妖兽: { aggr: 1.5, heal: 0.3, guard: 0.4, control: 0.6, buff: 0.5, dot: 1.2 },
  修士: { aggr: 1.0, heal: 1.0, guard: 1.0, control: 1.0, buff: 1.0, dot: 1.0 },
  魔修: { aggr: 1.3, heal: 0.7, guard: 0.5, control: 0.9, buff: 1.1, dot: 1.4 },
  // 天骄是同辈翘楚：会留手、会控场、会先叠增益再打
  天骄: { aggr: 1.0, heal: 1.2, guard: 1.2, control: 1.3, buff: 1.3, dot: 1.0 },
  同门: { aggr: 0.9, heal: 1.0, guard: 1.1, control: 1.0, buff: 1.0, dot: 0.9 },
  心魔: { aggr: 1.2, heal: 1.0, guard: 0.9, control: 1.2, buff: 1.1, dot: 1.1 },
  天劫: { aggr: 1, heal: 0, guard: 0, control: 0, buff: 0, dot: 0 },
};

/**
 * 一式神通对当前局势的权重。
 * 权重语汇沿用参考数据的三档：0＝绝不用，几十＝兜底，几百＝这就是时候。
 */
function scoreSpell(src: Side, dst: Side, name: string, mood: Mood): number {
  const d = SPELLS[name];
  if (!d || d.cost > src.qi) return 0;
  const has = (k: EffectKind) => d.effects.some((e) => e.kind === k);
  const hpPct = src.hp / src.maxHp;
  let w: number;

  if (has('escape')) return 0;                                   // 敌人不用遁法：逃不逃由别处管
  else if (has('heal') || has('regen')) {
    // 残血才治，血厚时一点也不想治——这是最像「人」的一条
    w = (hpPct < 0.35 ? 900 : hpPct < 0.6 ? 90 : 0) * mood.heal;
  } else if (has('cleanse')) {
    w = src.buffs.some((b) => b.kind === 'dot' || b.kind === 'vuln') ? 320 : 0;
  } else if (has('shield') || has('guard')) {
    w = (hpPct < 0.75 && src.shield <= 0 ? 240 : 25) * mood.guard;
  } else if (has('stun')) {
    // 对手灵气快满了＝要放大招，先定住他
    w = (dst.qi >= dst.maxQi * 0.6 ? 420 : 70) * mood.control;
  } else if (has('sap')) {
    w = (dst.qi >= 4 ? 380 : 25) * mood.control;
  } else if (has('buffAtk')) {
    w = (src.atkPct === 0 ? 300 : 0) * mood.buff;               // 战意只叠一次
  } else if (has('weaken')) {
    w = (dst.weakPct === 0 ? 240 : 15) * mood.buff;
  } else if (has('vuln')) {
    w = (hasBuff(dst, 'vuln') ? 15 : 260) * mood.buff;
  } else if (has('dot') && !has('dmg')) {
    w = 170 * mood.dot;
  } else {
    const dmg = d.effects.find((e) => e.kind === 'dmg')?.value ?? 0;
    w = (60 + dmg) * mood.aggr;
    if (dst.hp / dst.maxHp < 0.25) w *= 2;                       // 补刀
  }

  // 五行：克他就多用，被他克就少用——敌人也会挑属性
  if (d.element !== '无' && dst.element !== '无') {
    if (KE[d.element] === dst.element) w *= 2;
    else if (KE[dst.element] === d.element) w *= 0.5;
  }
  if (d.element !== '无' && src.prevElem !== '无' && SHENG[src.prevElem] === d.element) w *= 1.4;
  // 后继无力敌人一样吃，于是它也会自己换招
  if (name === src.lastSpell) w *= FATIGUE[Math.min(src.repeat + 1, FATIGUE.length - 1)];
  return Math.max(0, Math.round(w));
}

/** 加权抽一式；全为 0 则返回 null（改用普通攻击聚气）。 */
function chooseFoeSpell(src: Side, dst: Side, mood: Mood): string | null {
  const weighted = src.deck
    .map((n) => [n, scoreSpell(src, dst, n, mood)] as const)
    .filter(([, w]) => w > 0);
  if (weighted.length === 0) return null;
  return weightedChoice(weighted);
}

/** 敌人施法时的画面：flavor 都是第二人称写的，给敌人另配一套旁观视角的短句。 */
const FOE_CAST_LINES: Record<Element | '无', string[]> = {
  金: ['空气里响起一声细而长的金属摩擦声。', '他指尖压出一线白光，那光很薄，薄得像刀。', '几点寒星在他身侧亮起，随即不见了。'],
  木: ['地皮下有什么东西在动，草叶齐齐朝一个方向倒。', '一股潮湿的腥气涌上来，像雨后的深林。', '他袖口垂下的东西，不是流苏。'],
  水: ['温度降了一截，你呼出的气开始发白。', '他身周浮起一层薄薄的水色，涟漪一圈圈往外荡。', '有水声，可这里三十里内没有河。'],
  火: ['热浪扑面，你下意识偏了偏头。', '他掌心的东西亮起来时，地上的影子全变了方向。', '空气烧起来的味道先到，火后到。'],
  土: ['脚下的地面沉了一寸。', '尘土无风自起，在他身前立成一道墙。', '整座山似乎往这边压了压。'],
  无: ['他的动作忽然快了一拍。', '有什么东西擦着你的神魂过去了。', '他抬手，你却没看清他要做什么。'],
};

// ———————————— 面板渲染 ————————————

const PANEL_W = 46;   // 面板显示宽度（列）
const BAR_W = 20;     // 血条格数
const QI_W = 10;      // 灵气格数

/** 终端显示宽度：CJK 全角按 2 列算，否则边框对不齐。 */
function dispWidth(s: string): number {
  let w = 0;
  for (const ch of s.replace(/\x1b\[[0-9;]*m/g, '')) {
    const cp = ch.codePointAt(0)!;
    const wide = (cp >= 0x1100 && cp <= 0x115f)
      || (cp >= 0x2e80 && cp <= 0x303e)
      || (cp >= 0x3041 && cp <= 0x33ff)
      || (cp >= 0x3400 && cp <= 0x4dbf)
      || (cp >= 0x4e00 && cp <= 0x9fff)
      || (cp >= 0xa000 && cp <= 0xa4cf)
      || (cp >= 0xac00 && cp <= 0xd7a3)
      || (cp >= 0xf900 && cp <= 0xfaff)
      || (cp >= 0xfe30 && cp <= 0xfe4f)
      || (cp >= 0xff00 && cp <= 0xff60)
      || (cp >= 0xffe0 && cp <= 0xffe6);
    w += wide ? 2 : 1;
  }
  return w;
}

function padTo(s: string, w: number): string {
  return s + ' '.repeat(Math.max(0, w - dispWidth(s)));
}

function bar(cur: number, max: number): string {
  const c = Math.max(0, cur);
  const ratio = max > 0 ? Math.min(1, c / max) : 0;
  const filled = c > 0 ? Math.max(1, Math.round(ratio * BAR_W)) : 0;
  return '█'.repeat(filled) + '░'.repeat(BAR_W - filled);
}

function qiBar(cur: number, max: number): string {
  const n = max > 0 ? Math.round((Math.max(0, cur) / max) * QI_W) : 0;
  return '●'.repeat(Math.min(QI_W, n)) + '○'.repeat(Math.max(0, QI_W - n));
}

/** 血条按剩余比例变色：过半绿、过三成黄、再低转红。 */
function hpColor(cur: number, max: number, text: string): string {
  const ratio = max > 0 ? cur / max : 0;
  if (ratio > 0.5) return green(text);
  if (ratio > 0.3) return yellow(text);
  return red(text);
}

/** 状态行：〔灼蚀×3 易伤 定身〕 */
function statusLine(s: Side): string {
  // 同名状态合并显示：底层按「每跳伤害」分条存放，但玩家只关心「身上有几层灼蚀」
  const merged = new Map<string, number>();
  for (const b of s.buffs) {
    if (b.turns <= 0) continue;
    merged.set(b.label, (merged.get(b.label) ?? 0) + b.stacks);
  }
  const parts = [...merged].map(([label, n]) => (n > 1 ? `${label}×${n}` : label));
  return parts.length > 0 ? `〔${parts.join(' ')}〕` : '';
}

// ———————————— 主流程 ————————————

export async function combat(
  p: Player,
  leads: FemaleLead[],
  io: GameIO,
  opts: CombatOpts = {},
): Promise<CombatResult> {
  const fight: FightKind = opts.fight ?? opts.arena ?? '普通';
  const rules = { ...FIGHT_RULES[fight], ...opts };
  const { intro, boost = 0, kind = '妖兽', foe, element, carry } = opts;
  const enemy = opts.enemy ?? makeEnemy(p, { boost, kind, foe, element });
  const arena = fight === '擂台' || fight === '切磋';
  const title = opts.title ?? (arena ? `${fight}斗法` : fight === '普通' ? '遭遇战' : fight);
  const noItems = rules.noItems ?? false;
  const noEscape = rules.noEscape ?? false;
  const noDeath = rules.noDeath ?? arena;
  const roundLimit = rules.roundLimit ?? 0;
  const onTimeout = rules.onTimeout ?? 'judge';
  // 双方都会疗伤，就有互相耗到天荒地老的可能：兜一条硬上限，到点按血量比例判。
  // 显示的仍是 roundLimit（没设就不显示），这条只是防止打不完。
  const hardCap = roundLimit > 0 ? roundLimit : 60;
  const mood = AI_MOODS[enemy.kind];

  await io.clear();
  if (intro) await io.narrate(intro.replace('{enemy}', red(enemy.name)));

  const maxHp = playerHp(p);
  const vision = YUANYING_VISIONS.find((v) => v.name === p.yuanying);
  const playerRoots = p.roots ?? rootsFor(p.root, ELEMENTS);
  const me: Side = {
    name: p.name,
    isPlayer: true,
    hp: Math.max(1, Math.min(maxHp, carry?.hp ?? maxHp)),
    maxHp,
    qi: 3,
    maxQi: playerMaxQi(p),
    shield: 0,
    atkBase: playerAttack(p),
    atkPct: 0,
    weakPct: 0,
    def: playerDefense(p),
    spd: playerSpeed(p),
    sense: playerSense(p),
    element: mainElement(playerRoots),
    roots: playerRoots,
    buffs: [],
    deck: p.spells ?? [],
    spellLv: p.spellLv ?? {},
    daoPath: p.daoPath ?? null,
    lastSpell: '',
    repeat: 0,
    prevElem: '无',
  };
  const foeSide: Side = {
    name: enemy.name,
    isPlayer: false,
    hp: enemy.hp,
    maxHp: enemy.maxHp,
    qi: enemy.qi,
    maxQi: enemy.maxQi,
    shield: 0,
    atkBase: enemy.atk,
    atkPct: 0,
    weakPct: 0,
    def: enemy.def,
    spd: enemy.spd,
    sense: enemy.sense,
    element: enemy.element,
    roots: enemy.roots,
    buffs: [],
    deck: enemy.deck,
    spellLv: enemy.spellLv,
    daoPath: null,
    lastSpell: '',
    repeat: 0,
    prevElem: '无',
  };

  // 元婴「玄壳」：每场首回合自结护罩
  if (vision?.kind === 'shield') me.shield += Math.round(maxHp * vision.value / 100);
  if (opts.preShield) me.shield += opts.preShield;
  if (opts.startHpPct !== undefined) me.hp = Math.max(1, Math.round(maxHp * opts.startHpPct / 100));

  // 神识够，才看得见对手的属性、灵气与牌路；差得远，只知道来者不善
  const canRead = me.sense + 2 >= foeSide.sense;

  let turn = 1;
  let wardCounter = 0;                   // 元婴「神御」计数
  let castThisTurn = false;              // 本回合玩家是否已施过法（元婴「锋锐」看它）

  // 战报只留最近五条：面板固定在屏幕上，不往下滚
  const log: string[] = [];
  const say = (t: string) => { log.push(t); if (log.length > 5) log.shift(); };

  const render = (clearFirst: boolean): void => {
    if (clearFirst) io.clear();
    const head = `╔═ ${title} `;
    io.print(cyan(head + '═'.repeat(Math.max(0, PANEL_W - dispWidth(head) - 1)) + '╗'));
    const foeTag = canRead ? `${enemy.element}行` : '？';
    io.print(`  ${padTo(red(enemy.name) + dim(` ${foeTag}`), 26)}${dim(enemy.realm)}`);
    if (enemy.immortal) {
      // 天劫没有血条：它不是用来打死的，只能撑过去
      const left = roundLimit > 0 ? Math.max(0, roundLimit - Math.min(turn, roundLimit) + 1) : 0;
      io.print(`  ${red('▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚')}  ${yellow(`尚余 ${left} 道`)}`);
    } else {
      const foeQi = canRead ? dim(`  气 ${foeSide.qi}`) : '';
      io.print(`  ${hpColor(foeSide.hp, foeSide.maxHp, bar(foeSide.hp, foeSide.maxHp))}  ${Math.max(0, foeSide.hp)}/${foeSide.maxHp}${foeQi}`);
    }
    const fs = statusLine(foeSide);
    if (fs) io.print(dim(`  ${fs}`));
    io.print('');
    io.print(`  ${padTo(bold(`你 · ${p.name}`) + dim(` ${me.element}行`), 26)}${dim(playerTitle(p))}`);
    const shieldTag = me.shield > 0 ? cyan(`  护罩 ${me.shield}`) : '';
    io.print(`  ${hpColor(me.hp, me.maxHp, bar(me.hp, me.maxHp))}  ${Math.max(0, me.hp)}/${me.maxHp}${shieldTag}`);
    io.print(`  ${magenta(qiBar(me.qi, me.maxQi))}  灵气 ${me.qi}/${me.maxQi}`);
    const ms = statusLine(me);
    if (ms) io.print(dim(`  ${ms}`));
    if (!noItems) {
      const kit: string[] = [];
      for (const n of ['疗伤丹', '回春丹']) if ((p.pills[n] ?? 0) > 0) kit.push(`${n}×${p.pills[n]}`);
      for (const n of ['烈焰符', '护身符']) if ((p.talismans[n] ?? 0) > 0) kit.push(`${n}×${p.talismans[n]}`);
      io.print(dim(`  ${kit.length > 0 ? kit.join('  ') : '身无长物'}`));
    } else {
      io.print(dim('  此战不得用丹药法器——比的是修为与神通'));
    }
    const limitTag = roundLimit > 0 ? `/${roundLimit}` : '';
    const shown = roundLimit > 0 ? Math.min(turn, roundLimit) : turn;
    const tail = ` 第 ${shown}${limitTag} 回合 ═╝`;
    io.print(cyan('╚' + '═'.repeat(Math.max(0, PANEL_W - dispWidth(tail) - 1)) + tail));
    for (const l of log) io.print(`  · ${l}`);
    io.print('');
  };

  /** 收尾：连战时把剩余气血写回（重伤也至少留一口气）。 */
  const finish = (r: CombatResult): CombatResult => {
    if (carry) carry.hp = Math.max(1, me.hp);
    return r;
  };

  /** 单条效果的结算，src 施术、dst 受术。返回本条造成的伤害（供吸血用）。 */
  function applyEffect(src: Side, dst: Side, e: SpellEffect, mult: number, tag: string): number {
    const who = src.isPlayer ? '你' : src.name;
    const atk = atkOf(src);
    switch (e.kind) {
      case 'dmg': {
        const d = dealDamage(dst, rawDamage(atk, dst.def, (e.value / 100) * mult));
        say(`${who}施展 ${tag}，造成 ${(src.isPlayer ? green : red)(String(d))} 点伤害`);
        return d;
      }
      case 'dot': {
        const per = Math.max(1, Math.round(rawDamage(atk, dst.def, (e.value / 100) * mult)));
        addBuff(dst, 'dot', per, e.turns ?? 2, e.stacks ?? 1);
        say(`${who}施展 ${tag}，${yellow(`${e.stacks ?? 1} 层灼蚀`)}附于${dst.isPlayer ? '你' : '其'}身`);
        return 0;
      }
      case 'heal': {
        const h = Math.round(src.maxHp * (e.value / 100) * mult);
        src.hp = Math.min(src.maxHp, src.hp + h);
        say(`${who}施展 ${tag}，恢复 ${green(String(h))} 点气血`);
        return 0;
      }
      case 'regen':
        addBuff(src, 'regen', Math.round(src.maxHp * (e.value / 100)), e.turns ?? 3);
        say(`${who}施展 ${tag}，生机绵绵不绝`);
        return 0;
      case 'shield': {
        const boostShield = src.daoPath === '以土入道' ? 1.5 : 1;
        const sh = Math.round(src.maxHp * (e.value / 100) * mult * boostShield);
        src.shield += sh;
        say(`${who}施展 ${tag}，结起 ${cyan(String(sh))} 点护罩`);
        return 0;
      }
      case 'drain':
        return 0; // 由 castSpell 在 dmg 之后统一结算
      case 'buffAtk':
        src.atkPct += e.value * mult;
        say(`${who}施展 ${tag}，气势陡然一涨`);
        return 0;
      case 'weaken':
        dst.weakPct += e.value;
        say(yellow(`${who}施展 ${tag}，${dst.isPlayer ? '你的' : '对方'}攻势大减`));
        return 0;
      case 'vuln':
        addBuff(dst, 'vuln', e.value, e.turns ?? 2);
        say(yellow(`${who}施展 ${tag}，${dst.isPlayer ? '你的' : '其'}护体灵光现出裂痕`));
        return 0;
      case 'guard':
        addBuff(src, 'guard', e.value, e.turns ?? 2);
        say(`${who}施展 ${tag}，受创大减`);
        return 0;
      case 'thorn':
        addBuff(src, 'thorn', e.value, e.turns ?? 3);
        say(`${who}施展 ${tag}，近身者自伤`);
        return 0;
      case 'dodge':
        addBuff(src, 'dodge', e.value, e.turns ?? 2);
        say(`${who}施展 ${tag}，身形飘忽难测`);
        return 0;
      case 'stun': {
        const extra = src.daoPath === '以神入道' ? 1 : 0;
        addBuff(dst, 'stun', 0, (e.turns ?? 1) + extra);
        say(yellow(`${who}施展 ${tag}，${dst.isPlayer ? '你' : dst.name}被定住了！`));
        return 0;
      }
      case 'qi':
        src.qi = Math.min(src.maxQi, src.qi + e.value);
        say(magenta(`${who}施展 ${tag}，聚得 ${e.value} 点灵气`));
        return 0;
      case 'sap':
        dst.qi = Math.max(0, dst.qi - e.value);
        say(yellow(`${who}施展 ${tag}，震散${dst.isPlayer ? '你' : '其'} ${e.value} 点灵气`));
        return 0;
      case 'cleanse':
        src.buffs = src.buffs.filter((b) => !['dot', 'vuln'].includes(b.kind));
        src.weakPct = 0;
        say(`${who}施展 ${tag}，周身污浊一涤而空`);
        return 0;
      default:
        return 0;
    }
  }

  /** 施展一式神通的全部结算——敌我共用。 */
  const castSpell = (src: Side, dst: Side, name: string): void => {
    const def = SPELLS[name];
    const lv = Math.max(1, Math.min(SPELL_MAX_LV, src.spellLv[name] ?? 1));
    src.repeat = name === src.lastSpell ? src.repeat + 1 : 0;
    src.lastSpell = name;
    const fatigue = FATIGUE[Math.min(src.repeat, FATIGUE.length - 1)];
    const elem = elementMult(src.roots, def.element, dst.element, src.prevElem);
    // 化神入道：本系神通威力大增
    const pathMult = src.daoPath && def.element !== '无' && src.daoPath === `以${def.element}入道` ? 1.3 : 1;
    // 元婴「锋锐」：玩家每回合第一式威力加成
    const surge = src.isPlayer && vision?.kind === 'surge' && !castThisTurn ? 1 + vision.value / 100 : 1;
    const mult = spellPower(lv) * fatigue * elem.mult * pathMult * surge;

    src.qi -= def.cost;
    const tag = cyan(`【${def.name}】`);
    const notes = [...elem.notes];
    if (fatigue < 1) notes.push(`后继无力 ×${fatigue.toFixed(2)}`);
    // 画面：玩家用第二人称的 flavor，敌人用旁观视角的短句
    say(dim(src.isPlayer ? def.flavor : pick(FOE_CAST_LINES[def.element])));

    let dealt = 0;
    for (const e of def.effects) dealt += applyEffect(src, dst, e, mult, tag);
    const drain = def.effects.find((e) => e.kind === 'drain');
    if (drain && dealt > 0) {
      const h = Math.round(dealt * drain.value / 100);
      src.hp = Math.min(src.maxHp, src.hp + h);
      say(`血气倒卷而回，${src.isPlayer ? '你' : src.name}恢复 ${green(String(h))} 点气血`);
    }
    if (src.daoPath === '以火入道' && def.element === '火') addBuff(dst, 'dot', 12, 2, 1);
    if (notes.length > 0) say(dim(`（${notes.join('，')}）`));
    if (def.element !== '无') src.prevElem = def.element;
    if (src.isPlayer) castThisTurn = true;
  };

  /** 一次普通攻击（敌我共用）：它同时是聚气动作。 */
  const punch = (src: Side, dst: Side): void => {
    const swordPath = src.daoPath === '以剑入道' ? 1.6 : 1;
    const pierce = !src.isPlayer && enemy.pierce ? 1 - enemy.pierce : 1;
    const d = dealDamage(dst, Math.round(rawDamage(atkOf(src), Math.round(dst.def * pierce), PUNCH_COEF) * swordPath));
    src.qi = Math.min(src.maxQi, src.qi + 2);
    if (src.isPlayer) {
      say(`你凝神一击，造成 ${green(String(d))} 点伤害${dim('（聚气 +2）')}`);
      if (src.daoPath === '以剑入道') addBuff(dst, 'dot', Math.max(1, Math.round(d * 0.12)), 2, 1);
    } else {
      say(`${src.name}欺身近前，你受到 ${red(String(d))} 点伤害`);
    }
    src.lastSpell = '';
    src.repeat = 0;
  };

  /** 回合结束的持续效果结算（双方）。 */
  const tickEnd = (): void => {
    for (const s of [foeSide, me]) {
      // 多条灼蚀一次结算、一行播报——底层分条是为了各记各的跳伤，读者不必知道
      let burn = 0;
      for (const b of s.buffs) {
        if (b.kind === 'dot' && b.turns > 0) burn += dealDamage(s, b.value * b.stacks);
        if (b.kind === 'regen' && b.turns > 0) s.hp = Math.min(s.maxHp, s.hp + b.value);
      }
      if (burn > 0) say(`${s.isPlayer ? '你' : s.name}身上的灼蚀发作，${red(String(burn))} 点伤害`);
      for (const b of s.buffs) b.turns -= 1;
      s.buffs = s.buffs.filter((b) => b.turns > 0);
    }
    me.qi = Math.min(me.maxQi, me.qi + playerQiRegen(p) + (vision?.kind === 'qi' ? vision.value : 0));
    foeSide.qi = Math.min(foeSide.maxQi, foeSide.qi + 1);
    if (vision?.kind === 'regen') me.hp = Math.min(me.maxHp, me.hp + Math.round(me.maxHp * vision.value / 100));
    if (p.daoPath === '以木入道') me.hp = Math.min(me.maxHp, me.hp + Math.round(me.maxHp * 0.03));
    if (enemy.atkGrowth) foeSide.atkBase = Math.round(foeSide.atkBase * enemy.atkGrowth);
  };

  /** 敌人行动：先看能不能动，再由 AI 权重表选一式，选不出就普攻聚气。 */
  const enemyTurn = (): void => {
    if (hasBuff(foeSide, 'stun')) {
      say(dim(`${enemy.name}仍被定住，动弹不得`));
      return;
    }
    // 元婴「神御」：每三回合免疫一次
    if (vision?.kind === 'ward') {
      wardCounter += 1;
      if (wardCounter >= vision.value) {
        wardCounter = 0;
        say(dim('神御自转，这一击落在了空处'));
        return;
      }
    }
    // 天劫不讲道理：每回合一道雷，无视半数防御，也不吃闪避
    if (enemy.kind === '天劫') {
      // 护罩照常吸收——「结罩硬撑」正是渡劫唯一的正解，不能一雷抹平
      const d = dealDamage(me, rawDamage(atkOf(foeSide), Math.round(me.def * (1 - (enemy.pierce ?? 0))), 0.55));
      say(`${red('一道雷落下')}，你受到 ${red(String(d))} 点伤害`);
      return;
    }
    // 闪避：遁速差 + 身法
    const dodgePct = Math.min(35, Math.max(0, (me.spd - foeSide.spd) * 3) + sumBuff(me, 'dodge'));
    if (chance(dodgePct / 100)) {
      say(dim(`你侧身让开，${enemy.name}扑了个空`));
      return;
    }
    const choice = chooseFoeSpell(foeSide, me, mood);
    if (choice) castSpell(foeSide, me, choice);
    else punch(foeSide, me);
    // 反伤
    const thorn = sumBuff(me, 'thorn');
    if (thorn > 0 && foeSide.hp > 0) {
      const back = dealDamage(foeSide, Math.max(1, Math.round(me.maxHp * 0.02 * thorn / 10)));
      say(dim(`护体之火反噬，${enemy.name}受到 ${back} 点伤害`));
    }
  };

  /** 判定：回合到点时按剩余血量比例定胜负。 */
  const judge = (): CombatResult => (me.hp / me.maxHp >= foeSide.hp / foeSide.maxHp ? 'win' : 'lose');

  while (me.hp > 0 && (foeSide.hp > 0 || enemy.immortal)) {
    render(turn > 1);
    castThisTurn = false;

    if (hasBuff(me, 'stun')) {
      say(red('你被定在原地，这一回合动弹不得'));
      enemyTurn();
      tickEnd();
      turn += 1;
      if (roundLimit > 0 && turn > roundLimit) break;
      continue;
    }

    const usable = me.deck.filter((s) => SPELLS[s] && SPELLS[s].cost <= me.qi);
    const actions: Array<{ key: string; label: string }> = [];
    if (usable.length > 0) actions.push({ key: 'spell', label: '施法' });
    actions.push({ key: 'attack', label: '普通攻击' });
    // 没存货就不列这两项：菜单里不该有按了没用的按钮
    const canHeal = (p.pills['疗伤丹'] ?? 0) > 0 || (p.pills['回春丹'] ?? 0) > 0;
    const canTalisman = (p.talismans['烈焰符'] ?? 0) > 0 || (p.talismans['护身符'] ?? 0) > 0;
    if (!noItems && canHeal) actions.push({ key: 'heal', label: '疗伤' });
    if (!noItems && canTalisman) actions.push({ key: 'talisman', label: '符箓' });
    if (!noEscape) actions.push({ key: 'escape', label: arena ? '认输' : '逃跑' });
    const prompt = '选择行动：' + actions.map((a, i) => `${i + 1})${a.label}`).join(' ');
    const choices = actions.map((_, i) => String(i + 1));
    const defChoice = String(actions.findIndex((a) => a.key === 'attack') + 1);
    const choice = await io.ask(prompt, choices, defChoice);
    const idx = parseInt(choice, 10);
    if (isNaN(idx) || idx < 1 || idx > actions.length) continue;
    const action = actions[idx - 1].key;

    if (action === 'attack') {
      punch(me, foeSide);
    } else if (action === 'heal') {
      const pillName = (p.pills['疗伤丹'] ?? 0) > 0 ? '疗伤丹' : (p.pills['回春丹'] ?? 0) > 0 ? '回春丹' : null;
      if (!pillName) {
        say(red('你没有疗伤丹药'));
        continue;
      }
      p.pills[pillName] -= 1;
      const h = Math.round(me.maxHp * PILLS[pillName].value / 100);
      me.hp = Math.min(me.maxHp, me.hp + h);
      say(green(`你服下${pillName}，恢复 ${h} 点气血`));
    } else if (action === 'talisman') {
      if ((p.talismans['烈焰符'] ?? 0) > 0) {
        p.talismans['烈焰符'] -= 1;
        const d = dealDamage(foeSide, rawDamage(atkOf(me), foeSide.def, TALISMANS['烈焰符'].value / 100));
        say(`你掷出烈焰符，烈焰吞没敌人，造成 ${green(String(d))} 点伤害`);
      } else if ((p.talismans['护身符'] ?? 0) > 0) {
        p.talismans['护身符'] -= 1;
        const h = Math.round(me.maxHp * TALISMANS['护身符'].value / 100);
        me.hp = Math.min(me.maxHp, me.hp + h);
        say(green(`你祭出护身符，护体神光流转，恢复 ${h} 点气血`));
      } else {
        say(red('你没有符箓'));
        continue;
      }
    } else if (action === 'spell') {
      io.print(cyan('—— 神通 ——'));
      usable.forEach((s, i) => {
        const d = SPELLS[s];
        const lv = spellLevel(p, s);
        const fat = s === me.lastSpell ? FATIGUE[Math.min(me.repeat + 1, FATIGUE.length - 1)] : 1;
        const combo = d.element !== '无' && me.prevElem !== '无' && SHENG[me.prevElem] === d.element ? green(' 连击') : '';
        const ke = d.element !== '无' && KE[d.element] === foeSide.element ? yellow(' 克') : '';
        const fatTag = fat < 1 ? red(` 后继无力×${fat.toFixed(2)}`) : '';
        io.print(` ${i + 1}) ${d.element}·${s}${dim(`(${lv}层)`)} 耗气 ${d.cost}${combo}${ke}${fatTag}`);
        io.print(dim(`    ${d.desc}`));
      });
      io.print(' 0) 返回');
      const sc = await io.ask('施展：');
      if (sc === '0' || sc === '') continue;
      const si = parseInt(sc, 10);
      if (isNaN(si) || si < 1 || si > usable.length) {
        say(red('无效编号'));
        continue;
      }
      const sname = usable[si - 1];
      const sdef = SPELLS[sname];
      if (sdef.effects.some((e) => e.kind === 'escape')) {
        me.qi -= sdef.cost;
        render(true);
        await io.narrate(yellow(`${sdef.flavor}你成功脱身。`));
        return finish('escape');
      }
      castSpell(me, foeSide, sname);
      // 反伤：敌人身上的反伤在你出手后结算
      const thorn = sumBuff(foeSide, 'thorn');
      if (thorn > 0 && me.hp > 0) {
        const back = dealDamage(me, Math.max(1, Math.round(foeSide.maxHp * 0.02 * thorn / 10)));
        say(dim(`对方护体之力反噬，你受到 ${back} 点伤害`));
      }
    } else {
      if (arena) {
        render(true);
        await io.narrate(yellow('你抱拳认输，自行退下擂台。'));
        return finish('lose');
      }
      // 逃跑改成遁速检定：跑不跑得掉，看你平时有没有在身法上下功夫
      const gap = me.spd - foeSide.spd;
      const rate = Math.max(0.15, Math.min(0.95, 0.5 + gap * 0.08));
      if (chance(rate)) {
        render(true);
        await io.narrate(yellow(gap >= 3
          ? '你化作一道遁光破空而去，对方只能目瞪口呆地看着。'
          : '你且战且退，好一番周旋，终于脱身。'));
        return finish('escape');
      }
      say(red('遁速不及对方，逃跑失败，被追上狠揍一记！'));
    }

    if (foeSide.hp > 0 || enemy.immortal) enemyTurn();
    tickEnd();

    if (foeSide.hp <= 0 && !enemy.immortal) break;
    if (me.hp <= 0) break;
    turn += 1;
    if (turn > hardCap) break;
  }

  render(true);

  // —— 回合到点 ——
  if (turn > hardCap && me.hp > 0 && (foeSide.hp > 0 || enemy.immortal)) {
    if (onTimeout === 'win') {
      await io.narrate(green('你撑住了。'));
      return finish('win');
    }
    if (onTimeout === 'lose') return finish('lose');
    const r = judge();
    await io.narrate(r === 'win'
      ? green('时辰已到，裁判举旗——你气血尚足，这一场判你胜。')
      : yellow('时辰已到，裁判举旗——你气血不济，这一场判你负。'));
    if (r === 'win') p.fightsWon += 1;
    return finish(r);
  }

  // —— 败 ——
  if (me.hp <= 0) {
    if (noDeath) {
      me.hp = 1;
      await io.narrate(yellow(arena
        ? `你力竭失手，被${enemy.name}一击震落${fight === '擂台' ? '擂台' : '场外'}。`
        : '你力竭倒地，勉强留了一口气。'));
      return finish('lose');
    }
    await io.narrate(red('你力竭倒下，被敌人重创！'));
    p.spirit = Math.max(0, p.spirit - Math.floor(enemy.loot / 2));
    p.heart = Math.max(0, p.heart - 5);
    await io.narrate(`你狼狈逃脱，遗失灵石若干（剩 ${p.spirit}）。`);
    return finish('lose');
  }

  // —— 胜 ——
  if (arena) {
    await io.narrate(green(`${enemy.name}退步抱拳：「承让。」这一场，是你赢了。`));
    p.fightsWon += 1;
    if (sectOf(p)?.traitKey === 'battleHeart') {
      p.heart = Math.min(100, p.heart + 1); // 太乙剑宗剑心通明
      io.print(dim('剑心通明，心境 +1。'));
    }
    return finish('win');
  }
  if (fight === '心魔' || fight === '天劫') return finish('win');

  await io.narrate(green(`你击杀了 ${enemy.name}！`));
  p.fightsWon += 1;
  let loot = enemy.loot;
  if (sectOf(p)?.traitKey === 'battleLoot') loot = Math.floor(loot * 1.2); // 血煞魔宗杀伐证道
  p.spirit += loot;
  io.print(`搜刮战场，获得 ${yellow(String(loot))} 灵石。`);
  if (sectOf(p)?.traitKey === 'battleHeart') {
    p.heart = Math.min(100, p.heart + 1);
    io.print(dim('剑心通明，心境 +1。'));
  }
  if (chance(0.1)) {
    const t = pick(Object.keys(TECHNIQUES));
    p.fragments[t] = (p.fragments[t] ?? 0) + 1;
    io.print(dim(`缴获《${t}》残篇×1。`));
  }
  if (chance(0.35)) {
    const mat = pick(Object.keys(MATERIALS));
    const qty = 1 + Math.floor(p.realmIdx / 2); // 材料产出随境界适度放大
    p.materials[mat] = (p.materials[mat] ?? 0) + qty;
    io.print(`并获得 ${cyan(mat)}×${qty}。`);
  }
  // 法宝与玉简只从「人」身上缴获——妖兽身上摸不出一柄剑，更摸不出一卷玉简
  const humanoid = kind === '修士' || kind === '魔修' || kind === '天骄' || kind === '同门';
  if (humanoid && chance(0.18)) {
    const t = pick(Object.keys(TREASURES));
    const curTier = TREASURES[p.treasure]?.tier ?? 0;
    if (TREASURES[t].tier > curTier) {
      p.treasure = t;
      io.print(`缴获法宝 ${cyan(t)}！`);
    } else {
      io.print(`缴获法宝 ${t}，但不如你现有法宝，弃之。`);
    }
  }
  // 打谁像谁：从对手牌组里学一式，比随机掉落更有来由
  if (humanoid && chance(0.15)) {
    const pool = enemy.deck.filter((n) => !(p.spells ?? []).includes(n));
    if (pool.length > 0) {
      const got = pick(pool);
      if (learnSpell(p, got)) io.print(`你就着方才的记忆推演其法门，竟习得 ${magenta(got)}！`);
    }
  }
  return finish('win');
}
