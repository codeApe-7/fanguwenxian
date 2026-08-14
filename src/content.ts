// 游戏静态数据 + 由状态推导出的属性计算（纯函数，与终端/网页无关）。

import type { Player } from './types.js';

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
  { name: '筑基期', stages: ['初期', '中期', '后期', '大圆满'], lifespan: 200, difficulty: 0.7, breakPill: '结丹丹' },
  { name: '结丹期', stages: ['初期', '中期', '后期', '大圆满'], lifespan: 500, difficulty: 0.5, breakPill: '婴变丹' },
  { name: '元婴期', stages: ['初期', '中期', '后期', '大圆满'], lifespan: 1000, difficulty: 0.35, breakPill: '化神丹' },
  { name: '化神期', stages: ['初期', '中期', '后期', '大圆满'], lifespan: 2000, difficulty: 0.25, breakPill: '炼虚丹' },
  { name: '炼虚期', stages: ['初期', '中期', '后期', '大圆满'], lifespan: 5000, difficulty: 0.18, breakPill: '合体丹' },
  { name: '合体期', stages: ['初期', '中期', '后期', '大圆满'], lifespan: 10000, difficulty: 0.12, breakPill: '大乘丹' },
  { name: '大乘期', stages: ['初期', '中期', '后期', '大圆满'], lifespan: 20000, difficulty: 0.08, breakPill: '渡劫丹' },
  { name: '渡劫期', stages: ['初期', '中期', '后期', '大圆满'], lifespan: 50000, difficulty: 0.05, breakPill: null },
];

// ---- 灵根 ----
export interface RootDef {
  name: string;
  mult: number;   // 修炼倍率
  prob: number;   // 出现概率
}

export const ROOTS: RootDef[] = [
  { name: '天灵根', mult: 5.0, prob: 0.02 },
  { name: '异灵根', mult: 3.5, prob: 0.05 },
  { name: '双灵根', mult: 2.0, prob: 0.13 },
  { name: '三灵根', mult: 1.2, prob: 0.25 },
  { name: '四灵根', mult: 0.7, prob: 0.30 },
  { name: '五灵根', mult: 0.4, prob: 0.25 },
];

// ---- 修炼功法 ----
export interface TechniqueDef {
  mult: number;      // 修炼倍率
  atk?: number;      // 攻击加成（主修时生效）
  hp?: number;       // 气血加成（主修时生效）
  lifespan?: number; // 初次修习寿元 +N（一次性）
  sect?: string;     // 镇宗功法：仅该宗门藏经阁可兑换
  tier?: 1 | 2 | 3;  // 品阶：1=凡品（缺省） 2=灵品 3=仙品（仙品不售，仅残篇/奇遇）
  spells?: string[]; // 修习时附带的法术/神通
  desc: string;      // 功效描述
}

