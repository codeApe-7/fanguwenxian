// 游历随机事件表：50+ 个事件，覆盖资源 / 修为 / 机缘 / 战斗 / 风险 / 分支选择 / 社交 / 彩蛋。
// 每个事件含权重（越大越常见）与处理函数；分支事件会向玩家提问，机缘类权重较低。
//
// 文案约定：
// - 叙述经 {place} 地点池填充——同一事件每次发生在不同地名，天下才显得大；
// - 剧本/flag 感知：少数事件按主线抉择换措辞（魔胎、骨片、仇家余孽），系统与剧情互通；
// - 机缘大事写入大事记（立传素材）。

import type { GameIO } from '../io.js';
import type { GameState, Player } from '../types.js';
import { MATERIALS, TREASURES, TECHNIQUES, REALMS, ROOTS, sectOf, sectPower, upgradeTechnique, playerTitle, incomeScale, betterTreasures, treasureSummary } from '../content.js';
import { PLACES, TOWNS } from '../content/world.js';
import { dialogueOf } from '../content/dialogue.js';
import { green, red, yellow, cyan, magenta, dim } from '../colors.js';
import { pick, chance, randint } from './rng.js';
import { fill, addBio } from './text.js';
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
  p.spirit += Math.round(n * incomeScale(p.realmIdx)); // 灵石收益随境界等比放大
}

function loseSpirit(p: Player, n: number): void {
  p.spirit = Math.max(0, p.spirit - n);
}

function addMat(p: Player, name: string, n = 1): void {
  p.materials[name] = (p.materials[name] ?? 0) + n * (1 + Math.floor(p.realmIdx / 2)); // 材料产出随境界适度放大
}

function addCult(p: Player, n: number): void {
  p.cultivation = Math.max(0, Math.min(100, p.cultivation + n));
}

function addHeart(p: Player, n: number): void {
  p.heart = Math.min(100, Math.max(0, p.heart + n));
}

function gainPill(p: Player, name: string, n = 1): void {
  p.pills[name] = (p.pills[name] ?? 0) + n;
}

function flagOf(p: Player, name: string): number {
  return p.flags?.[name] ?? 0;
}

