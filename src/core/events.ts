// 游历随机事件表：50 个事件，覆盖资源 / 修为 / 机缘 / 战斗 / 风险 / 分支选择 / 社交 / 彩蛋。
// 每个事件含权重（越大越常见）与处理函数；分支事件会向玩家提问，机缘类权重较低。

import type { GameIO } from '../io.js';
import type { GameState, Player } from '../types.js';
import { MATERIALS, TREASURES, TECH_ORDER, TECHNIQUES, REALMS, ROOTS, sectOf, sectPower, learnTechnique, playerTitle } from '../content.js';
import { green, red, yellow, cyan, magenta, dim } from '../colors.js';
import { pick, chance, randint } from './rng.js';
import { makeLead } from './character.js';
import { combat } from './combat.js';
import { leadDescription } from './romance.js';

type Handler = (p: Player, state: GameState, io: GameIO) => Promise<void>;

export interface ExploreEvent {
  name: string;
  weight: number;
  run: Handler;
}

// ---- 数值辅助（纯函数） ----

function addSpirit(p: Player, n: number): void {
  p.spirit += n;
}

function loseSpirit(p: Player, n: number): void {
  p.spirit = Math.max(0, p.spirit - n);
}

function addMat(p: Player, name: string, n = 1): void {
  p.materials[name] = (p.materials[name] ?? 0) + n;
}

function addCult(p: Player, n: number): void {
  p.cultivation = Math.min(100, p.cultivation + n);
}

function addHeart(p: Player, n: number): void {
  p.heart = Math.min(100, Math.max(0, p.heart + n));
}

function gainPill(p: Player, name: string, n = 1): void {
  p.pills[name] = (p.pills[name] ?? 0) + n;
}

/** 直接晋升一个小境界（机缘），安全处理跨大境界与寿元。 */
function advanceStage(p: Player): void {
  const realm = REALMS[p.realmIdx];
  if (p.stageIdx < realm.stages.length - 1) {
    p.stageIdx += 1;
  } else if (p.realmIdx < REALMS.length - 1) {
    p.realmIdx += 1;
    p.stageIdx = 0;
    p.lifespan = REALMS[p.realmIdx].lifespan;
  } else {
    p.cultivation = 100; // 已至顶点，折为修为
    return;
  }
  p.cultivation = 0;
  p.heart = Math.min(100, p.heart + 5);
}

/** 主修功法提升一阶（按 TECH_ORDER），返回新功法名（已最高则 null）。 */
function upgradeTechnique(p: Player): string | null {
  const cur = TECHNIQUES[p.technique]?.mult ?? 1;
  const next = TECH_ORDER.find((n) => (TECHNIQUES[n]?.mult ?? 0) > cur);
  if (!next) return null;
  learnTechnique(p, next);
  return next;
}

/** 灵根提升一级，返回新灵根名（已天灵根则 null）。 */
function upgradeRoot(p: Player): string | null {
  const idx = ROOTS.findIndex((r) => r.name === p.root);
  if (idx <= 0) return null;
  p.root = ROOTS[idx - 1].name;
  p.rootMult = ROOTS[idx - 1].mult;
  return p.root;
}

/** 法宝提升一档，返回新法宝名（已最强则 null）。 */
function upgradeTreasure(p: Player): string | null {
  const curAtk = TREASURES[p.treasure]?.[0] ?? 0;
  const better = Object.keys(TREASURES).filter((t) => TREASURES[t][0] > curAtk);
  if (better.length === 0) return null;
  const t = pick(better);
  p.treasure = t;
  return t;
}

/** 解锁一项副业技能，返回本次是否真正新解锁（用于叙事）。 */
function unlockSkill(p: Player, skill: string): boolean {
  if (!p.skills.includes(skill)) {
    p.skills.push(skill);
    return true;
  }
  return false;
}

// ---- 事件表 ----