export const TECHNIQUES: Record<string, TechniqueDef> = {
  // —— 通用主修（凡品，坊市/藏经阁有售） ——
  基础吐纳术: { mult: 1.0, desc: '入门吐纳，无甚出奇。' },
  青灵诀: { mult: 1.3, spells: ['回春术'], desc: '青木灵气，滋养经脉。' },
  玄霜诀: { mult: 1.5, spells: ['冰锥术'], desc: '凝气成霜，道基渐固。' },
  紫薇心经: { mult: 2.0, spells: ['掌心雷'], desc: '接引紫薇星力，妙不可言。' },
  九转玄元功: { mult: 2.5, spells: ['五雷轰顶'], desc: '九转轮回，玄元不息。' },
  太上忘尘经: { mult: 3.0, spells: ['摄魂术'], desc: '太上忘情，尘缘尽断。' },
  // —— 通用炼体 / 养寿 / 攻伐（凡品，坊市有售） ——
  金刚淬体功: { mult: 1.1, hp: 25, spells: ['金刚罩'], desc: '炼体功法，铜皮铁骨。' },
  铁骨功: { mult: 1.1, hp: 30, spells: ['战意诀'], desc: '锻骨如铁，气血悠长。' },
  龟息诀: { mult: 1.0, lifespan: 15, spells: ['敛息术'], desc: '龟息吐纳，延年益寿。' },
  养生诀: { mult: 1.1, lifespan: 10, spells: ['甘霖咒'], desc: '调和阴阳，颐养天年。' },
  御风诀: { mult: 1.2, atk: 5, spells: ['疾风斩'], desc: '身法御风，疾如流影。' },
  烈阳掌: { mult: 1.2, atk: 8, spells: ['火球术'], desc: '至阳掌力，焚金裂石。' },
  玄冥劲: { mult: 1.2, atk: 8, spells: ['冰封千里'], desc: '阴寒劲力，透骨伤髓。' },
  狂雷劲: { mult: 1.25, atk: 10, spells: ['掌心雷'], desc: '雷霆劲力，刚猛无俦。' },
  磐石功: { mult: 1.1, hp: 35, spells: ['金刚罩'], desc: '立如磐石，稳若泰山。' },
  洗髓经: { mult: 1.3, hp: 10, spells: ['回春术'], desc: '洗髓伐骨，脱胎换骨。' },
  玄龟甲功: { mult: 1.05, hp: 40, spells: ['金刚罩'], desc: '玄龟负甲，刀枪难入。' },
  延寿经: { mult: 1.0, lifespan: 20, spells: ['甘霖咒'], desc: '静心延寿，颐养天年。' },
  回春功: { mult: 1.2, lifespan: 8, hp: 5, spells: ['枯木逢春'], desc: '枯木回春，气血渐旺。' },
  青囊诀: { mult: 1.15, lifespan: 12, spells: ['回春术'], desc: '青囊妙法，济世养身。' },
  凝神诀: { mult: 1.35, spells: ['定身术'], desc: '凝神静气，事半功倍。' },
  五禽戏: { mult: 1.15, hp: 8, lifespan: 5, spells: ['战意诀'], desc: '五禽之戏，强身健骨。' },
  // —— 镇宗功法（灵品，各宗门藏经阁专属） ——
  青霄剑诀: { mult: 1.4, atk: 20, sect: '太乙剑宗', tier: 2, spells: ['御剑术', '剑气纵横'], desc: '剑意冲霄，无坚不摧。' },
  太清玉册: { mult: 1.6, sect: '玄清门', tier: 2, spells: ['掌心雷', '定身术'], desc: '太清正法，中正平和。' },
  阴阳和合功: { mult: 1.5, hp: 15, sect: '合欢宗', tier: 2, spells: ['甘霖咒'], desc: '阴阳相济，神完气足。' },
  血煞魔功: { mult: 1.9, atk: 12, sect: '血煞魔宗', tier: 2, spells: ['血祭大法'], desc: '血煞入体，杀伐速成。' },
  金刚降魔功: { mult: 1.5, hp: 25, sect: '净禅寺', tier: 2, spells: ['金刚罩', '困神术'], desc: '金刚怒目，降魔护体。' },
  青木养气诀: { mult: 1.3, lifespan: 15, sect: '丹霞谷', tier: 2, spells: ['枯木逢春'], desc: '青木药气，养寿延年。' },
  九炼玄体功: { mult: 1.3, hp: 20, sect: '天工坊', tier: 2, spells: ['战意诀'], desc: '九炼淬体，器修根基。' },
  符胆真经: { mult: 1.4, atk: 8, sect: '万符门', tier: 2, spells: ['困神术'], desc: '符胆藏神，一笔御敌。' },
  星罗阵诀: { mult: 1.5, hp: 10, sect: '太虚阵宗', tier: 2, spells: ['困神术'], desc: '星罗棋布，借阵护身。' },
  // —— 五行流派（灵品，坊市/藏经阁有售） ——
  庚金诀: { mult: 1.25, atk: 8, tier: 2, spells: ['御剑术'], desc: '金行功法，锐不可当。' },
  乙木经: { mult: 1.25, hp: 10, tier: 2, spells: ['回春术'], desc: '木行功法，生机绵长。' },
  离火诀: { mult: 1.25, atk: 8, tier: 2, spells: ['烈焰焚天'], desc: '火行功法，烈焰灼灼。' },
  碧波心法: { mult: 1.25, hp: 8, tier: 2, spells: ['甘霖咒'], desc: '水行功法，润泽万物。' },
  厚土功: { mult: 1.25, hp: 12, tier: 2, spells: ['金刚罩'], desc: '土行功法，厚重如山。' },
  // —— 冷门流派（灵品，坊市/藏经阁有售） ——
  清音诀: { mult: 1.3, hp: 5, tier: 2, spells: ['天音破'], desc: '音修功法，余音绕梁。' },
  天籁真经: { mult: 1.5, hp: 15, tier: 2, spells: ['天音破'], desc: '天籁之音，震人心魄。' },
  傀儡真解: { mult: 1.3, atk: 5, tier: 2, spells: ['傀儡术'], desc: '傀修功法，操偶如臂。' },
  万傀大法: { mult: 1.5, atk: 10, tier: 2, spells: ['傀儡术'], desc: '万傀齐出，如臂使指。' },
  御兽心经: { mult: 1.3, hp: 8, tier: 2, spells: ['御兽突袭'], desc: '御兽之法，灵兽护身。' },
  万兽诀: { mult: 1.4, hp: 15, tier: 2, spells: ['御兽突袭'], desc: '万兽听令，莫敢不从。' },
  万毒真经: { mult: 1.4, atk: 10, tier: 2, spells: ['毒雾术'], desc: '毒修功法，百毒不侵。' },
  蛊心诀: { mult: 1.5, atk: 12, tier: 2, spells: ['万蛊噬心'], desc: '蛊术心法，噬心蚀骨。' },
  纯阳诀: { mult: 1.45, hp: 8, tier: 2, spells: ['烈焰焚天'], desc: '纯阳之体，百邪不侵。' },
  太阴炼神诀: { mult: 1.4, tier: 2, spells: ['摄魂术'], desc: '太阴炼神，神识大增。' },
  // —— 仙品（不售，仅残篇/奇遇可得） ——
  太虚引星诀: { mult: 2.8, atk: 15, tier: 3, spells: ['万剑归宗'], desc: '引星辰之力，无坚不摧。' },
  混沌归元功: { mult: 2.6, hp: 30, tier: 3, spells: ['枯木逢春'], desc: '混沌归元，生生不息。' },
  造化长生经: { mult: 2.2, lifespan: 30, tier: 3, spells: ['甘霖咒'], desc: '造化加身，长生可期。' },
  混元一气功: { mult: 2.4, atk: 10, hp: 20, tier: 3, spells: ['五雷轰顶'], desc: '混元一气，天地同力。' },
  无上剑经: { mult: 2.3, atk: 25, tier: 3, spells: ['万剑归宗'], desc: '无上剑道，一剑破万法。' },
};