/** 事件旁白：自动配一处地名。 */
async function scene(io: GameIO, tpl: string): Promise<void> {
  await io.narrate(fill(tpl, { place: pick(PLACES), town: pick(TOWNS) }));
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
  const better = betterTreasures(p);
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
      await scene(io, '【游历·洞府遗迹】{place}山腹间有灵光隐现，你循光掘开半壁碎岩——竟是一座坍了半边的前人洞府。');
      await io.narrate('主人早已不知去向，蒲团下压着的灵石与柜中几味灵材，倒是保存完好。');
      addSpirit(p, 100);
      for (let i = 0; i < 2; i++) addMat(p, pick(Object.keys(MATERIALS)));
    },
  },
  {
    name: '灵药园', weight: 3,
    run: async (p, _s, io) => {
      await scene(io, '【游历·灵药园】{place}谷底云气不散，拨开齐腰的野草，一株灵花开得正艳——附近竟无妖兽看守，是你运气好。');
      addMat(p, '灵花');
    },
  },
  {
    name: '灵石矿脉', weight: 2,
    run: async (p, _s, io) => {
      await scene(io, '【游历·灵石矿脉】{place}崖壁一道新裂的石缝里透出莹莹白光——一条小型灵石矿脉，前人竟未采尽。');
      await io.narrate('你凿了三日，把能带走的都带走了。');
      addSpirit(p, 300);
    },
  },
  {
    name: '天降陨铁', weight: 2,
    run: async (p, _s, io) => {
      await scene(io, '【游历·天降陨铁】夜宿{place}，一道流火划破天幕，坠在十里之外。你寻踪赶去，土坑正中一块陨铁犹自发烫。');
      await io.narrate('敲开外壳，内里凝着一枚灵石精。');
      addMat(p, '灵石精');
    },
  },
  {
    name: '古修药园', weight: 2,
    run: async (p, _s, io) => {
      await scene(io, '【游历·古修药园】{place}深处藩篱倾颓，畦垄依稀——是前人弃置的药园。无人照料多年，泼辣的几味灵药反倒长疯了。');
      addMat(p, '灵草', 2);
      addMat(p, '灵花');
    },
  },
  {
    name: '灵脉温泉', weight: 2,
    run: async (p, _s, io) => {
      await scene(io, '【游历·灵脉温泉】{place}石涧尽头一汪温泉，白汽氤氲，水底隐有灵脉游走。你宽衣入水，泡了整整三日。');
      await io.narrate('出水时通体舒泰，连旧年打熬留下的暗伤都松快了几分。');
      addHeart(p, 8);
      addCult(p, 15);
    },
  },
  {
    name: '商队遗物', weight: 2,
    run: async (p, _s, io) => {
      const pill = pick(['凝气丹', '聚灵丹', '疗伤丹', '回春丹']);
      await scene(io, '【游历·商队遗物】{place}官道旁翻着一辆焦黑的货车，人已不在，货散了一地——看痕迹，是遭了妖兽。');
      await io.narrate('你替死者垒了座石堆，收殓遗物时寻得一瓶尚算完好的丹药。');
      gainPill(p, pill);
      io.print(green(`获得 ${pill}×1。`));
    },
  },
  {
    name: '灵兽巢穴', weight: 2,
    run: async (p, _s, io) => {
      await scene(io, '【游历·灵兽巢穴】{place}岩缝深处有一座废弃兽穴，兽骨堆里滚出一颗温润的内丹——原主人大约是寿终正寝了。');
      addMat(p, '妖兽内丹');
    },
  },
  {
    name: '山涧灵泉', weight: 2,
    run: async (p, _s, io) => {
      await scene(io, '【游历·山涧灵泉】{place}山涧清冽，泉眼四周灵草丛生，掐一把满手清香。');
      addMat(p, '灵草', 2);
    },
  },
  {
    name: '修士遗蜕', weight: 2,
    run: async (p, _s, io) => {
      await scene(io, '【游历·修士遗蜕】{place}岩窟中一具修士遗蜕趺坐千年，衣冠成灰，怀中储物袋犹在。');
      await io.narrate('你朝遗蜕三拜，替他归拢骸骨立了石冢——身外之物，便却之不恭了。');
      addSpirit(p, randint(100, 300));
      addMat(p, pick(Object.keys(MATERIALS)));
    },
  },
  {
    name: '古修手札', weight: 2,
    run: async (p, _s, io) => {
      const t = pick(Object.keys(TECHNIQUES));
      p.fragments[t] = (p.fragments[t] ?? 0) + 1;
      await scene(io, `【游历·古修手札】{place}一处塌了半边的石室里，你于枯骨旁拾得半卷手札——正是《${t}》的残篇！`);
      if (p.scenario === '天命凡骨' && flagOf(p, '骨片') >= 1) {
        await io.narrate(dim('揣起残篇的一瞬，心口的骨片微微发热，似在颔首。'));
      }
    },
  },
  {
    name: '破旧经阁', weight: 2,
    run: async (p, _s, io) => {
      p.fragments['无名残篇'] = (p.fragments['无名残篇'] ?? 0) + 1;
      await scene(io, '【游历·破旧经阁】{place}荒村头一座塌顶的经阁，藏书早被搬空，唯梁上暗格里还塞着一卷无名残篇。');
      await io.narrate('字迹漫漶，看不出出处——参悟一番，于当前功法或有精进。');
    },
  },

  // ===== 修为类 =====
  {
    name: '前辈指点', weight: 3,
    run: async (p, _s, io) => {
      await scene(io, '【游历·前辈指点】{place}渡口等船，同席一位青衫客与你闲谈半日，临别时随口点了你行功路线上的三处滞涩。');
      await io.narrate('船行十里你才回过味来——那三处，处处切中要害。回望渡口，青衫客早已不见。');
      addCult(p, 20);
    },
  },
  {
    name: '灵气潮汐', weight: 2,
    run: async (p, _s, io) => {
      await scene(io, '【游历·灵气潮汐】行经{place}，忽觉天地灵气如潮翻涌——是地脉自行吐纳的小周天，可遇不可求。');
      await io.narrate('你就地趺坐，随潮吐纳，一夜抵得旬月苦功。');
      addCult(p, 35);
    },
  },
  {
    name: '顿悟', weight: 1,
    run: async (p, _s, io) => {
      await scene(io, '【游历·顿悟】{place}道旁一树落花，无风自坠。你驻足看了半晌，忽然笑出声来。');
      await io.narrate(green('困扰经年的一处瓶颈，就在这一树落花里豁然贯通。道在眼前，不在天边。'));
      addCult(p, 50);
      addHeart(p, 10);
    },
  },
  {
    name: '观星悟道', weight: 2,
    run: async (p, _s, io) => {
      await scene(io, '【游历·观星悟道】夜宿{place}高崖，天河低垂，星子仿佛伸手可摘。你仰观至天明，于星移斗转间隐有所悟。');
      addCult(p, 25);
      addHeart(p, 5);
    },
  },
  {
    name: '静坐观瀑', weight: 2,
    run: async (p, _s, io) => {
      await scene(io, '【游历·静坐观瀑】{place}飞瀑百丈，水声如雷。你于瀑下青石静坐七日，观水之就下、之不争、之无孔不入。');
      addCult(p, 15);
      addHeart(p, 5);
    },
  },

  // ===== 机缘类（稀有机遇） =====
  {
    name: '仙猿认主', weight: 1,
    run: async (p, _s, io) => {
      await scene(io, '【游历·仙猿认主】{place}林间一只白毛灵猿蹲在树杈上看你行功，看着看着，竟口吐人言指出你换气的破绽。');
      await io.narrate('你惊起追问，它却只肯揪着你的行囊讨果子吃。此后数月，它一路相随，一猿一人，亦师亦友。');
      addCult(p, 25);
      addHeart(p, 10);
      await io.narrate(green('此乃难得的机缘！'));
    },
  },
  {
    name: '古修士传承', weight: 1,
    run: async (p, _s, io) => {
      const old = playerTitle(p);
      await scene(io, '【游历·古修士传承】{place}地陷三尺，露出一方古坛。坛心盘坐的身影抬起头——竟是一位坐化前以秘法封存神识的上古修士。');
      await io.narrate('「等到一个有缘人，老夫可以放心去了。」一道传承灌顶而下，你只觉境界壁垒如纸般层层洞穿！');
      advanceStage(p);
      await io.narrate(green(`你从 ${old} 突破至 ${playerTitle(p)}！`));
      addBio(p, `得上古修士传承，境界跃升至${playerTitle(p)}`);
    },
  },
  {
    name: '道统现世', weight: 1,
    run: async (p, _s, io) => {
      const t = upgradeTechnique(p);
      if (t) {
        await scene(io, `【游历·道统现世】{place}山洪冲开一座古碑亭，碑身刻满功诀——竟是失传已久的《${t}》全本！`);
        await io.narrate(green('你拓下全篇。可于「闭关·切换主修」中启用。'));
        addBio(p, `于荒野古碑得《${t}》道统`);
      } else {
        addSpirit(p, 300);
        await scene(io, '【游历·道统现世】{place}古碑亭中拓得一部残诀，细读之下不及你所修——转手让给坊市书商，得了些灵石。');
      }
    },
  },
  {
    name: '太初瓶', weight: 1,
    run: async (p, _s, io) => {
      if (!p.goldenFinger) {
        p.goldenFinger = '太初瓶';
        p.cheatBonus = 2.0;
        await scene(io, '【游历·太初瓶】{place}山涧淘洗药材，指尖碰到一只巴掌大的古朴小瓶。瓶身无纹，入手却沉得反常。');
        await io.narrate(green('入夜，瓶中垂下一滴翠绿的液珠，落进药圃——一夜之间，灵草疯长三寸。瓶底缓缓浮出三个古字：「太初瓶」。'));
        await io.narrate('传说中可催熟灵药、窃夺光阴的至宝，认了你这个主人。修炼速度 ×2！');
        addBio(p, '山涧得太初瓶认主');
      } else {
        addSpirit(p, 500);
        await scene(io, '【游历·太初瓶】{place}地摊上又见一只「太初瓶」——仿得倒像，可惜你怀里揣着真的。你顺手买下转卖藏家，赚了 500 灵石。');
      }
    },
  },
  {
    name: '灵根重塑', weight: 1,
    run: async (p, _s, io) => {
      const old = p.root;
      const r = upgradeRoot(p);
      if (r) {
        await scene(io, '【游历·灵根重塑】{place}绝壁藤蔓间垂着一株九叶异草，叶脉里流着虹光——竟是传说中可洗练根骨的「换髓草」！');
        await io.narrate('你和衣入定，将异草连露嚼下。彻夜如遭雷噬，天明时脱了一层灰皮——');
        await io.narrate(green(`灵根由 ${old} 蜕变为 ${r}！`));
        addBio(p, `服换髓草，灵根蜕变为${r}`);
      } else {
        addCult(p, 40);
        await scene(io, '【游历·灵根重塑】{place}绝壁上寻得一株换髓草——可你已是天灵根，无可再塑。异草化作一股精纯药力，尽数滋养了修为。');
      }
    },
  },
  {
    name: '天降横财', weight: 1,
    run: async (p, _s, io) => {
      addSpirit(p, 800);
      await scene(io, '【游历·天降横财】{place}上空两道遁光斗得正酣，一只储物袋被打落，不偏不倚砸在你脚边。');
      await io.narrate(green('你抬头看看，两道遁光已远。低头看看——袋里灵石成堆。天予不取，反受其咎。'));
    },
  },
  {
    name: '上古丹方', weight: 1,
    run: async (p, _s, io) => {
      const candidates: string[] = [];
      const cur = REALMS[p.realmIdx].breakPill;
      if (cur) candidates.push(cur);
      const next = p.realmIdx + 1 < REALMS.length ? REALMS[p.realmIdx + 1].breakPill : null;
      if (next) candidates.push(next);
      const pill = candidates.length > 0 ? pick(candidates) : '聚灵丹';
      gainPill(p, pill);
      await scene(io, `【游历·上古丹方】{place}古修洞府的丹室里，炉火早熄，炉膛正中却端端正正供着一枚 ${pill}——像是主人特意留给后来人的。`);
    },
  },
  {
    name: '法宝现世', weight: 1,
    run: async (p, _s, io) => {
      const t = upgradeTreasure(p);
      if (t) {
        await scene(io, `【游历·法宝现世】{place}雷雨之夜，一道宝光冲天而起。你抢在众修之前赶到，于石台之上握住了那柄 ${t}！`);
        await io.narrate(green('宝物认主，众人姗姗来迟，只得望光兴叹。'));
        addBio(p, `夺得出世法宝${t}`);
      } else {
        addSpirit(p, 200);
        await scene(io, '【游历·法宝现世】{place}宝光冲天，你抢先夺得出世之宝——细看之下不及你手中之物，转手卖了个好价钱。');
      }
    },
  },

  // ===== 战斗类 =====
  {
    name: '妖兽袭击', weight: 4,
    run: async (p, state, io) => {
      await combat(p, state.leads, io, {
        intro: fill('行至{place}，林间鸦雀骤然噤声——凶险！拦路的正是 {enemy}！', { place: pick(PLACES) }),
        kind: '妖兽', title: '山道遭遇',
      });
    },
  },
  {
    name: '魔修截杀', weight: 2,
    run: async (p, state, io) => {
      await combat(p, state.leads, io, {
        intro: fill('{place}道上，一股阴冷杀气自背后锁定于你，来者正是 {enemy}！', { place: pick(PLACES) }),
        kind: '修士', title: '背后杀气',
      });
    },
  },
  {
    name: '夺宝仇家', weight: 2,
    run: async (p, state, io) => {
      await combat(p, state.leads, io, {
        intro: '你身怀重宝的消息不知被谁走漏，{enemy} 循味寻上门来！',
        kind: '修士', title: '劫宝之徒',
      });
    },
  },
  {
    name: '邪修诱骗', weight: 2,
    run: async (p, state, io) => {
      await scene(io, '【游历·邪修诱骗】{place}茶肆里凑过来一个热络的修士，压低声音说他探得一处上古密藏，只差一位「有缘道友」搭手。');
      const ch = await io.ask('是否识破其诡计？(y/n)', ['y', 'n'], 'y');
      if (ch === 'y') {
        await combat(p, state.leads, io, {
          intro: '你冷笑点破他话里的三处破绽。邪修见事败，眼露凶光，与埋伏的 {enemy} 一并杀出！',
          kind: '修士', title: '识破骗局',
        });
      } else {
        const loss = Math.min(p.spirit, randint(100, 300));
        loseSpirit(p, loss);
        await io.narrate(red(`你随他七拐八绕进了一处「密藏」，阵光一闪——人去财空，被卷走 ${loss} 灵石！`));
        await io.narrate(dim('（江湖险恶，天上不会掉密藏。）'));
      }
    },
  },
  {
    name: '兽潮', weight: 2,
    run: async (p, state, io) => {
      await combat(p, state.leads, io, {
        intro: fill('{place}方向烟尘蔽日，兽吼连成一片——兽潮过境！冲在最前的 {enemy} 已扑至眼前！', { place: pick(PLACES) }),
        kind: '妖兽', title: '兽潮过境',
      });
    },
  },
  {
    name: '旧怨寻仇', weight: 2,
    run: async (p, state, io) => {
      if (p.scenario === '世家贵子' && flagOf(p, '厉氏覆灭') >= 1) {
        await combat(p, state.leads, io, {
          intro: '阴风堡虽灭，余孽未绝——一名漏网的厉氏死士红着眼寻来，正是 {enemy}！',
          kind: '魔修', title: '阴风堡余孽',
        });
        return;
      }
      await combat(p, state.leads, io, {
        intro: '冤家路窄。多年前的一桩旧怨循迹而至——正是 {enemy}！',
        kind: '修士', title: '旧怨寻仇',
      });
    },
  },

  // ===== 风险类 =====
  {
    name: '心魔来袭', weight: 2,
    run: async (p, _s, io) => {
      if (p.scenario === '魔星降世' && flagOf(p, '渡魔') >= 1) {
        await io.narrate('【游历·心魔来袭】夜半行功，一缕心魔悄然滋生——金丹上那道墨纹微微一亮，心魔如雪沁汤，无声消融。');
        await io.narrate(green('渡过魔的人，心里那盏灯不容易灭。'));
        addHeart(p, 2);
        return;
      }
      if (p.scenario === '魔星降世' && flagOf(p, '魔道') >= 1) {
        await io.narrate(red('【游历·心魔来袭】魔功行至酣处，杀念如野火燎原——你怔忡半晌，才认出镜中那双猩红的眼睛是自己的。'));
        await io.narrate(red('魔道逆行，心魔比常人凶三分。'));
        addHeart(p, -12);
        return;
      }
      await io.narrate(red('【游历·心魔来袭】夜半独行，旧年悔憾忽然翻涌上来，如附骨之疽——心魔无形，伤人最深。'));
      addHeart(p, -8);
    },
  },
  {
    name: '走火入魔', weight: 2,
    run: async (p, _s, io) => {
      await io.narrate(red('【游历·走火入魔】野外行功贪快了半分，灵气突然逆冲经脉！你僵坐半日强行归元，一口瘀血喷出三尺。'));
      await io.narrate(red('修为跌损，心有余悸——快，是修行路上最贵的字。'));
      p.cultivation = Math.max(0, p.cultivation - 30);
      addHeart(p, -10);
    },
  },
  {
    name: '误入毒瘴', weight: 2,
    run: async (p, _s, io) => {
      await scene(io, '【游历·误入毒瘴】{place}谷口雾气发甜，你警觉时已迟——瘴毒无声无息，早顺着呼吸进了肺腑。');
      addHeart(p, -6);
      p.lifespan -= randint(1, 5);
      await io.narrate(red('你运功逼毒三日，终究伤了些根基，寿元折损。'));
    },
  },
  {
    name: '遭遇劫匪', weight: 2,
    run: async (p, _s, io) => {
      const loss = Math.floor(p.spirit * 0.2);
      if (loss <= 0) {
        await scene(io, '【游历·遭遇劫匪】{place}山道上跳出几个蒙面劫匪，翻遍你的行囊只找出两块干粮。');
        await io.narrate(dim('为首的啐了一口，把干粮还了你半块：「穷成这样也配修仙？」'));
        return;
      }
      loseSpirit(p, loss);
      await scene(io, `【游历·遭遇劫匪】{place}隘口被一伙修为不弱的劫匪堵住。双拳难敌四手，你破财免灾，损失 ${loss} 灵石。`);
    },
  },
  {
    name: '灵田失窃', weight: 2,
    run: async (p, _s, io) => {
      const mats = Object.keys(MATERIALS).filter((k) => (p.materials[k] ?? 0) > 0);
      if (mats.length === 0) {
        await io.narrate(dim('【游历·灵田失窃】有梁上君子光顾了你的储物袋，翻了个底朝天——分文未得，悻悻而去。'));
        return;
      }
      const m = pick(mats);
      p.materials[m] -= 1;
      await io.narrate(red(`【游历·灵田失窃】投宿客栈一夜好睡，醒来发觉储物袋的禁制被人破开——${m}×1 不翼而飞！`));
    },
  },
  {
    name: '天雷惊扰', weight: 1,
    run: async (p, _s, io) => {
      await io.narrate('【游历·天雷惊扰】你幼年赌气时曾对天起誓「若有虚言天打雷劈」——今日晴空万里，雷云偏偏在你头顶聚了起来。');
      const loss = Math.min(p.spirit, randint(50, 150));
      loseSpirit(p, loss);
      addHeart(p, -5);
      await io.narrate(red(`一道细雷劈得你毛发焦立，储物袋也震散了一角，损失 ${loss} 灵石。`));
      await io.narrate(dim('（修仙者一言九鼎，誓不可乱立——天，是真的在听。）'));
    },
  },

  // ===== 分支选择类 =====
  {
    name: '神秘洞府', weight: 2,
    run: async (p, state, io) => {
      await scene(io, '【游历·神秘洞府】{place}云雾深处一座洞府若隐若现，门上禁制将熄未熄，隐有宝光透出。');
      const ch = await io.ask('是否入内探索？(y/n)', ['y', 'n'], 'y');
      if (ch === 'n') {
        await io.narrate(dim('你在门前立了片刻，终究退去。来日方长。'));
        return;
      }
      if (chance(0.6)) {
        addSpirit(p, randint(150, 400));
        addMat(p, pick(Object.keys(MATERIALS)));
        await io.narrate(green('禁制已朽，一推即开。府中主人早去，灵石灵材倒是留了满架——你满载而归！'));
      } else {
        await combat(p, state.leads, io, {
          intro: '你方跨过门槛，禁制骤然回光返照——守府之物 {enemy} 自阴影中扑出！',
          kind: '妖兽', title: '古府守物',
        });
      }
    },
  },
  {
    name: '散修传承', weight: 2,
    run: async (p, _s, io) => {
      await scene(io, '【游历·散修传承】{place}破庙里倚坐着一位油尽灯枯的老散修，见你进来，浑浊的眼睛亮了亮：「小友，可愿收下老朽毕生所学？」');
      const ch = await io.ask('是否接受传承？(y/n)', ['y', 'n'], 'y');
      if (ch === 'n') {
        addSpirit(p, 100);
        await io.narrate(dim('你婉言谢绝，只留下陪他说了一夜的话。天明老人坐化，你替他收殓，得其遗赠灵石。'));
        return;
      }
      addCult(p, 40);
      if (chance(0.3)) {
        addHeart(p, -15);
        p.lifespan -= randint(3, 10);
        await io.narrate(red('传承入体方知霸道——老人一生的怨憎恩仇裹在功力里一并涌来，你险些被冲垮心防！'));
      } else {
        await io.narrate(green('传承圆满。老人含笑坐化：「我这条路，总算没断在我手里。」'));
      }
    },
  },
  {
    name: '路遇商队', weight: 3,
    run: async (p, _s, io) => {
      await scene(io, '【游历·路遇商队】{town}来的商队与你同路歇脚，领队见你是修士，拱手兜售：灵草三株，只要 50 灵石——「行价八折，交个朋友」。');
      if (p.spirit < 50) {
        await io.narrate(dim('你摸了摸干瘪的钱袋，讪讪摆手。领队了然，抱拳作别。'));
        return;
      }
      const ch = await io.ask('花 50 灵石购 3 株灵草？(y/n)', ['y', 'n'], 'y');
      if (ch === 'y') {
        p.spirit -= 50;
        addMat(p, '灵草', 3);
        await io.narrate(green('银货两讫。领队多送了你一小包茶叶：「出门在外，都不容易。」'));
      } else {
        await io.narrate(dim('你摆摆手，继续赶路。'));
      }
    },
  },
  {
    name: '拍卖会', weight: 2,
    run: async (p, _s, io) => {
      const better = betterTreasures(p);
      if (better.length === 0) {
        await scene(io, '【游历·拍卖会】{town}坊市小拍开槌，你从头听到尾——皆是凡品，没有入你法眼之物。');
        return;
      }
      const t = pick(better);
      const price = Math.floor(TREASURES[t].price * 0.8);
      await scene(io, `【游历·拍卖会】{town}坊市小拍正竞一件 ${cyan(t)}，卖家急于出手，起拍只要 ${price} 灵石——识货的都看得出这是个漏。`);
      if (p.spirit < price) {
        await io.narrate(dim('可惜你囊中灵石不足，只得眼看别人把漏捡走。'));
        return;
      }
      const ch = await io.ask(`是否出价 ${price} 灵石拍下 ${t}？(y/n)`, ['y', 'n'], 'y');
      if (ch === 'y') {
        p.spirit -= price;
        p.treasure = t;
        await io.narrate(green(`一槌定音，${t} 到手，实力大涨！`));
      } else {
        await io.narrate(dim('你按兵不动，看那件宝贝花落别家。'));
      }
    },
  },
  {
    name: '神秘老者', weight: 2,
    run: async (p, _s, io) => {
      await scene(io, '【游历·神秘老者】{place}道旁一位衣衫褴褛的老者拦住你，气若游丝：「小友……行行好，一枚疗伤丹，救条老命。」');
      const ch = await io.ask('是否施以援手？(y/n)', ['y', 'n'], 'y');
      if (ch === 'n') {
        await io.narrate(dim('你侧身绕过，没有回头。修行路上，谁顾得了谁。'));
        return;
      }
      if ((p.pills['疗伤丹'] ?? 0) > 0) {
        p.pills['疗伤丹'] -= 1;
        await io.narrate('你取出疗伤丹喂他服下。');
      } else if (p.spirit >= 30) {
        p.spirit -= 30;
        await io.narrate('你身无丹药，便掏出 30 灵石，跑了趟最近的药铺。');
      } else {
        await io.narrate('你翻遍行囊也没凑出药钱，只得背起老人送到最近的医馆门口。');
        return;
      }
      if (chance(0.5)) {
        addSpirit(p, 300);
        await io.narrate(green('老者缓过气来，浑浊的眼睛忽然清亮如电——竟是一位游戏红尘的隐世高人！他抚须大笑，赠你灵石一囊：「心善之人，配得起造化。」'));
      } else {
        addCult(p, 20);
        addHeart(p, 8);
        await io.narrate(green('老者感激涕零，把祖上传的几句行功口诀倾囊相授。口诀粗浅，其中两句却暗合大道。'));
      }
    },
  },
  {
    name: '秘境入口', weight: 2,
    run: async (p, state, io) => {
      await scene(io, '【游历·秘境入口】{place}上空一道空间裂缝吞吐霞光，边缘平整——是处尚未被人发现的小秘境，机缘与凶险各占一半。');
      const ch = await io.ask('是否冒险闯入？(y/n)', ['y', 'n'], 'y');
      if (ch === 'n') {
        await io.narrate(dim('你按捺住好奇，在裂缝旁留了个记号，绕道而行。'));
        return;
      }
      if (chance(0.5)) {
        addSpirit(p, randint(300, 600));
        addCult(p, 30);
        addMat(p, pick(Object.keys(MATERIALS)), randint(1, 2));
        await io.narrate(green('秘境之内灵气醇厚如酒，天材地宝俯拾皆是——你盘桓月余，满载而归！'));
      } else {
        await combat(p, state.leads, io, {
          intro: '秘境岂有无主之理——镇守此地的 {enemy} 咆哮着扑杀而来！',
          kind: '妖兽', title: '秘境镇守',
        });
      }
    },
  },
  {
    name: '论道邀请', weight: 2,
    run: async (p, _s, io) => {
      await scene(io, '【游历·论道邀请】{place}凉亭里一位同阶修士起身见礼：「久闻道友之名。亭中清茶一壶，可愿坐而论道？」');
      const ch = await io.ask('是否应邀论道？(y/n)', ['y', 'n'], 'y');
      if (ch === 'n') {
        await io.narrate(dim('你拱手婉拒，继续赶路。'));
        return;
      }
      if (chance(0.7)) {
        addCult(p, 25);
        addHeart(p, 6);
        await io.narrate(green('一壶茶从午后论到月上中天。他山之石可以攻玉，你获益良多，道心愈发通透。'));
      } else {
        addHeart(p, -5);
        await io.narrate(yellow('对方引经据典，锋锐逼人，你数度语塞。临别他拱手一笑：「道友道基扎实，只是书读少了。」——扎心，但有理。'));
      }
    },
  },
  {
    name: '破阵考验', weight: 2,
    run: async (p, _s, io) => {
      await scene(io, '【游历·破阵考验】{place}误入一座上古遗阵，云雾锁路，阵心隐隐有宝光流转——阵法年久，隐见衰朽破绽。');
      const ch = await io.ask('是否尝试破阵取宝？(y/n)', ['y', 'n'], 'y');
      if (ch === 'n') {
        await io.narrate(dim('你循来路小心退出。阵不欺我，我不欺阵。'));
        return;
      }
      if (chance(0.55)) {
        addSpirit(p, randint(200, 500));
        addMat(p, '灵石精');
        await io.narrate(green('三日推演，你寻得阵眼一线之隙，抽了那块作为阵枢的灵石精——大阵无声而散，阵心之宝尽归于你！'));
      } else {
        addHeart(p, -12);
        addCult(p, -20);
        await io.narrate(red('推演有误，一步踏错——大阵反噬，你被困阵中七日，耗尽力气才爬出来，心神俱损。'));
      }
    },
  },
  {
    name: '双修邀请', weight: 1,
    run: async (p, _s, io) => {
      await scene(io, '【游历·双修邀请】{place}客栈中一位修士递来拜帖，言辞坦荡：观你我功法属性相合，愿以双修之礼共参大道，各取所需，绝无纠缠。');
      const ch = await io.ask('是否应允？(y/n)', ['y', 'n'], 'y');
      if (ch === 'n') {
        await io.narrate(dim('你把拜帖原样奉还，对方也不纠缠，抱拳自去。'));
        return;
      }
      const gain = sectOf(p)?.dualBonus ? Math.round(25 + 20 * sectPower(p)) : 25; // 合欢宗等双修加成
      addCult(p, gain);
      addHeart(p, 5);
      await io.narrate(green(`一夜坎离既济，各有精进。天明道别，江湖再见亦是朋友。修为 +${gain}，心境 +5。`));
    },
  },

  // ===== 副业解锁 =====
  {
    name: '丹师收徒', weight: 2,
    run: async (p, _s, io) => {
      await scene(io, '【游历·丹师收徒】{place}药庐外排着长队——一位云游丹师在此义诊。你帮着碾了半日药，丹师捻须打量你：「火候感不错，可愿学炼丹？」');
      if (p.skills.includes('炼丹')) {
        const pill = pick(['凝气丹', '聚灵丹', '疗伤丹']);
        gainPill(p, pill);
        await io.narrate(green(`你亮出手法，丹师眼睛一亮，当场与你切磋了一炉，临别赠丹为礼——${pill}×1。`));
        return;
      }
      const ch = await io.ask('是否拜入其门下？(y/n)', ['y', 'n'], 'y');
      if (ch === 'n') {
        await io.narrate(dim('你婉言谢绝。丹师也不勉强，笑称有缘再会。'));
        return;
      }
      unlockSkill(p, '炼丹');
      await io.narrate(green('你随丹师研药三月，尽得其火候心法——习得炼丹之术！此后可于丹房炼丹。'));
      addBio(p, '拜云游丹师为师，习得炼丹');
    },
  },
  {
    name: '丹方残卷', weight: 2,
    run: async (p, _s, io) => {
      await scene(io, '【游历·丹方残卷】{place}破败洞府的丹室里，你从灶灰下扒出一卷油布包裹的丹方，火燎虫蛀，主方倒还完整。');
      if (unlockSkill(p, '炼丹')) {
        await io.narrate(green('你对着丹方琢磨月余，竟自悟出炉火门道——习得炼丹之术！'));
        addBio(p, '自悟丹方残卷，习得炼丹');
      } else {
        gainPill(p, '聚灵丹');
        await io.narrate(green('你已通丹道，一眼认出这是前人改良的聚灵丹别方。依方一试，果然成丹——聚灵丹×1。'));
      }
    },
  },
  {
    name: '丹王传承', weight: 1,
    run: async (p, _s, io) => {
      await scene(io, '【游历·丹王传承】{place}崖底一座丹炉状的洞府轰然中开——丹香百年不散，是一位丹道大能的坐化之所！');
      if (unlockSkill(p, '炼丹')) {
        gainPill(p, '凝气丹', 2);
        gainPill(p, '聚灵丹');
        await io.narrate(green('你得其炉鼎心法与满架成丹——习得炼丹之术，获赠丹药若干！'));
        addBio(p, '得丹道大能洞府传承');
      } else {
        gainPill(p, '筑基丹');
        await io.narrate(green('你已通丹道，大能手札中的几处火候批注令你如获至宝。依法开炉，竟成筑基丹一枚！'));
      }
    },
  },
  {
    name: '器师收徒', weight: 2,
    run: async (p, _s, io) => {
      await scene(io, '【游历·器师收徒】{place}铁匠垭炉火彻夜不熄。你围观锻打忘了时辰，老器师撂下铁钳：「看得出门道么？看得出，就留下学。」');
      if (p.skills.includes('炼器')) {
        addMat(p, '灵石精');
        await io.narrate(green('你上手抡了三锤，火星走位分毫不差。老器师抚掌大笑，赠你一块灵石精：「同行见同行，两眼泪汪汪！」'));
        return;
      }
      const ch = await io.ask('是否拜入其门下？(y/n)', ['y', 'n'], 'y');
      if (ch === 'n') {
        await io.narrate(dim('你婉言谢绝。老器师哼了一声，转身继续打铁。'));
        return;
      }
      unlockSkill(p, '炼器');
      await io.narrate(green('三个月抡锤敲打，掌心血泡结成老茧——习得炼器之术！此后可于炼器炉锻造法宝。'));
      addBio(p, '拜老器师为师，习得炼器');
    },
  },
  {
    name: '器道传承', weight: 1,
    run: async (p, _s, io) => {
      await scene(io, '【游历·器道传承】{place}塌方的矿洞深处竟藏着一座上古器室：炉膛冷了千年，壁上一部《锻器总纲》笔笔如刀刻。');
      if (unlockSkill(p, '炼器')) {
        await io.narrate(green('你对壁参悟七日，锤法炉诀了然于胸——习得炼器之术！'));
        addBio(p, '参悟上古锻器总纲，习得炼器');
      } else {
        addMat(p, '妖兽内丹', 2);
        await io.narrate(green('你已通器道，总纲中「以丹淬锋」一节令你茅塞顿开。依法收料，得妖兽内丹×2。'));
      }
    },
  },
  {
    name: '阵师授业', weight: 2,
    run: async (p, _s, io) => {
      await scene(io, '【游历·阵师授业】{place}一位老者蹲在沙地上摆弄石子，你看出那是一座困龙阵的雏形，随口指了一处生门。老者抬头：「眼力不错。想学么？」');
      if (p.skills.includes('阵法')) {
        addMat(p, '灵石精');
        await io.narrate(green('你与老阵师就地推演三局，互有胜负。临别他赠你一块灵石精：「后生可畏。」'));
        return;
      }
      const ch = await io.ask('是否拜入其门下？(y/n)', ['y', 'n'], 'y');
      if (ch === 'n') {
        await io.narrate(dim('你婉言谢绝。老者把石子一收，飘然而去。'));
        return;
      }
      unlockSkill(p, '阵法');
      await io.narrate(green('一季寒暑，沙盘上摆坏了三千枚石子——习得阵法之道！此后可布阵御敌、聚灵养气。'));
      addBio(p, '拜隐世阵师为师，习得阵法');
    },
  },
  {
    name: '古阵图谱', weight: 1,
    run: async (p, _s, io) => {
      await scene(io, '【游历·古阵图谱】{place}遗迹的石匣中收着一卷阵图，绢帛已脆，朱砂阵线仍亮如新血——是一部上古阵法图谱！');
      if (unlockSkill(p, '阵法')) {
        await io.narrate(green('你依图推演，由浅入深，竟自参透布阵之法——习得阵法之道！'));
        addBio(p, '参透上古阵图，习得阵法');
      } else {
        addCult(p, 30);
        await io.narrate(green('你已通阵道，图上几处失传的衍化手法令你眼界大开，修为亦有精进。'));
      }
    },
  },
  {
    name: '符师收徒', weight: 2,
    run: async (p, _s, io) => {
      await scene(io, '【游历·符师收徒】{place}集市上一位符师摆摊卖符，笔走龙蛇。你驻足看了半日，他忽然把笔一递：「手痒了吧？画一张来看。」');
      if (p.skills.includes('符箓')) {
        addMat(p, '灵草');
        await io.narrate(green('你接笔一挥而就，符成自燃，火光青正。符师抚掌：「同道中人！」赠你灵草一株作彩头。'));
        return;
      }
      const ch = await io.ask('是否拜入其门下？(y/n)', ['y', 'n'], 'y');
      if (ch === 'n') {
        await io.narrate(dim('你笑着摆手走开。身后符师的吆喝声又响了起来。'));
        return;
      }
      unlockSkill(p, '符箓');
      await io.narrate(green('百日苦练，废符纸堆了半屋——终于一笔贯通，习得制符之术！此后可于符房绘制符箓。'));
      addBio(p, '拜游方符师为师，习得符箓');
    },
  },
  {
    name: '符箓世家', weight: 1,
    run: async (p, _s, io) => {
      await scene(io, '【游历·符箓世家】{place}一座荒废的老宅门楣上符纹犹存——是没落符箓世家的祖宅。祠堂供桌下，藏着一部传家的制符秘本。');
      if (unlockSkill(p, '符箓')) {
        await io.narrate(green('你于祖宅中研习旬月，尽得其传——习得制符之术！离开时，你把祠堂里倒了的牌位一一扶正。'));
        addBio(p, '得符箓世家秘本，习得符箓');
      } else {
        p.talismans['烈焰符'] = (p.talismans['烈焰符'] ?? 0) + 1;
        await io.narrate(green('你已通符道，秘本所载多有相通。书页间还夹着一张先人留下的烈焰符，符力未散。'));
      }
    },
  },

  // ===== 社交 / 女主类 =====
  {
    name: '搭救落难女修', weight: 2,
    run: async (p, state, io) => {
      await scene(io, '【游历·搭救落难女修】{place}谷中传来打斗声——一名女修背抵石壁，剑光已乱，三头妖兽正步步紧逼。');
      if (state.leads.length < 5 && chance(0.6)) {
        const lead = makeLead(p, randint(28, 38)); // 「感激不已」——救命之恩，好感最高
        state.leads.push(lead);
        await io.narrate('你长身而入，一击退敌，妖兽悻悻遁走。');
        io.print(leadDescription(lead));
        await io.narrate(fill(dialogueOf(lead.personality).rescued, { name: p.name, her: lead.name }));
        return;
      }
      await io.narrate('你出手解围，妖兽四散。');
      addSpirit(p, randint(100, 250));
      addHeart(p, 5);
      await io.narrate(green('对方掷下一袋灵石称谢，纵剑而去。救人一命，心境也跟着敞亮。'));
    },
  },
  {
    name: '替人寻药', weight: 2,
    run: async (p, _s, io) => {
      await scene(io, '【游历·替人寻药】{town}外一位老妇拦路跪求：家中幼孙寒毒入体，郎中说唯有灵草可救——她攒了半生的铜钱，买不起坊市一株。');
      if ((p.materials['灵草'] ?? 0) <= 0) {
        await io.narrate(dim('你翻遍行囊并无灵草，只得指给她坊市善堂的方向，聊尽人事。'));
        return;
      }
      const ch = await io.ask('是否赠她一株灵草？(y/n)', ['y', 'n'], 'y');
      if (ch === 'n') {
        await io.narrate(dim('你摇头离去。身后的啜泣声很快被风吹散——修行人见得多了，心却未必能习惯。'));
        return;
      }
      p.materials['灵草'] -= 1;
      addHeart(p, 8);
      if (chance(0.5)) addSpirit(p, 200);
      await io.narrate(green('老妇捧草千恩万谢，把铜钱硬塞给你又被你退回。行善不问回报——但天道有账本。'));
    },
  },
  {
    name: '市集奇遇', weight: 2,
    run: async (p, state, io) => {
      await scene(io, '【游历·市集奇遇】{town}逢大集，修士摊贩沿河排出二里地，人声鼎沸。');
      if (state.leads.length < 5 && chance(0.4)) {
        const lead = makeLead(p, randint(8, 16)); // 「相谈甚欢」——萍水相逢，好感最低
        state.leads.push(lead);
        await io.narrate(`一个旧书摊前，你与人同时按住了同一卷杂记。抬头对视——`);
        io.print(leadDescription(lead));
        await io.narrate(fill(dialogueOf(lead.personality).meet, { name: p.name, her: lead.name }));
        return;
      }
      addSpirit(p, randint(50, 150));
      await io.narrate(green('你在杂货摊翻出两件被当废铁卖的旧法器，转手小赚一笔——赶集的乐趣就在这里。'));
    },
  },
  {
    name: '故人重逢', weight: 1,
    run: async (p, state, io) => {
      if (state.leads.length === 0) {
        await scene(io, '【游历·故人重逢】{town}街头有人唤你旧名——是早年同路数日的散修。寒暄几句，各奔东西，江湖就是这样。');
        return;
      }
      const l = pick(state.leads);
      const g = randint(3, 10);
      l.favor = Math.min(100, l.favor + g);
      await scene(io, `【游历·故人重逢】{town}长街，你一眼在人潮里认出了 ${magenta(l.name)}。`);
      await io.narrate(fill(dialogueOf(l.personality).reunion, { name: p.name, her: l.name }));
      io.print(green(`久别重逢，好感 +${g}。`));
    },
  },

  // ===== 彩蛋 / 特殊类 =====
  {
    name: '神秘注视', weight: 1,
    run: async (p, _s, io) => {
      await io.narrate('【游历·神秘注视】冥冥之中，你感到有一道目光穿过重重云雾，落在你身上——不带恶意，只是在看。');
      await io.narrate(dim('（似乎有人正在屏幕之外，注视着你的一生。）'));
      if (chance(0.5)) addHeart(p, 3);
      else addHeart(p, -2);
    },
  },
  {
    name: '道友传讯', weight: 2,
    run: async (p, _s, io) => {
      const msg = pick([
        '北边有条无主灵脉将开，去晚了汤都喝不上。',
        '坊市下月清仓，丹药要大跳水，攥住灵石别乱花。',
        '有大宗门要开山门广收门徒，说是百年一遇。',
      ]);
      await io.narrate(`【游历·道友传讯】一位相熟的散修捎来口信：「${msg}」`);
      if (chance(0.5)) {
        addSpirit(p, 100);
        await io.narrate(green('你依讯而动，果然小有斩获——江湖消息，三分真也够吃一顿饱的。'));
      } else {
        await io.narrate(dim('你多方求证，终觉此讯不实，按下未动。事后果然是以讹传讹。'));
      }
    },
  },
];