export const EVENTS: ExploreEvent[] = [
  // ===== 资源类 =====
  {
    name: '洞府遗迹', weight: 4,
    run: async (p, _s, io) => {
      await io.narrate('【游历·洞府遗迹】你发现一处上古修士洞府，获得灵石与材料！');
      addSpirit(p, 100);
      for (let i = 0; i < 2; i++) addMat(p, pick(Object.keys(MATERIALS)));
    },
  },
  {
    name: '灵药园', weight: 3,
    run: async (p, _s, io) => {
      await io.narrate('【游历·灵药园】你于山谷深处采得一株百年灵药！');
      addMat(p, '灵花');
    },
  },
  {
    name: '灵石矿脉', weight: 2,
    run: async (p, _s, io) => {
      await io.narrate('【游历·灵石矿脉】你发现一条小型灵石矿脉，采得灵石！');
      addSpirit(p, 300);
    },
  },
  {
    name: '天降陨铁', weight: 2,
    run: async (p, _s, io) => {
      await io.narrate('【游历·天降陨铁】夜空中一道流光坠落，你寻踪而去，捡得一块灵石精！');
      addMat(p, '灵石精');
    },
  },
  {
    name: '古修药园', weight: 2,
    run: async (p, _s, io) => {
      await io.narrate('【游历·古修药园】你发现一座废弃药园，仍有灵药存活。');
      addMat(p, '灵草', 2);
      addMat(p, '灵花');
    },
  },
  {
    name: '灵脉温泉', weight: 2,
    run: async (p, _s, io) => {
      await io.narrate('【游历·灵脉温泉】一汪热气氤氲的灵泉，浸泡其中可舒筋活络。');
      addHeart(p, 8);
      addCult(p, 15);
    },
  },
  {
    name: '商队遗物', weight: 2,
    run: async (p, _s, io) => {
      const pill = pick(['凝气丹', '聚灵丹', '疗伤丹', '回春丹']);
      await io.narrate('【游历·商队遗物】路边散落着商队遇袭后遗留的货物，你寻得一瓶丹药。');
      gainPill(p, pill);
      io.print(green(`获得 ${pill}×1。`));
    },
  },
  {
    name: '灵兽巢穴', weight: 2,
    run: async (p, _s, io) => {
      await io.narrate('【游历·灵兽巢穴】一处废弃兽穴中，遗有一颗妖兽内丹。');
      addMat(p, '妖兽内丹');
    },
  },
  {
    name: '山涧灵泉', weight: 2,
    run: async (p, _s, io) => {
      await io.narrate('【游历·山涧灵泉】山涧清泉旁灵草丛生。');
      addMat(p, '灵草', 2);
    },
  },
  {
    name: '修士遗蜕', weight: 2,
    run: async (p, _s, io) => {
      await io.narrate('【游历·修士遗蜕】你发现一具坐化多年的修士遗骸，储物袋犹在。');
      addSpirit(p, randint(100, 300));
      addMat(p, pick(Object.keys(MATERIALS)));
    },
  },
  {
    name: '古修手札', weight: 2,
    run: async (p, _s, io) => {
      const t = pick(Object.keys(TECHNIQUES));
      p.fragments[t] = (p.fragments[t] ?? 0) + 1;
      await io.narrate(`【游历·古修手札】你在荒山石室中发现半卷手札，正是《${t}》的残篇！`);
    },
  },
  {
    name: '破旧经阁', weight: 2,
    run: async (p, _s, io) => {
      p.fragments['无名残篇'] = (p.fragments['无名残篇'] ?? 0) + 1;
      await io.narrate('【游历·破旧经阁】你在一座荒废经阁中拾得无名残篇×1，参悟可精进当前功法。');
    },
  },

  // ===== 修为类 =====
  {
    name: '前辈指点', weight: 3,
    run: async (p, _s, io) => {
      await io.narrate('【游历·前辈指点】一位前辈见你根骨尚可，点拨修行，修为精进！');
      addCult(p, 20);
    },
  },
  {
    name: '灵气潮汐', weight: 2,
    run: async (p, _s, io) => {
      await io.narrate('【游历·灵气潮汐】天地灵气忽而浓郁，你趁机吐纳，事半功倍！');
      addCult(p, 35);
    },
  },
  {
    name: '顿悟', weight: 1,
    run: async (p, _s, io) => {
      await io.narrate(green('【游历·顿悟】灵光乍现，你忽有所悟，困扰已久的瓶颈豁然开朗！'));
      addCult(p, 50);
      addHeart(p, 10);
    },
  },
  {
    name: '观星悟道', weight: 2,
    run: async (p, _s, io) => {
      await io.narrate('【游历·观星悟道】夜观星象，你于浩瀚星海中参悟大道。');
      addCult(p, 25);
      addHeart(p, 5);
    },
  },
  {
    name: '静坐观瀑', weight: 2,
    run: async (p, _s, io) => {
      await io.narrate('【游历·静坐观瀑】你于飞瀑之下静坐七日，观水之性。');
      addCult(p, 15);
      addHeart(p, 5);
    },
  },

  // ===== 机缘类（稀有机遇） =====
  {
    name: '仙猿认主', weight: 1,
    run: async (p, _s, io) => {
      await io.narrate('【游历·仙猿认主】一只灵猿竟口吐人言，愿追随于你，助你悟道！');
      addCult(p, 25);
      addHeart(p, 10);
      await io.narrate(green('此乃难得的机缘！'));
    },
  },
  {
    name: '古修士传承', weight: 1,
    run: async (p, _s, io) => {
      const old = playerTitle(p);
      await io.narrate('【游历·古修士传承】你获一位上古大能的完整传承，境界突飞猛进！');
      advanceStage(p);
      await io.narrate(green(`你从 ${old} 突破至 ${playerTitle(p)}！`));
    },
  },
  {
    name: '道统现世', weight: 1,
    run: async (p, _s, io) => {
      const t = upgradeTechnique(p);
      if (t) {
        await io.narrate(green(`【游历·道统现世】你寻得一部失传功法《${t}》，从此修炼更上层楼！`));
      } else {
        addSpirit(p, 300);
        await io.narrate(yellow('【游历·道统现世】你得残卷一部，与你功法相当，只换得些灵石。'));
      }
    },
  },
  {
    name: '太初瓶', weight: 1,
    run: async (p, _s, io) => {
      if (!p.goldenFinger) {
        p.goldenFinger = '太初瓶';
        p.cheatBonus = 2.0;
        await io.narrate(green('【游历·太初瓶】你在山涧捡到一只古朴小瓶，瓶身「太初瓶」三字若隐若现！'));
        await io.narrate('传闻此瓶可催熟灵药、逆转光阴……你获得金手指【太初瓶】，修炼速度 ×2！');
      } else {
        addSpirit(p, 500);
        await io.narrate(yellow('【游历·太初瓶】你已得金手指，又寻得一件仿品，只卖得 500 灵石。'));
      }
    },
  },
  {
    name: '灵根重塑', weight: 1,
    run: async (p, _s, io) => {
      const old = p.root;
      const r = upgradeRoot(p);
      if (r) {
        await io.narrate(green(`【游历·灵根重塑】你服下一株逆天改命草，灵根由 ${old} 蜕变为 ${r}！`));
      } else {
        addCult(p, 40);
        await io.narrate(yellow('【游历·灵根重塑】你已是最顶尖的天灵根，灵草化作精纯修为。'));
      }
    },
  },
  {
    name: '天降横财', weight: 1,
    run: async (p, _s, io) => {
      addSpirit(p, 800);
      await io.narrate(green('【游历·天降横财】天降一袋灵石，你捡得 800 灵石！'));
    },
  },
  {
    name: '上古丹方', weight: 1,
    run: async (p, _s, io) => {
      // 丹方与当前境界相称：给当前或下一大境界的突破丹
      const candidates: string[] = [];
      const cur = REALMS[p.realmIdx].breakPill;
      if (cur) candidates.push(cur);
      const next = p.realmIdx + 1 < REALMS.length ? REALMS[p.realmIdx + 1].breakPill : null;
      if (next) candidates.push(next);
      const pill = candidates.length > 0 ? pick(candidates) : '聚灵丹';
      gainPill(p, pill);
      await io.narrate(green(`【游历·上古丹方】你于古修洞府中寻得一枚 ${pill}！`));
    },
  },
  {
    name: '法宝现世', weight: 1,
    run: async (p, _s, io) => {
      const t = upgradeTreasure(p);
      if (t) {
        await io.narrate(green(`【游历·法宝现世】一件无主法宝现世，你夺得 ${t}！`));
      } else {
        addSpirit(p, 200);
        await io.narrate(yellow('【游历·法宝现世】出土法宝不如你手中之物，你将其变卖。'));
      }
    },
  },

  // ===== 战斗类 =====
  {
    name: '妖兽袭击', weight: 4,
    run: async (p, state, io) => {
      await combat(p, state.leads, io, '凶险！有强敌拦住了去路——正是 {enemy}！');
    },
  },
  {
    name: '魔修截杀', weight: 2,
    run: async (p, state, io) => {
      await combat(p, state.leads, io, '一股杀气锁定于你，来者正是 {enemy}！');
    },
  },
  {
    name: '夺宝仇家', weight: 2,
    run: async (p, state, io) => {
      await combat(p, state.leads, io, '你身怀重宝的消息走漏，仇家 {enemy} 寻上门来！');
    },
  },
  {
    name: '邪修诱骗', weight: 2,
    run: async (p, state, io) => {
      await io.narrate('【游历·邪修诱骗】一名邪修谎称有上古密藏，欲引你入瓮。');
      const ch = await io.ask('是否识破其诡计？(y/n)', ['y', 'n'], 'y');
      if (ch === 'y') {
        await combat(p, state.leads, io, '你一眼识破其奸计，邪修恼羞成怒，与 {enemy} 联手来袭！');
      } else {
        const loss = Math.min(p.spirit, randint(100, 300));
        loseSpirit(p, loss);
        await io.narrate(red(`你轻信了邪修，被骗走 ${loss} 灵石！`));
      }
    },
  },
  {
    name: '兽潮', weight: 2,
    run: async (p, state, io) => {
      await combat(p, state.leads, io, '群敌如潮涌来，{enemy} 率先扑杀而至！');
    },
  },
  {
    name: '旧怨寻仇', weight: 2,
    run: async (p, state, io) => {
      await combat(p, state.leads, io, '陈年旧怨的仇家循迹而至——正是 {enemy}！');
    },
  },

  // ===== 风险类 =====
  {
    name: '心魔来袭', weight: 2,
    run: async (p, _s, io) => {
      await io.narrate(red('【游历·心魔来袭】你遭心魔困扰，心境受创。'));
      addHeart(p, -8);
    },
  },
  {
    name: '走火入魔', weight: 2,
    run: async (p, _s, io) => {
      await io.narrate(red('【游历·走火入魔】修炼出了岔子，灵气逆行，你遭受重创！'));
      p.cultivation = Math.max(0, p.cultivation - 30);
      addHeart(p, -10);
    },
  },
  {
    name: '误入毒瘴', weight: 2,
    run: async (p, _s, io) => {
      await io.narrate(red('【游历·误入毒瘴】你误入一片毒瘴之地，瘴气入体。'));
      addHeart(p, -6);
      p.lifespan -= randint(1, 5);
      await io.narrate(red('毒气侵蚀根基，寿元折损。'));
    },
  },
  {
    name: '遭遇劫匪', weight: 2,
    run: async (p, _s, io) => {
      const loss = Math.floor(p.spirit * 0.2);
      if (loss <= 0) {
        await io.narrate(dim('【游历·遭遇劫匪】几名不开眼的劫匪见你囊中羞涩，悻悻而去。'));
        return;
      }
      loseSpirit(p, loss);
      await io.narrate(red(`【游历·遭遇劫匪】你被一伙劫匪拦路，损失 ${loss} 灵石。`));
    },
  },
  {
    name: '灵田失窃', weight: 2,
    run: async (p, _s, io) => {
      const mats = Object.keys(MATERIALS).filter((k) => (p.materials[k] ?? 0) > 0);
      if (mats.length === 0) {
        await io.narrate(dim('【游历·灵田失窃】你的药园空无一物，无甚可偷。'));
        return;
      }
      const m = pick(mats);
      p.materials[m] -= 1;
      await io.narrate(red(`【游历·灵田失窃】有人盗走你的 ${m}×1！`));
    },
  },
  {
    name: '天雷惊扰', weight: 1,
    run: async (p, _s, io) => {
      await io.narrate('【游历·天雷惊扰】你曾对天盟誓，如今雷云忽聚，一道天雷当头劈下！');
      const loss = Math.min(p.spirit, randint(50, 150));
      loseSpirit(p, loss);
      addHeart(p, -5);
      await io.narrate(red(`你被劈得外焦里嫩，损失 ${loss} 灵石。`));
      await io.narrate(dim('（修仙者当慎言，切莫乱立誓。）'));
    },
  },

  // ===== 分支选择类 =====
  {
    name: '神秘洞府', weight: 2,
    run: async (p, state, io) => {
      await io.narrate('【游历·神秘洞府】深山之中，一座尘封洞府若隐若现，隐有宝光透出。');
      const ch = await io.ask('是否入内探索？(y/n)', ['y', 'n'], 'y');
      if (ch === 'n') {
        await io.narrate(dim('你谨慎地退去，来日方长。'));
        return;
      }
      if (chance(0.6)) {
        addSpirit(p, randint(150, 400));
        addMat(p, pick(Object.keys(MATERIALS)));
        await io.narrate(green('洞府内果然藏有宝贝，你满载而归！'));
      } else {
        await combat(p, state.leads, io, '洞府禁制骤然触发，守护之物 {enemy} 现身！');
      }
    },
  },
  {
    name: '散修传承', weight: 2,
    run: async (p, _s, io) => {
      await io.narrate('【游历·散修传承】一位垂死的散修坐化于前，愿将毕生所学相赠。');
      const ch = await io.ask('是否接受传承？(y/n)', ['y', 'n'], 'y');
      if (ch === 'n') {
        addSpirit(p, 100);
        await io.narrate(dim('你婉言谢绝，替他收殓，得其遗留灵石。'));
        return;
      }
      addCult(p, 40);
      if (chance(0.3)) {
        addHeart(p, -15);
        p.lifespan -= randint(3, 10);
        await io.narrate(red('传承过于霸道，你险些走火入魔，心神受创！'));
      } else {
        await io.narrate(green('传承圆满，你的修为精进不少！'));
      }
    },
  },
  {
    name: '路遇商队', weight: 3,
    run: async (p, _s, io) => {
      await io.narrate('【游历·路遇商队】一支商队与你擦肩，见你是修士，愿低价出手灵草。');
      if (p.spirit < 50) {
        await io.narrate(dim('你囊中羞涩，只得作罢。'));
        return;
      }
      const ch = await io.ask('花 50 灵石购 3 株灵草？(y/n)', ['y', 'n'], 'y');
      if (ch === 'y') {
        p.spirit -= 50;
        addMat(p, '灵草', 3);
        await io.narrate(green('你购得灵草 ×3。'));
      } else {
        await io.narrate(dim('你摆摆手，继续赶路。'));
      }
    },
  },
  {
    name: '拍卖会', weight: 2,
    run: async (p, _s, io) => {
      const curAtk = TREASURES[p.treasure]?.[0] ?? 0;
      const better = Object.keys(TREASURES).filter((k) => TREASURES[k][0] > curAtk);
      if (better.length === 0) {
        await io.narrate(dim('【游历·拍卖会】一场拍卖正在进行，可惜没有入你法眼之物。'));
        return;
      }
      const t = pick(better);
      const price = Math.floor(TREASURES[t][1] * 0.8);
      await io.narrate(`【游历·拍卖会】拍卖行正竞价一件 ${cyan(t)}，起拍 ${price} 灵石。`);
      if (p.spirit < price) {
        await io.narrate(dim('你灵石不足，只得作罢。'));
        return;
      }
      const ch = await io.ask(`是否出价 ${price} 灵石拍下 ${t}？(y/n)`, ['y', 'n'], 'y');
      if (ch === 'y') {
        p.spirit -= price;
        p.treasure = t;
        await io.narrate(green(`你拍得 ${t}，实力大涨！`));
      } else {
        await io.narrate(dim('你退出竞价。'));
      }
    },
  },
  {
    name: '神秘老者', weight: 2,
    run: async (p, _s, io) => {
      await io.narrate('【游历·神秘老者】一位衣衫褴褛的老者拦住你，讨要一枚疗伤丹续命。');
      const ch = await io.ask('是否施以援手？(y/n)', ['y', 'n'], 'y');
      if (ch === 'n') {
        await io.narrate(dim('你冷漠地走开。'));
        return;
      }
      if ((p.pills['疗伤丹'] ?? 0) > 0) {
        p.pills['疗伤丹'] -= 1;
        await io.narrate('你取出疗伤丹喂其服下。');
      } else if (p.spirit >= 30) {
        p.spirit -= 30;
        await io.narrate('你掏出 30 灵石，替他买了枚丹药。');
      } else {
        await io.narrate('你身无长物，只得告知其往坊市求药。');
        return;
      }
      if (chance(0.5)) {
        addSpirit(p, 300);
        await io.narrate(green('老者竟是一位隐世高人，授你一段造化，赠你灵石！'));
      } else {
        addCult(p, 20);
        addHeart(p, 8);
        await io.narrate(green('老者感激不尽，指点你几句修炼心得。'));
      }
    },
  },
  {
    name: '秘境入口', weight: 2,
    run: async (p, state, io) => {
      await io.narrate('【游历·秘境入口】一道空间裂缝吞吐霞光，似是一处尚未开发的秘境。');
      const ch = await io.ask('是否冒险闯入？(y/n)', ['y', 'n'], 'y');
      if (ch === 'n') {
        await io.narrate(dim('你按捺住好奇，绕道而行。'));
        return;
      }
      if (chance(0.5)) {
        addSpirit(p, randint(300, 600));
        addCult(p, 30);
        addMat(p, pick(Object.keys(MATERIALS)), randint(1, 2));
        await io.narrate(green('秘境之内天材地宝遍地，你满载而归！'));
      } else {
        await combat(p, state.leads, io, '秘境凶险，镇守的强敌 {enemy} 扑杀而来！');
      }
    },
  },
  {
    name: '论道邀请', weight: 2,
    run: async (p, _s, io) => {
      await io.narrate('【游历·论道邀请】一位同阶修士慕名而来，邀你坐而论道。');
      const ch = await io.ask('是否应战论道？(y/n)', ['y', 'n'], 'y');
      if (ch === 'n') {
        await io.narrate(dim('你拱手婉拒，继续赶路。'));
        return;
      }
      if (chance(0.7)) {
        addCult(p, 25);
        addHeart(p, 6);
        await io.narrate(green('一番论道，你获益良多，道心愈发通透。'));
      } else {
        addHeart(p, -5);
        await io.narrate(yellow('对方论道犀利，你一时语塞，略受打击。'));
      }
    },
  },
  {
    name: '破阵考验', weight: 2,
    run: async (p, _s, io) => {
      await io.narrate('【游历·破阵考验】你误入一座古阵，阵心隐隐有宝光流转。');
      const ch = await io.ask('是否尝试破阵取宝？(y/n)', ['y', 'n'], 'y');
      if (ch === 'n') {
        await io.narrate(dim('你原路退回。'));
        return;
      }
      if (chance(0.55)) {
        addSpirit(p, randint(200, 500));
        addMat(p, '灵石精');
        await io.narrate(green('你参透阵法，取走阵心之宝！'));
      } else {
        addHeart(p, -12);
        addCult(p, -20);
        await io.narrate(red('阵法反噬，你被震伤，心神受创！'));
      }
    },
  },
  {
    name: '双修邀请', weight: 1,
    run: async (p, _s, io) => {
      await io.narrate('【游历·双修邀请】一位修士言称与你双修共进，各取所需。');
      const ch = await io.ask('是否应允？(y/n)', ['y', 'n'], 'y');
      if (ch === 'n') {
        await io.narrate(dim('你婉言谢绝。'));
        return;
      }
      const gain = sectOf(p)?.dualBonus ? Math.round(25 + 20 * sectPower(p)) : 25; // 合欢宗等双修加成
      addCult(p, gain);
      addHeart(p, 5);
      await io.narrate(green(`双修已毕，你修为 +${gain}，心境 +5。`));
    },
  },

  // ===== 副业解锁 =====
  {
    name: '丹师收徒', weight: 2,
    run: async (p, _s, io) => {
      await io.narrate('【游历·丹师收徒】一位云游炼丹师见你颇有慧根，愿收你为徒，传授炼丹之术。');
      if (p.skills.includes('炼丹')) {
        const pill = pick(['凝气丹', '聚灵丹', '疗伤丹']);
        gainPill(p, pill);
        await io.narrate(green(`你已通炼丹之道，丹师赠你一枚 ${pill} 作见面礼。`));
        return;
      }
      const ch = await io.ask('是否拜入其门下？(y/n)', ['y', 'n'], 'y');
      if (ch === 'n') {
        await io.narrate(dim('你婉言谢绝，与丹师作别。'));
        return;
      }
      unlockSkill(p, '炼丹');
      await io.narrate(green('你拜入丹师门下，习得炼丹之术！此后可于丹房炼丹。'));
    },
  },
  {
    name: '丹方残卷', weight: 2,
    run: async (p, _s, io) => {
      await io.narrate('【游历·丹方残卷】你于一处破败洞府中寻得一卷炼丹丹方。');
      if (unlockSkill(p, '炼丹')) {
        await io.narrate(green('你研习丹方，通晓炼丹之术！'));
      } else {
        gainPill(p, '聚灵丹');
        await io.narrate(green('你已会炼丹，此丹方另有他法，你炼得聚灵丹×1。'));
      }
    },
  },
  {
    name: '丹王传承', weight: 1,
    run: async (p, _s, io) => {
      await io.narrate(green('【游历·丹王传承】你偶入一座丹王坐化洞府，获其毕生炼丹传承！'));
      if (unlockSkill(p, '炼丹')) {
        gainPill(p, '凝气丹', 2);
        gainPill(p, '聚灵丹');
        await io.narrate(green('你习得炼丹之术，并获赠丹药若干！'));
      } else {
        gainPill(p, '筑基丹');
        await io.narrate(green('你已通丹道，传承化作丹方精髓，你炼得筑基丹×1。'));
      }
    },
  },
  {
    name: '器师收徒', weight: 2,
    run: async (p, _s, io) => {
      await io.narrate('【游历·器师收徒】一位炼器大师见你神魂精纯，愿收你为徒，传授炼器之道。');
      if (p.skills.includes('炼器')) {
        addMat(p, '灵石精');
        await io.narrate(green('你已通炼器之术，器师赠你一块灵石精作见面礼。'));
        return;
      }
      const ch = await io.ask('是否拜入其门下？(y/n)', ['y', 'n'], 'y');
      if (ch === 'n') {
        await io.narrate(dim('你婉言谢绝，与器师作别。'));
        return;
      }
      unlockSkill(p, '炼器');
      await io.narrate(green('你拜入器师门下，习得炼器之术！此后可于炼器炉中锻造法宝。'));
    },
  },
  {
    name: '器道传承', weight: 1,
    run: async (p, _s, io) => {
      await io.narrate(green('【游历·器道传承】你于一处上古炼器宗师洞府中，得其一卷炼器总纲！'));
      if (unlockSkill(p, '炼器')) {
        await io.narrate(green('你参悟炼器总纲，通晓炼器之术！'));
      } else {
        addMat(p, '妖兽内丹', 2);
        await io.narrate(green('你已通炼器之术，总纲化作炼器心得，助你炼得妖兽内丹×2。'));
      }
    },
  },
  {
    name: '阵师授业', weight: 2,
    run: async (p, _s, io) => {
      await io.narrate('【游历·阵师授业】一位隐世阵法大师见你心思缜密，愿授你阵法一道。');
      if (p.skills.includes('阵法')) {
        addMat(p, '灵石精');
        await io.narrate(green('你已通阵法之道，阵师赠你一块灵石精作见面礼。'));
        return;
      }
      const ch = await io.ask('是否拜入其门下？(y/n)', ['y', 'n'], 'y');
      if (ch === 'n') {
        await io.narrate(dim('你婉言谢绝，与阵师作别。'));
        return;
      }
      unlockSkill(p, '阵法');
      await io.narrate(green('你拜入阵师门下，习得阵法之道！此后可布阵御敌、聚灵养气。'));
    },
  },
  {
    name: '古阵图谱', weight: 1,
    run: async (p, _s, io) => {
      await io.narrate(green('【游历·古阵图谱】你于秘境遗迹中寻得一卷上古阵法图谱！'));
      if (unlockSkill(p, '阵法')) {
        await io.narrate(green('你参透图谱，通晓阵法之道！'));
      } else {
        addCult(p, 30);
        await io.narrate(green('你已通阵法之道，图谱精义融入修为，修为 +30。'));
      }
    },
  },
  {
    name: '符师收徒', weight: 2,
    run: async (p, _s, io) => {
      await io.narrate('【游历·符师收徒】一位符箓大师见你笔力稳健，愿收你为徒，传授制符之术。');
      if (p.skills.includes('符箓')) {
        addMat(p, '灵草');
        await io.narrate(green('你已通符箓之术，符师赠你一株灵草作见面礼。'));
        return;
      }
      const ch = await io.ask('是否拜入其门下？(y/n)', ['y', 'n'], 'y');
      if (ch === 'n') {
        await io.narrate(dim('你婉言谢绝，与符师作别。'));
        return;
      }
      unlockSkill(p, '符箓');
      await io.narrate(green('你拜入符师门下，习得制符之术！此后可于符房绘制符箓。'));
    },
  },
  {
    name: '符箓世家', weight: 1,
    run: async (p, _s, io) => {
      await io.narrate(green('【游历·符箓世家】你于一座破落的符箓世家祖宅中，寻得传家的制符秘本！'));
      if (unlockSkill(p, '符箓')) {
        await io.narrate(green('你研习秘本，通晓制符之术！'));
      } else {
        p.talismans['烈焰符'] = (p.talismans['烈焰符'] ?? 0) + 1;
        await io.narrate(green('你已通符箓之术，秘本中夹着一枚现成的烈焰符。'));
      }
    },
  },

  // ===== 社交 / 女主类 =====
  {
    name: '搭救落难女修', weight: 2,
    run: async (p, state, io) => {
      await io.narrate('【游历·搭救落难女修】一名女修被妖兽围攻，危在旦夕。');
      if (state.leads.length < 5 && chance(0.6)) {
        const lead = makeLead(p);
        state.leads.push(lead);
        await io.narrate('你出手相救，杀退妖兽。');
        io.print(leadDescription(lead));
        await io.narrate(`${lead.name} 对你感激不已，芳心暗许。`);
        return;
      }
      await io.narrate('你出手解围。');
      addSpirit(p, randint(100, 250));
      addHeart(p, 5);
      await io.narrate(green('对方奉上谢礼，你心境也愈发坦然。'));
    },
  },
  {
    name: '替人寻药', weight: 2,
    run: async (p, _s, io) => {
      await io.narrate('【游历·替人寻药】一位老妇跪求你为其寻一株灵草，救治家中幼子。');
      if ((p.materials['灵草'] ?? 0) <= 0) {
        await io.narrate(dim('你并无灵草，只得爱莫能助。'));
        return;
      }
      const ch = await io.ask('是否赠她一株灵草？(y/n)', ['y', 'n'], 'y');
      if (ch === 'n') {
        await io.narrate(dim('你摇头离去。'));
        return;
      }
      p.materials['灵草'] -= 1;
      addHeart(p, 8);
      if (chance(0.5)) addSpirit(p, 200);
      await io.narrate(green('老妇千恩万谢。你行善积德，心境清明，或有后福。'));
    },
  },
  {
    name: '市集奇遇', weight: 2,
    run: async (p, state, io) => {
      await io.narrate('【游历·市集奇遇】你逛至一处修士集市，人声鼎沸。');
      if (state.leads.length < 5 && chance(0.4)) {
        const lead = makeLead(p);
        state.leads.push(lead);
        io.print(leadDescription(lead));
        await io.narrate(`你在摊前与 ${lead.name} 偶遇，相谈甚欢。`);
        return;
      }
      addSpirit(p, randint(50, 150));
      await io.narrate(green('你慧眼识珠，淘到几件低价好物，转手小赚一笔。'));
    },
  },
  {
    name: '故人重逢', weight: 1,
    run: async (p, state, io) => {
      if (state.leads.length === 0) {
        await io.narrate(dim('【游历·故人重逢】你在路上偶遇一位旧识，相谈几句便各自散去。'));
        return;
      }
      const l = pick(state.leads);
      const g = randint(3, 10);
      l.favor = Math.min(100, l.favor + g);
      await io.narrate(`【游历·故人重逢】你与 ${magenta(l.name)} 不期而遇，相谈甚欢，好感 +${g}。`);
    },
  },

  // ===== 彩蛋 / 特殊类 =====
  {
    name: '神秘注视', weight: 1,
    run: async (p, _s, io) => {
      await io.narrate('【游历·神秘注视】冥冥之中，你感到有一道目光穿越虚空，落在你身上……');
      await io.narrate(dim('（似乎有人正在屏幕之外注视着你。）'));
      if (chance(0.5)) addHeart(p, 3);
      else addHeart(p, -2);
    },
  },
  {
    name: '道友传讯', weight: 2,
    run: async (p, _s, io) => {
      const msg = pick(['有道友传讯：某处灵脉将开，速往。', '坊市将有大批丹药降价。', '某宗门大开山门，广收门徒。']);
      await io.narrate(`【游历·道友传讯】${msg}`);
      if (chance(0.5)) {
        addSpirit(p, 100);
        await io.narrate(green('你循讯而去，小有收获。'));
      } else {
        await io.narrate(dim('消息或真或假，你未敢轻信。'));
      }
    },
  },
];