// ---- 神通 / 法术（战斗中施展，每战限次） ----
export interface SpellDef {
  name: string;
  type: 'atk' | 'heal' | 'buff' | 'debuff' | 'stun' | 'escape';
  value: number;   // 伤害/治疗/增益/减益数值
  uses: number;    // 每战可用次数
  desc: string;
}

export const SPELLS: Record<string, SpellDef> = {
  御剑术: { name: '御剑术', type: 'atk', value: 20, uses: 2, desc: '飞剑取敌首级，造成 20 伤害' },
  剑气纵横: { name: '剑气纵横', type: 'atk', value: 35, uses: 2, desc: '剑气四射，造成 35 伤害' },
  万剑归宗: { name: '万剑归宗', type: 'atk', value: 60, uses: 1, desc: '万剑齐发，造成 60 伤害' },
  火球术: { name: '火球术', type: 'atk', value: 15, uses: 3, desc: '凝火成球，造成 15 伤害' },
  烈焰焚天: { name: '烈焰焚天', type: 'atk', value: 45, uses: 2, desc: '焚天烈焰，造成 45 伤害' },
  冰锥术: { name: '冰锥术', type: 'atk', value: 15, uses: 3, desc: '寒气化锥，造成 15 伤害' },
  冰封千里: { name: '冰封千里', type: 'atk', value: 40, uses: 2, desc: '千里冰封，造成 40 伤害' },
  掌心雷: { name: '掌心雷', type: 'atk', value: 18, uses: 3, desc: '掌心生雷，造成 18 伤害' },
  五雷轰顶: { name: '五雷轰顶', type: 'atk', value: 50, uses: 2, desc: '天雷轰顶，造成 50 伤害' },
  血祭大法: { name: '血祭大法', type: 'atk', value: 45, uses: 2, desc: '以血祭魔，造成 45 伤害' },
  摄魂术: { name: '摄魂术', type: 'atk', value: 25, uses: 2, desc: '摄魂夺魄，造成 25 伤害' },
  毒雾术: { name: '毒雾术', type: 'atk', value: 20, uses: 3, desc: '毒雾弥漫，造成 20 伤害' },
  万蛊噬心: { name: '万蛊噬心', type: 'atk', value: 40, uses: 2, desc: '万蛊噬心，造成 40 伤害' },
  傀儡术: { name: '傀儡术', type: 'atk', value: 30, uses: 2, desc: '傀儡扑杀，造成 30 伤害' },
  天音破: { name: '天音破', type: 'atk', value: 28, uses: 2, desc: '音波裂空，造成 28 伤害' },
  御兽突袭: { name: '御兽突袭', type: 'atk', value: 25, uses: 2, desc: '灵兽扑袭，造成 25 伤害' },
  疾风斩: { name: '疾风斩', type: 'atk', value: 15, uses: 3, desc: '疾风快斩，造成 15 伤害' },
  回春术: { name: '回春术', type: 'heal', value: 30, uses: 2, desc: '枯木回春，恢复 30 气血' },
  枯木逢春: { name: '枯木逢春', type: 'heal', value: 60, uses: 2, desc: '生机灌注，恢复 60 气血' },
  甘霖咒: { name: '甘霖咒', type: 'heal', value: 50, uses: 2, desc: '天降甘霖，恢复 50 气血' },
  金刚罩: { name: '金刚罩', type: 'debuff', value: 10, uses: 2, desc: '金钟护体，敌人攻击 −10' },
  敛息术: { name: '敛息术', type: 'debuff', value: 5, uses: 2, desc: '敛息藏形，敌人攻击 −5' },
  战意诀: { name: '战意诀', type: 'buff', value: 10, uses: 2, desc: '战意如虹，本场攻击 +10' },
  定身术: { name: '定身术', type: 'stun', value: 0, uses: 1, desc: '定住敌人一回合' },
  困神术: { name: '困神术', type: 'stun', value: 0, uses: 1, desc: '困住敌人一回合' },
  土遁术: { name: '土遁术', type: 'escape', value: 0, uses: 1, desc: '遁地脱身，必定逃脱' },
};

/** 主修功法进阶顺序（道统现世/宗门战争/宗主传承按此升级）。 */
export const TECH_ORDER = ['基础吐纳术', '青灵诀', '玄霜诀', '紫薇心经', '九转玄元功', '太上忘尘经'];

/** 功法功效摘要（展示用，含品阶前缀）。 */
export function techniqueSummary(name: string): string {
  const d = TECHNIQUES[name];
  if (!d) return '';
  const tier = ['', '灵品·', '仙品·'][d.tier ?? 1];
  const parts = [`修炼×${d.mult}`];
  if (d.atk) parts.push(`攻击+${d.atk}`);
  if (d.hp) parts.push(`气血+${d.hp}`);
  if (d.lifespan) parts.push(`寿元+${d.lifespan}`);
  if (d.spells?.length) parts.push(`神通：${d.spells.join('/')}`);
  return tier + parts.join('，');
}

/** 习得功法：记录入库（不自动改修），结算一次性效果（寿元等仅首次生效），附带神通。 */
export function learnTechnique(p: Player, name: string): void {
  p.techProficiency[name] ??= 0; // 习得入库
  const def = TECHNIQUES[name];
  if (def?.lifespan && !p.mastered.includes(name)) {
    p.mastered.push(name);
    p.lifespan += def.lifespan;
  }
  if (def?.spells) {
    for (const s of def.spells) {
      if (!p.spells.includes(s)) p.spells.push(s);
    }
  }
}

/** 切换主修功法（须已习得），返回是否成功。 */
export function switchTechnique(p: Player, name: string): boolean {
  if (!(name in (p.techProficiency ?? {}))) return false;
  p.technique = name;
  return true;
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
  value: number;   // 修为丹效果值 / 疗伤丹回血量 / 解毒丹清除丹毒量
  price: number;
}

export const PILLS: Record<string, PillDef> = {
  凝气丹: { type: 'xiu', value: 10, price: 30 },
  聚灵丹: { type: 'xiu', value: 25, price: 80 },
  疗伤丹: { type: 'heal', value: 40, price: 20 },
  回春丹: { type: 'heal', value: 100, price: 60 },
  净元丹: { type: 'detox', value: 30, price: 120 },
  筑基丹: { type: 'break', value: 0, price: 200 },
  结丹丹: { type: 'break', value: 0, price: 600 },
  婴变丹: { type: 'break', value: 0, price: 1500 },
  化神丹: { type: 'break', value: 0, price: 4000 },
  炼虚丹: { type: 'break', value: 0, price: 10000 },
  合体丹: { type: 'break', value: 0, price: 30000 },
  大乘丹: { type: 'break', value: 0, price: 80000 },
  渡劫丹: { type: 'break', value: 0, price: 200000 },
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

// ---- 法宝（名称 -> [攻击加成, 价格]） ----
export const TREASURES: Record<string, [number, number]> = {
  松纹剑: [5, 120],
  赤鳞刀: [10, 350],
  寒玉剑: [18, 900],
  惊雷鞭: [30, 2500],
  云海扇: [50, 7000],
  太虚剑: [90, 25000],
};

// ---- 四艺副业技能名（需机缘解锁） ----
export const SKILLS = ['炼丹', '炼器', '阵法', '符箓'] as const;

// ---- 炼器配方（成品法宝 -> {材料 -> 数量}） ----
export const FORGE_RECIPES: Record<string, Record<string, number>> = {
  松纹剑: { 妖兽内丹: 1, 灵石精: 1 },
  赤鳞刀: { 妖兽内丹: 2, 灵石精: 1 },
  寒玉剑: { 妖兽内丹: 3, 灵石精: 2 },
  惊雷鞭: { 妖兽内丹: 5, 灵石精: 3 },
  云海扇: { 妖兽内丹: 8, 灵石精: 5 },
  太虚剑: { 妖兽内丹: 15, 灵石精: 10 },
};

// ---- 阵法（名称 -> 定义） ----
export interface FormationDef {
  cost: Record<string, number>; // 布阵消耗材料
  desc: string;
  atk: number;    // 攻击加成
  def: number;    // 防御加成
  cult: number;   // 修炼倍率加成（1 = 无加成）
}

export const FORMATIONS: Record<string, FormationDef> = {
  聚灵阵: { cost: { 灵草: 3 }, desc: '修炼速度 +20%', atk: 0, def: 0, cult: 1.2 },
  铁壁阵: { cost: { 妖兽内丹: 2 }, desc: '防御 +10', atk: 0, def: 10, cult: 1.0 },
  七杀阵: { cost: { 妖兽内丹: 3, 灵石精: 2 }, desc: '攻击 +15', atk: 15, def: 0, cult: 1.0 },
};

// ---- 符箓（名称 -> 定义） ----
export interface TalismanDef {
  cost: Record<string, number>; // 制符消耗材料
  type: 'atk' | 'def' | 'cult'; // 攻击符 / 护身符 / 聚灵符
  value: number;
  desc: string;
}

export const TALISMANS: Record<string, TalismanDef> = {
  烈焰符: { cost: { 灵花: 1, 灵草: 1 }, type: 'atk', value: 20, desc: '战斗中造成 20 伤害' },
  护身符: { cost: { 灵草: 2 }, type: 'def', value: 20, desc: '战斗中恢复 20 气血' },
  聚灵符: { cost: { 灵草: 3, 灵花: 1 }, type: 'cult', value: 15, desc: '修炼时修为 +15' },
};

// ---- 金手指（开局三选一） ----
export interface GoldenFingerDef {
  name: string;
  desc: string;
  cheatBonus: number;              // 修炼倍率
  spirit?: number;                 // 赠灵石
  pill?: string;                   // 赠丹药
  material?: Record<string, number>; // 赠材料
}

export const GOLDEN_FINGERS: GoldenFingerDef[] = [
  { name: '太初瓶', desc: '可催熟灵药、逆转光阴，修炼 ×2.0', cheatBonus: 2.0, material: { 灵草: 3 } },
  { name: '造化珠', desc: '气运加身，修炼 ×1.6，赠筑基丹一枚', cheatBonus: 1.6, pill: '筑基丹' },
  { name: '天机盘', desc: '推演天机，修炼 ×1.4，赠灵石 300', cheatBonus: 1.4, spirit: 300 },
];

// ---- 主线事件链（剧本专属，按年龄触发） ----
export interface StoryEffects {
  spirit?: number;
  heart?: number;
  cult?: number;
  pill?: string;
  material?: Record<string, number>;
  skill?: string;   // 解锁副业
  heroine?: string; // 登场专属女主（对应 SCENARIO_HEROINES 的 key）
}

export interface StoryCombat {
  intro?: string;          // 战斗开场白（{enemy} 占位）
  winText: string[];       // 胜利后叙述
  loseText: string[];      // 失败后叙述
  winEffects?: StoryEffects;
  loseEffects?: StoryEffects;
}

export interface StoryChoice {
  label: string;
  result: string[];      // 结果/引导叙述
  effects?: StoryEffects;
  combat?: StoryCombat;  // 有则触发真实战斗
}

export interface StoryBeat {
  age: number;           // 触发年龄（>=）
  text: string[];        // 事件叙述
  choices?: StoryChoice[]; // 有则分支，无则纯剧情
  effects?: StoryEffects;  // 无分支时的固定效果
}

export const STORYLINES: Record<string, StoryBeat[]> = {
  // —— 天命凡骨：废柴逆袭 + 神秘骨片 ——
  天命凡骨: [
    {
      age: 18,
      text: [
        '你离乡那年，贴身的那枚骨片忽而发烫，似有所感。',
        '夜深人静时，你以神识探入，竟见其上浮现几行玄奥仙文。',
        '你如饥似渴地参悟，一夜之间，只觉气海翻涌，修为大涨！',
      ],
      effects: { cult: 20, heart: 5 },
    },
    {
      age: 20,
      text: [
        '这一日，你在村口遇见一位采药归来的少女，眉眼温柔，正是与你自幼一起长大的苏婉清。',
        '她见你已踏上仙途，眼中既有欢喜，又藏着一丝落寞。',
        '「仙途漫漫……你还会回来么？」她轻声问道。',
      ],
      effects: { heroine: '苏婉清', heart: 5 },
    },
    {
      age: 25,
      text: [
        '这一日，骨片忽而震动，引你至一处荒山野涧。',
        '你循迹而去，竟是一座尘封多年的上古洞府。',
      ],
      choices: [
        { label: '入内探宝', result: ['你推开洞府石门，一具守护傀儡忽而苏醒，眼泛红芒。'], combat: {
            intro: '洞府之内，一道守护强敌挡在身前——正是 {enemy}！',
            winText: ['你击碎傀儡，采得洞府内灵草灵花，更于玉匣中寻得一瓶丹药。'],
            loseText: ['傀儡强横，你负伤遁走，只抢得几株灵草。'],
            winEffects: { material: { 灵草: 3, 灵花: 2 }, pill: '聚灵丹' },
            loseEffects: { material: { 灵草: 1 } },
          } },
        { label: '谨慎退去', result: ['你按捺住贪念，牢记方位，待日后再来，心境愈发沉稳。'], effects: { heart: 8 } },
      ],
    },
    {
      age: 35,
      text: [
        '你返乡探望，当年讥你「痴心妄想」的乡邻，如今早已白发苍苍，仍是一介凡人。',
        '他们见你容颜未老、气度不凡，皆惶惶下拜。',
      ],
      choices: [
        { label: '以德报怨，指点一二', result: ['你念及旧情，点化一二。昔日恩怨随风而散，心境通明。'], effects: { heart: 10 } },
        { label: '漠然一笑，转身离去', result: ['你心无波澜，拂袖而去。昔日种种，已如浮云过眼。'], effects: { heart: 2, cult: 10 } },
      ],
    },
    {
      age: 50,
      text: [
        '这一日，骨片嗡鸣大作，裂作光雨，没入你眉心。',
        '一段残缺记忆涌入脑海——这竟是一位上古散修大能的毕生感悟。',
        '你豁然开朗，只觉一道桎梏已久的瓶颈悄然松动。',
      ],
      effects: { cult: 40, heart: 5 },
    },
  ],

  // —— 世家贵子：灭门之仇 + 血书 ——
  世家贵子: [
    {
      age: 18,
      text: [
        '你离家未久，噩耗传来：家族一位长辈遭人暗算，重伤垂死。',
        '临死前，他只留一句：灭门之人，与那封血书同源。',
        '你攥紧双拳，立誓血债血偿，化悲愤为修行动力。',
      ],
      effects: { cult: 10, heart: -5 },
    },
    {
      age: 20,
      text: [
        '追查仇家途中，你救下一名被仇家爪牙围困的女子。她自称顾清音，竟正是仇家之女。',
        '她早已知晓家族恶行，心灰意冷，愿助你查明真相。',
        '爱恨之间，一段纠葛就此埋下。',
      ],
      effects: { heroine: '顾清音', heart: 3 },
    },
    {
      age: 25,
      text: [
        '你暗中追查多年，终于查明仇家乃一魔道家族，当年为夺你家传功法而痛下杀手。',
      ],
      choices: [
        { label: '立刻上门复仇', result: ['你怒不可遏，孤身杀上仇家山门。'], combat: {
            intro: '仇家爪牙倾巢而出，为首的强敌正是 {enemy}！',
            winText: ['你大杀四方，重创仇家爪牙，夺回部分家产。'],
            loseText: ['仇家早有防备，你寡不敌众，负伤而退。'],
            winEffects: { spirit: 200 },
            loseEffects: { heart: -3 },
          } },
        { label: '隐忍布局，徐图之', result: ['你按兵不动，暗中联络旧部、积蓄实力。成大事者，忍字当头。'], effects: { heart: 6, cult: 10 } },
      ],
    },
    {
      age: 35,
      text: [
        '仇家终是坐不住了，倾巢来犯，欲斩草除根。',
        '你临危不乱，与家族残部并肩，血战一场。',
      ],
      choices: [
        { label: '正面迎战', result: ['你拔剑而起，与仇家精锐正面交锋。'], combat: {
            intro: '仇家精锐倾巢而来，为首强敌正是 {enemy}！',
            winText: ['你以强横修为连斩数敌，仇家溃退。经此一役，你名震一方。'],
            loseText: ['仇家势大，你血战受创，暂避锋芒。'],
            winEffects: { spirit: 300, heart: 5 },
            loseEffects: { heart: -5 },
          } },
        { label: '设伏智取', result: ['你设下埋伏，引敌入瓮，大获全胜，更缴获大批战利品。'], effects: { spirit: 400, material: { 灵石精: 2 } } },
      ],
    },
    {
      age: 50,
      text: [
        '多年筹谋，你终将仇家满门击破，血海深仇，今日得雪。',
        '在仇家密室中，你寻回了那卷被夺走的家传功法。',
        '抚着卷轴，你长跪在先祖灵前，泪如雨下，如释重负。',
      ],
      effects: { heart: 10, cult: 30 },
    },
  ],

  // —— 逍遥浪子：秘境寻宝 + 残破地图 ——
  逍遥浪子: [
    {
      age: 18,
      text: [
        '你终于参透了那残破地图上隐晦的标记——所指正是千里外的一处上古秘境。',
        '你收拾行囊，踏上寻宝之路。',
      ],
      effects: { heart: 3, cult: 5 },
    },
    {
      age: 20,
      text: [
        '寻宝路上，你在茶棚结识一位负剑的散修侠女，自称白灵儿，性子豪爽，与你一见如故。',
        '三言两语间，她听说你要去秘境，眼睛登时一亮。',
        '「不如结伴同行，路上也好有个照应。」',
      ],
      effects: { heroine: '白灵儿', heart: 5 },
    },
    {
      age: 25,
      text: [
        '历经波折，你寻得秘境入口。然入口处已聚集数位散修，彼此虎视眈眈。',
      ],
      choices: [
        { label: '与散修结伴同闯', result: ['你与几位散修结盟，各取所需。虽分薄了收获，却也避开了凶险。'], effects: { spirit: 150, heart: 5 } },
        { label: '独来独往，独自闯入', result: ['你避开众人，独自深入。秘境凶险，你却也因此独揽机缘。'], effects: { material: { 妖兽内丹: 2 }, heart: -3 } },
      ],
    },
    {
      age: 35,
      text: [
        '你闯入秘境核心，一株万年灵药与一件无主法宝静静悬浮于祭台之上。',
        '守护灵兽的咆哮声由远及近。',
      ],
      choices: [
        { label: '强行夺取灵药', result: ['你飞身扑向灵药，守护灵兽怒吼着扑来。'], combat: {
            intro: '守护之物现出原形——正是 {enemy}！',
            winText: ['你斩杀灵兽，夺下万年灵药，服之修为大涨！'],
            loseText: ['灵兽凶悍，你负伤败退，灵药失之交臂。'],
            winEffects: { cult: 30 },
            loseEffects: { heart: -3 },
          } },
        { label: '取走法宝', result: ['你眼疾手快，卷走法宝，夺路而逃。'], effects: { material: { 灵石精: 3 }, spirit: 200 } },
      ],
    },
    {
      age: 50,
      text: [
        '秘境最深处，你见到一位上古散修的坐化遗蜕。',
        '他身旁留有一卷《散修手札》——原来这秘境主人，也是一位无门无派的逍遥散修。',
        '你肃然起敬，替他收敛遗蜕，得其传承。',
      ],
      effects: { cult: 30, heart: 8, skill: '阵法' },
    },
  ],

  // —— 魔星降世：魔胎 + 正邪之辨 ——
  魔星降世: [
    {
      age: 18,
      text: [
        '月圆之夜，你体内魔胎躁动，一股暴虐之意直冲识海。',
        '你咬紧牙关，与那股魔念相抗。',
      ],
      choices: [
        { label: '强行压制', result: ['你运转功法，将魔念压下。虽苦不堪言，道心却愈发坚定。'], effects: { heart: 8 } },
        { label: '顺其自然，借魔修行', result: ['你顺势引导魔气入体，修为暴涨，只是心境蒙尘。'], effects: { cult: 25, heart: -8 } },
      ],
    },
    {
      age: 20,
      text: [
        '月下荒原，你遇一名黑衣女子独自抚琴，眉眼妖冶，正是魔道中赫赫有名的妖女墨离。',
        '她似笑非笑地瞥向你：「魔胎躁动的滋味，不好受吧？」',
        '你心下一凛——她竟一眼看穿你的隐秘。',
      ],
      effects: { heroine: '墨离', heart: 3 },
    },
    {
      age: 25,
      text: [
        '你身怀魔气之事，终究瞒不过正道修士。一队除魔卫寻上门来。',
      ],
      choices: [
        { label: '坦诚相告，自证清白', result: ['你剖明心迹，愿以道心约束魔胎。对方将信将疑，暂且退去。'], effects: { heart: 5 } },
        { label: '一言不合，拔刀相向', result: ['你冷笑一声，魔气翻涌，与除魔卫激战。'], combat: {
            intro: '除魔卫结阵杀来，为首的强敌正是 {enemy}！',
            winText: ['你将除魔卫尽数击退，却也坐实了「魔头」之名。'],
            loseText: ['除魔卫手段狠辣，你负伤远遁。'],
            winEffects: { spirit: 150 },
            loseEffects: { heart: -5 },
          } },
      ],
    },
    {
      age: 35,
      text: [
        '魔胎臻至大成，你站在了人魔之间的十字路口。',
        '一念成魔，一念成佛。',
      ],
      choices: [
        { label: '坠入魔道', result: ['你彻底放开束缚，魔气冲天。从此杀伐随心，修为一日千里。'], effects: { cult: 40, heart: -15 } },
        { label: '渡化魔胎', result: ['你以大毅力炼化魔胎，将魔性化入己道。此路凶险，终得正果。'], effects: { heart: 12, cult: 15 } },
      ],
    },
    {
      age: 50,
      text: [
        '多年之后，回望来路，正邪之辨已不再困扰于你。',
        '你走出了一条独属于自己的道，无惧人言，无愧本心。',
        '天大地大，我道为尊。',
      ],
      effects: { heart: 10, cult: 20 },
    },
  ],
};

// ---- 出身 ----
export interface OriginDef {
  name: string;
  desc: string;
  spirit: number;
  technique: string;
  hpBonus: number;
  heart: number;
  pill?: string;   // 开局赠送丹药
}

export const ORIGINS: OriginDef[] = [
  { name: '山村孤儿', desc: '自幼孤苦，历尽冷暖，心智坚韧。', spirit: 0, technique: '基础吐纳术', hpBonus: 0, heart: 60 },
  { name: '商贾之家', desc: '家财万贯，灵石富足。', spirit: 600, technique: '基础吐纳术', hpBonus: 0, heart: 50 },
  { name: '修仙世家旁支', desc: '没落世家，祖传一卷功法。', spirit: 100, technique: '青灵诀', hpBonus: 0, heart: 55 },
  { name: '猎户之子', desc: '自幼狩猎，体魄强健。', spirit: 50, technique: '基础吐纳术', hpBonus: 8, heart: 50 },
  { name: '书香门第', desc: '诗书传家，悟性不俗，家藏凝气丹。', spirit: 80, technique: '基础吐纳术', hpBonus: 0, heart: 68, pill: '凝气丹' },
  { name: '医家传人', desc: '悬壶济世，通晓药性，随身疗伤丹。', spirit: 60, technique: '基础吐纳术', hpBonus: 0, heart: 72, pill: '疗伤丹' },
  { name: '没落贵族', desc: '家道中落，心有不甘，祖传青灵诀。', spirit: 150, technique: '青灵诀', hpBonus: 0, heart: 45 },
  { name: '镖局之后', desc: '自幼习武，体魄过人。', spirit: 120, technique: '基础吐纳术', hpBonus: 12, heart: 50 },
  { name: '山野牧童', desc: '放牛南山，心性纯良。', spirit: 30, technique: '基础吐纳术', hpBonus: 5, heart: 58 },
  { name: '流民乞儿', desc: '阅尽人间冷暖，心智异常坚韧。', spirit: 0, technique: '基础吐纳术', hpBonus: -5, heart: 78 },
  { name: '渔家子弟', desc: '江上渔家，水性极佳。', spirit: 40, technique: '基础吐纳术', hpBonus: 6, heart: 52 },
  { name: '游方艺人之后', desc: '戏班杂耍出身，见多识广。', spirit: 60, technique: '基础吐纳术', hpBonus: 3, heart: 60 },
  { name: '魔门弃婴', desc: '被魔宗长老捡回的弃婴，浸染魔气。', spirit: 100, technique: '基础吐纳术', hpBonus: 0, heart: 35 },
  { name: '魔修之后', desc: '父母皆魔修，自幼修习魔功。', spirit: 150, technique: '基础吐纳术', hpBonus: 5, heart: 30 },
  { name: '乱葬岗弃婴', desc: '生于乱葬岗，命格奇诡，阴气入体。', spirit: 0, technique: '基础吐纳术', hpBonus: -3, heart: 65 },
  { name: '邪修养子', desc: '被邪修养大，通晓旁门左道。', spirit: 80, technique: '基础吐纳术', hpBonus: 2, heart: 40 },
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
  needLead?: boolean;    // 加入门槛：需结识红颜
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
  { name: '合欢宗', desc: '阴阳双修，道侣相济。', bonus: '双修修炼加成 +30%', trait: '阴阳相济——道侣合修，进境翻倍。', rule: '道侣之事，须两厢情愿。', dualBonus: 0.5, needLead: true, technique: '阴阳和合功' },
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
  spirit: number;        // 额外灵石
  heart: number;         // 额外心境
  rootRolls: number;     // 灵根可重测次数（不含首次）
  hook: string;          // 专属开局伏笔
  origins: string[];     // 剧本专属出身路线（对应 ORIGINS 名称）
}

export const SCENARIOS: ScenarioDef[] = [
  {
    name: '天命凡骨', tagline: '生而平凡，逆天改命',
    intro: [
      '你生于乱世一隅，家徒四壁，父母早亡。',
      '旁人笑你痴心妄想，你却偏要以凡人之躯，叩问那九重仙门。',
      '命运待你凉薄，你便亲手撕了这命运。',
    ],
    spirit: 0, heart: 15, rootRolls: 3,
    hook: '临行前，你在村口乱葬岗捡到一枚发热的骨片，隐隐似有天机……',
    origins: ['山村孤儿', '猎户之子', '山野牧童', '流民乞儿'],
  },
  {
    name: '世家贵子', tagline: '出身豪门，恩怨缠身',
    intro: [
      '你出身豪门世家，自幼锦衣玉食，不知人间疾苦。',
      '然树大招风，你那一门树敌无数，暗流早已涌动。',
      '锦衣玉食之下，是杀机四伏的豪门深院。',
    ],
    spirit: 400, heart: 0, rootRolls: 1,
    hook: '离府那日，一封无名的血书被钉在门楣上：灭门之日，不远矣。',
    origins: ['修仙世家旁支', '没落贵族', '书香门第', '商贾之家'],
  },
  {
    name: '逍遥浪子', tagline: '无牵无挂，四海为家',
    intro: [
      '你自幼漂泊江湖，无门无派，天地便是你的师承。',
      '走南闯北，见惯世态，却也因此广结善缘，机缘不断。',
      '江湖路远，你只信手中一柄剑、心中一口气。',
    ],
    spirit: 200, heart: 5, rootRolls: 2,
    hook: '一日，你从旧货摊上淘到一张残破地图，标记着一处上古秘境……',
    origins: ['镖局之后', '医家传人', '渔家子弟', '游方艺人之后'],
  },
  {
    name: '魔星降世', tagline: '魔门出身，杀伐问道',
    intro: [
      '你生于魔道之间，自幼浸染魔功长大。',
      '体内一缕魔胎，令你天资妖孽，却也时时有入魔之危。',
      '正邪之辨、人魔之界，将是你毕生无法回避的劫。',
    ],
    spirit: 200, heart: -10, rootRolls: 2,
    hook: '夜半，你体内魔胎忽而躁动，一个冰冷的声音在心底响起：杀，还是渡？',
    origins: ['魔门弃婴', '魔修之后', '乱葬岗弃婴', '邪修养子'],
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

// ---- 剧本专属女主（主线邂逅登场） ----
export interface HeroineDef {
  name: string;
  title: string;
  appearance: string;
  personality: string;   // 对应 PERSONALITY_MODS
}

export const SCENARIO_HEROINES: Record<string, HeroineDef> = {
  苏婉清: { name: '苏婉清', title: '青梅竹马', appearance: '清丽温婉，眉眼含情', personality: '温婉贤淑' },
  顾清音: { name: '顾清音', title: '仇家之女', appearance: '冰肌玉骨，清冷出尘', personality: '清冷孤傲' },
  白灵儿: { name: '白灵儿', title: '散修侠女', appearance: '英姿飒爽，眉眼含锋', personality: '洒脱不羁' },
  墨离: { name: '墨离', title: '魔道妖女', appearance: '妖冶妩媚，魅惑众生', personality: '腹黑狡黠' },
};

// ---- 妖兽/敌人（按境界层级分档） ----
export const ENEMY_POOL: string[][] = [
  ['铁脊苍狼', '碧鳞妖蟒', '夺舍散修', '赤瞳妖狐'],
  ['六翼魔蝠', '赤鳞蛟', '邪修长老', '血煞魔修'],
  ['荒古凶兽', '域外天魔', '天劫心魔', '混沌异兽'],
];

// ---- 由状态推导出的属性（纯函数） ----

export function realmAbs(p: Player): number {
  return p.realmIdx * 4 + p.stageIdx;
}

export function playerTitle(p: Player): string {
  return REALMS[p.realmIdx].name + REALMS[p.realmIdx].stages[p.stageIdx];
}

export function playerAttack(p: Player): number {
  const treasureAtk = TREASURES[p.treasure]?.[0] ?? 0;
  const formAtk = FORMATIONS[p.formation]?.atk ?? 0;
  const techAtk = Math.round((TECHNIQUES[p.technique]?.atk ?? 0) * techPower(p)); // 功法攻击加成，随熟练度放大
  let atk = 8 + realmAbs(p) * 5 + treasureAtk + formAtk + techAtk;
  const atkPct = sectOf(p)?.atkPct ?? 0; // 太乙剑宗/血煞魔宗等攻击加成
  atk = Math.floor(atk * (1 + (atkPct > 0 ? atkPct * sectPower(p) : atkPct)));
  return atk;
}

export function playerDefense(p: Player): number {
  const formDef = FORMATIONS[p.formation]?.def ?? 0;
  return 3 + realmAbs(p) * 2 + formDef;
}

export function playerHp(p: Player): number {
  return p.maxHp + realmAbs(p) * 15 + Math.round((TECHNIQUES[p.technique]?.hp ?? 0) * techPower(p)); // 炼体功法气血加成，随熟练度放大
}
