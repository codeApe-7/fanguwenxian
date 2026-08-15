// 核心逻辑回归测试：用 MockIO 驱动，验证无运行时错误且状态自洽。
// 运行：npm test

import type { GameIO } from './src/io.js';
import type { GameState, FemaleLead } from './src/types.js';
import { ORIGINS, SECTS, REALMS, SCENARIOS, ARCHETYPES, ROOT_COSTS, TALENT_APTITUDES, TALENT_BODIES, TALENT_CHILDHOODS, TALENT_YOUTHS, SKILLS, PERSONALITY_MODS, PERSONALITIES, TECHNIQUES, TREASURES, learnTechnique, switchTechnique, techLevelName, toxinPenalty, playerAttack, playerDefense, playerTitle, techniqueSummary, upgradeTechnique } from './src/content.js';
import { STORY_NODES, SCENARIO_HEROINES } from './src/content/story.js';
import { DIALOGUE } from './src/content/dialogue.js';
import { LETTERS } from './src/content/letters.js';
import { SECT_TASKS } from './src/content/tasks.js';
import { START_YEAR, PLACES } from './src/content/world.js';
import { createPlayer, rollRoot, makeLead } from './src/core/character.js';
import { createCharacter, mainMenu } from './src/core/engine.js';
import { maybeTriggerStory } from './src/core/storyline.js';
import { WORLD_EVENTS, worldTick, nextWorldEvent } from './src/core/chronicle.js';
import { fill, eraYear, yearOfAge } from './src/core/text.js';
import { sectMenu, sectYearEnd } from './src/core/sect.js';
import { cultivate, breakthrough, takePill, ascend, comprehendFragments } from './src/core/cultivate.js';
import { makeEnemy, combat } from './src/core/combat.js';
import { explore } from './src/core/explore.js';
import { EVENTS } from './src/core/events.js';
import { market } from './src/core/market.js';
import { alchemy, forge, formation, talisman } from './src/core/crafts.js';
import { romance, leadDescription, advanceLeads } from './src/core/romance.js';

class MockIO implements GameIO {
  answer: string | null = null;
  queue: string[] = [];  // 顺序作答队列（优先于 answer）
  log: string[] = [];    // print 输出记录（供断言）
  clear() {}
  print(_t = '') { this.log.push(_t); }
  async narrate(_t: string) {}
  async ask(_q: string, choices?: string[], def?: string) {
    if (this.queue.length > 0) return this.queue.shift()!;
    if (this.answer !== null) return this.answer;
    return def ?? choices?.[0] ?? '';
  }
  async pause() {}
}

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    console.error('  ✗ FAIL:', msg);
  }
}

/** 去掉 ANSI 颜色码（高亮断言与 TTY 环境无关）。 */
function plain(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9]*m/g, '');
}

async function main() {
  const io = new MockIO();
  const p = createPlayer('测试', ORIGINS[0], SECTS[0]);
  const state: GameState = { player: p, leads: [], year: START_YEAR };

  console.log('· 灵根与开局数据');
  const root = rollRoot();
  assert(root.mult > 0 && root.name.length > 0, 'rollRoot 返回合法');
  assert(ORIGINS.length >= 10, `出身至少 10 个（当前 ${ORIGINS.length}）`);
  assert(SCENARIOS.length === 4, '剧本共 4 个');
  assert(ARCHETYPES.length >= 3, `角色设定至少 3 个（当前 ${ARCHETYPES.length}）`);
  assert(ARCHETYPES.every((a) => a.budget > 0 && a.cheatBonus >= 1), '角色设定预算与倍率合法');
  assert(TALENT_APTITUDES.length >= 8, `资质至少 8 档（当前 ${TALENT_APTITUDES.length}）`);
  assert(TALENT_BODIES.length >= 8, `先天体质至少 8 种（当前 ${TALENT_BODIES.length}）`);
  assert(TALENT_CHILDHOODS.length >= 8, `儿时经历至少 8 种（当前 ${TALENT_CHILDHOODS.length}）`);
  assert(TALENT_YOUTHS.length >= 8, `青年经历至少 8 种（当前 ${TALENT_YOUTHS.length}）`);
  assert(Object.keys(ROOT_COSTS).length === 6, '六种灵根均有花费');
  assert(ORIGINS.some((o) => o.pill), '存在带赠丹的出身');
  assert(Object.keys(TECHNIQUES).length >= 50, `功法库至少 50 门（当前 ${Object.keys(TECHNIQUES).length} 门）`);
  assert(SECTS.length >= 8, `宗门至少 8 个（当前 ${SECTS.length}）`);

  console.log('· 文本工具（占位符 / 高亮 / 纪年）');
  assert(fill('{a}与{b}', { a: '甲', b: '乙' }) === '甲与乙', '占位符填充');
  assert(fill('{a}', {}) === '{a}', '未提供的占位符原样保留');
  assert(plain(fill('窗口只开«三年»')) === '窗口只开三年', '高亮标记正确剥离/渲染');
  assert(eraYear(102) === '玄启102年', '纪年格式');
  assert(yearOfAge(16) === START_YEAR, '16 岁对应开局纪年');
  assert(PLACES.length >= 20, `地点池至少 20 处（当前 ${PLACES.length}）`);

  console.log('· 开局流程（剧本→角色设定→天赋加点→宗门）');
  const fresh = await createCharacter(io);
  assert(fresh.player.name.length > 0, '开局角色姓名合法');
  assert(fresh.player.sect === SECTS[0].name, '默认选第一个宗门');
  assert(fresh.player.cheatBonus >= 1, '角色设定修炼倍率已生效');
  assert(fresh.player.aptitude === 1.0, '默认资质 ×1.0');
  assert(fresh.player.root === '三灵根', '默认灵根三灵根');
  assert(fresh.year === START_YEAR, '开局世界纪年为玄启起始年');
  assert(fresh.player.biography.length >= 1, '开局写入首笔大事记');

  io.queue = ['', '1', '1', '0', '9']; // 姓名/剧本/角色设定默认 → 加点完成 → 宗门第 9 个（血煞魔宗）
  const magicFresh = await createCharacter(io);
  assert(magicFresh.player.sect === '血煞魔宗', '开局可拜入魔道宗门（全门派可选）');

  console.log('· 主线节点库结构');
  {
    const ids = new Set<string>();
    let dup = false;
    for (const n of STORY_NODES) {
      if (ids.has(n.id)) dup = true;
      ids.add(n.id);
    }
    assert(!dup, '剧情节点 id 全局唯一');
    for (const s of SCENARIOS) {
      const nodes = STORY_NODES.filter((n) => n.scenario === s.name);
      assert(nodes.length >= 10, `剧本「${s.name}」至少 10 个节点（当前 ${nodes.length}）`);
      assert(nodes.some((n) => n.minRealm === 8), `剧本「${s.name}」有渡劫期终章节点`);
      assert(nodes.some((n) => n.maxAge !== undefined || n.maxRealm !== undefined), `剧本「${s.name}」有可错过的窗口节点`);
    }
    const windowed = STORY_NODES.filter((n) => n.maxAge !== undefined || n.maxRealm !== undefined);
    assert(windowed.every((n) => (n.missText?.length ?? 0) > 0), '所有窗口节点均配错过反馈文案');
    const shared = STORY_NODES.filter((n) => !n.scenario);
    assert(shared.length >= 5, `共用系统节点至少 5 个（当前 ${shared.length}）`);
    assert(shared.some((n) => typeof n.when === 'function'), '存在 when 系统条件节点（系统进入叙事）');
  }
  assert(Object.keys(SCENARIO_HEROINES).length === 4, '四剧本各有一位专属女主');
  assert(Object.keys(PERSONALITY_MODS).length === 8, '八种性格均有数值');

  console.log('· 主线调度（到龄触发 / 女主登场 / flag 落盘）');
  fresh.player.age = 18;
  const fired = await maybeTriggerStory(fresh, io);
  assert(fired === true, '到龄触发主线节点');
  assert(fresh.player.storyDone.includes('凡骨·骨片初鸣'), '触发节点记入 storyDone');
  assert((fresh.player.flags['骨片'] ?? 0) >= 1, '节点效果写入 flag');
  fresh.player.age = 20;
  const fired2 = await maybeTriggerStory(fresh, io);
  assert(fired2 === true, '女主邂逅节点触发');
  assert(fresh.leads.length === 1 && fresh.leads[0].name === '苏婉清', '专属女主苏婉清登场');
  assert((fresh.player.flags['归乡之诺'] ?? 0) >= 1, '默认选择「许诺」写入 flag');
  assert(fresh.player.biography.some((l) => l.includes('骨片')), '主线大事记入传');

  console.log('· 主线战斗分支（flag 前置）');
  const combatP = createPlayer('测试', ORIGINS[0], SECTS[0]);
  combatP.scenario = '世家贵子';
  combatP.flags = { 血仇: 1 };
  combatP.storyDone = ['世家·噩耗', '世家·仇家之女', '世家·密账'];
  combatP.age = 40;
  combatP.realmIdx = 2;
  io.answer = '1';
  const firedC = await maybeTriggerStory({ player: combatP, leads: [], year: 126 }, io);
  io.answer = null;
  assert(firedC === true, '战斗分支主线可触发');
  assert(combatP.storyDone.includes('世家·上门'), '战斗节点完成记入 storyDone');

  console.log('· 抉择分歧（魔道 / 渡魔 互斥路线）');
  const forkP = createPlayer('测试', ORIGINS[0], SECTS[0]);
  forkP.scenario = '魔星降世';
  forkP.age = 40;
  forkP.realmIdx = 2;
  forkP.storyDone = ['魔星·月圆之夜', '魔星·妖女', '魔星·旧魔洞窟', '魔星·昭衡司'];
  io.queue = ['2']; // 十字路口 → 渡魔
  await maybeTriggerStory({ player: forkP, leads: [], year: 126 }, io);
  assert((forkP.flags['渡魔'] ?? 0) === 1, '选择「渡魔」写入 flag');
  assert((forkP.flags['魔道'] ?? 0) === 0, '未选路线不置 flag');
  forkP.realmIdx = 3;
  io.queue = ['1'];
  await maybeTriggerStory({ player: forkP, leads: [], year: 130 }, io);
  assert(forkP.storyDone.includes('魔星·自证之路'), '渡魔线走「自证之路」');
  assert(!forkP.storyDone.includes('魔星·魔道扬名'), '魔道线节点不触发（require 拦截）');

  console.log('· 错过机制（境界冲过窗口 → 永久错过 + 反馈）');
  const missP = createPlayer('测试', ORIGINS[0], SECTS[0]);
  missP.scenario = '天命凡骨';
  missP.age = 30;
  missP.realmIdx = 3; // 荒涧古府窗口为筑基~结丹（maxRealm 2），刚刚冲过
  missP.storyDone = ['凡骨·骨片初鸣', '凡骨·婉清相送'];
  await maybeTriggerStory({ player: missP, leads: [], year: 116 }, io);
  assert(missP.storyMissed.includes('凡骨·荒涧古府'), '冲过境界窗即永久错过');
  assert(missP.biography.some((l) => l.includes('错过')), '错过写入大事记');

  console.log('· 世界纪事（周期事件 / 一次性大事错过）');
  {
    assert(new Set(WORLD_EVENTS.map((e) => e.id)).size === WORLD_EVENTS.length, '世界大事 id 唯一');
    assert(WORLD_EVENTS.some((e) => e.every), '存在周期性大事');
    assert(WORLD_EVENTS.filter((e) => !e.every).every((e) => (e.missText?.length ?? 0) > 0), '一次性大事均配错过反馈');
    const nw = nextWorldEvent(START_YEAR, p);
    assert(nw !== null && nw.year >= START_YEAR, '可计算下一桩世界大事');

    const wP = createPlayer('测试', ORIGINS[0], SECTS[0]);
    const wState: GameState = { player: wP, leads: [], year: 105 };
    io.queue = ['n']; // 英杰会：只看热闹
    await worldTick(wState, io);
    io.queue = [];
    const w2 = createPlayer('测试', ORIGINS[0], SECTS[0]);
    const w2State: GameState = { player: w2, leads: [], year: 125 }; // 魔乱窗口 120-124，刚关窗
    io.queue = ['n']; // 顺带的英杰会
    await worldTick(w2State, io);
    io.queue = [];
    assert(w2.worldSeen.includes('魔乱'), '一次性大事关窗后归档');
    assert(w2.biography.some((l) => l.includes('错过')), '世界大事错过写入大事记');
  }

  console.log('· 传音投递（条件触发 → 延迟送达）');
  {
    assert(new Set(LETTERS.map((l) => l.id)).size === LETTERS.length, '传音 id 唯一');
    const lP = createPlayer('测试', ORIGINS[0], SECTS[0]);
    const lLead = makeLead(lP, 70);
    const lState: GameState = { player: lP, leads: [lLead], year: 301 };
    for (let y = 0; y < 4; y++) {
      lState.year = 301 + y;
      await worldTick(lState, io);
    }
    assert(lP.lettersSent.length >= 1, `好感达标应有传音送达（实际 ${lP.lettersSent.length} 封）`);
    assert(lP.lettersSent.every((id) => !lP.pendingLetters.some((x) => x.id === id)), '已送达传音不再挂起');
  }

  console.log('· 对白矩阵（8 性格 × 场景查表）');
  for (const per of PERSONALITIES) {
    const d = DIALOGUE[per];
    assert(!!d, `性格「${per}」有对白集`);
    if (!d) continue;
    assert(d.greet.length > 0 && d.talk.length > 0 && d.debate.length > 0, `「${per}」互动对白齐全`);
    assert(d.m40.length > 0 && d.m70.length > 0 && d.dao.length > 0, `「${per}」里程碑与结缘对白齐全`);
    assert(d.meet.length > 0 && d.reunion.length > 0 && d.letterOpen.length > 0 && d.rescued.length > 0, `「${per}」邂逅/重逢/来信/获救对白齐全`);
  }

  console.log('· 宗门系统（拜入/捐献/晋升/叛出/追杀）');
  const sectP = createPlayer('测试', ORIGINS[0], SECTS[0]); // 散修
  sectP.spirit = 2000;
  const sectState: GameState = { player: sectP, leads: [], year: 200 };
  io.queue = ['1', '1']; // 散修菜单选「拜入」，列表选第 1 个（丹霞谷）
  await sectMenu(sectState, io);
  assert(sectP.sect === '丹霞谷', '拜入丹霞谷');
  assert(sectP.skills.includes('炼丹'), '入宗即通炼丹');
  assert(sectP.spirit === 1700, '缴纳拜师费 300');
  assert(sectP.sectRank === 0 && sectP.sectContribution === 0, '新入宗门从外门做起');
  io.queue = ['2', '1000']; // 捐献 1000 灵石 → 100 贡献
  await sectMenu(sectState, io);
  assert(sectP.sectContribution === 100, '捐献灵石获得贡献');
  assert(sectP.spirit === 700, '捐献扣除灵石');
  io.queue = ['3']; // 修为不足（炼气）→ 晋升被拒
  await sectMenu(sectState, io);
  assert(sectP.sectRank === 0 && sectP.sectContribution === 100, '修为不足不得晋升');
  sectP.realmIdx = 2; // 结丹
  io.queue = ['3', 'y']; // 晋升考核 → 挑战守关师兄
  await sectMenu(sectState, io);
  assert([0, 1].includes(sectP.sectRank), '晋升考核可执行');
  assert(sectP.sectContribution === 100 || sectP.sectContribution === 0, '晋升后贡献结算合理');
  io.queue = ['9', '2']; // 叛出 → 强行叛逃
  await sectMenu(sectState, io);
  assert(sectP.sect === '散修', '叛出转散修');
  assert(sectP.betrayedSect === '丹霞谷' && sectP.betrayYears === 15, '被旧宗追杀 15 年');
  assert(sectP.sectRank === 0 && sectP.sectContribution === 0, '叛出后职阶贡献清零');
  io.queue = ['1', '9']; // 散修菜单「拜入」→ 选第 9 个（合欢宗，需道侣）
  await sectMenu(sectState, io);
  assert(sectP.sect === '散修', '无道侣不得入合欢宗');
  sectState.leads = [makeLead(sectP)]; // 仅结识红颜（非道侣）
  io.queue = ['1', '9'];
  await sectMenu(sectState, io);
  assert(sectP.sect === '散修', '仅结识红颜（非道侣）不得入合欢宗');
  const hhLead = makeLead(sectP);
  hhLead.dao = true;
  sectState.leads = [hhLead];
  io.queue = ['1', '9'];
  await sectMenu(sectState, io);
  assert(sectP.sect === '合欢宗', '有道侣方可入合欢宗');

  console.log('· 宗门任务（三层文案 / 冷却 / 境界窗 / 失败代价）');
  assert(SECT_TASKS.length >= 12, `任务库至少 12 条（当前 ${SECT_TASKS.length}）`);
  assert(SECT_TASKS.every((t) => t.world.length > 0 && t.say.length > 0 && t.step.length > 0), '任务三层文案齐全');
  assert(SECT_TASKS.every((t) => t.cd >= 1), '任务均有冷却');
  assert(SECT_TASKS.some((t) => t.realmMax !== undefined), '存在境界上限任务（高境界自动下架）');
  assert(SECT_TASKS.some((t) => t.realmMin !== undefined), '存在境界下限任务');
  assert(new Set(SECT_TASKS.map((t) => t.id)).size === SECT_TASKS.length, '任务 id 唯一');
  const tkP = createPlayer('测试', ORIGINS[0], SECTS[1]); // 丹霞谷
  const tkState: GameState = { player: tkP, leads: [], year: 200 };
  io.queue = ['1', '11']; // 接任务 → 巡山（简单·巡逻，炼气期第 11 项）
  const tkFired = await sectMenu(tkState, io);
  assert(tkFired === true, '巡逻任务消耗一年');
  assert(tkP.sectContribution === 15, `炼气巡逻贡献 +15（实际 ${tkP.sectContribution}）`);
  assert((tkP.taskCd['巡山'] ?? 0) > tkState.year, '任务完成进入冷却');
  io.queue = ['1', '11', '0', '0']; // 冷却中重选同一任务应被拒（此时 11 为守灵田…选中巡山需 10）
  tkP.realmIdx = 3; // 元婴：低阶杂役下架，贡献 ×2.5
  tkP.sectContribution = 0;
  io.queue = ['1', '11'];
  await sectMenu(tkState, io);
  assert(tkP.sectContribution === 38, `元婴守灵田贡献 +38（实际 ${tkP.sectContribution}）`);
  tkP.realmIdx = 0;
  tkP.sectContribution = 50;
  io.queue = ['1', '1']; // 剿妖王（困难·敌人更强，败则扣贡献）
  await sectMenu(tkState, io);
  assert((tkP.taskCd['剿妖王'] ?? 0) > tkState.year, '战斗任务执行后进入冷却（胜败皆然）');
  assert(tkP.sectContribution >= 0, '贡献不为负');
  tkP.pills['聚灵丹'] = 0;
  tkP.sectContribution = 0;
  io.queue = ['1', '7', 'y', '0', '0']; // 上交聚灵丹（无丹→提示返回）
  const tkNoFire = await sectMenu(tkState, io);
  assert(tkNoFire === false, '材料不足不消耗时间');
  assert(tkP.sectContribution === 0, '未完成不增贡献');

  console.log('· 职阶放大宗门效果');
  const atkP = createPlayer('测试', ORIGINS[0], SECTS[6]); // 太乙剑宗
  const atk0 = playerAttack(atkP);
  atkP.sectRank = 3; // 长老：宗门效果 ×2
  const atk3 = playerAttack(atkP);
  assert(atk3 > atk0, '长老职阶放大宗门攻击加成');

  console.log('· 宗门大比（按世界纪年 3 年一届）');
  const tP = createPlayer('测试', ORIGINS[0], SECTS[1]); // 丹霞谷
  tP.sectRank = 1; // 内门
  const tState: GameState = { player: tP, leads: [], year: 102 }; // 102 % 3 === 0，开榜之年
  const tBefore = tP.sectContribution;
  io.queue = ['4'];
  const tFired = await sectMenu(tState, io);
  assert(tFired === true, '大比消耗一年');
  assert(tP.sectContribution > tBefore, '大比获得贡献');
  const tState2: GameState = { player: tP, leads: [], year: 103 }; // 非开榜之年
  io.queue = ['4', '0'];
  const tFired2 = await sectMenu(tState2, io);
  assert(tFired2 === false, '非开榜之年不可参赛');

  console.log('· 挑战宗主');
  const mP = createPlayer('测试', ORIGINS[0], SECTS[1]); // 丹霞谷
  mP.sectRank = 3; // 长老
  mP.sectContribution = 600;
  const mState: GameState = { player: mP, leads: [], year: 200 };
  io.queue = ['5', 'y'];
  await sectMenu(mState, io);
  assert(mP.sectMaster === true || mP.sectMaster === false, '宗主挑战可执行');
  assert([0, 600].includes(mP.sectContribution), '宗主挑战贡献结算合理');

  console.log('· 宗主年俸与宗门战争');
  const wP = createPlayer('测试', ORIGINS[0], SECTS[1]); // 丹霞谷
  wP.sectMaster = true;
  const wState: GameState = { player: wP, leads: [], year: 200 };
  const salBefore = wP.spirit;
  sectYearEnd(wP, io);
  assert(wP.spirit === salBefore + 100, '宗主每年领俸禄 100');
  io.queue = ['6', '1', 'y']; // 宣战 → 目标 1 → 确定
  const warFired = await sectMenu(wState, io);
  assert(warFired === true, '宗门战争可执行');

  console.log('· 宗门宝库（藏经阁/聚宝仙楼）');
  const shopP = createPlayer('测试', ORIGINS[0], SECTS[1]); // 丹霞谷
  shopP.sectContribution = 1000;
  const shopState: GameState = { player: shopP, leads: [], year: 200 };
  io.queue = ['7', '1', '1', '0']; // 宝库 → 藏经阁 → 第1个（镇宗功法 青木养气诀）
  await sectMenu(shopState, io);
  assert(shopP.technique === '基础吐纳术', '购功不自动改修');
  assert((shopP.techProficiency['青木养气诀'] ?? -1) >= 0, '购得功法入库');
  assert(shopP.sectContribution === 400, '镇宗功法扣 600 贡献');
  assert(shopP.lifespan === 115, '养寿功法寿元 +15');
  io.queue = ['7', '1', '2', '0']; // 第2个（青灵诀 50）
  await sectMenu(shopState, io);
  assert((shopP.techProficiency['青灵诀'] ?? -1) >= 0, '藏经阁兑换通用功法入库');
  assert(shopP.sectContribution === 350, '通用功法扣 50 贡献');
  shopP.sectMaster = true;
  io.queue = ['7', '1', '3', '0']; // 第3个（玄霜诀）宗主免单
  await sectMenu(shopState, io);
  assert((shopP.techProficiency['玄霜诀'] ?? -1) >= 0, '宗主宝库免单兑换功法');
  assert(shopP.sectContribution === 350, '宗主兑换不扣贡献');
  assert(switchTechnique(shopP, '青木养气诀') === true, '可手动切换主修');
  assert(shopP.technique === '青木养气诀', '切换主修成功');

  console.log('· 修炼');
  const g = cultivate(p);
  assert(g > 0, 'cultivate 修为增长为正');
  assert(p.cultivation >= 0 && p.cultivation <= 100, 'cultivation 在 [0,100]');

  console.log('· 灵石温养（灵石换修炼加速）');
  const warmP = createPlayer('测试', ORIGINS[0], SECTS[0]);
  warmP.cultivation = 0;
  const gBase = cultivate(warmP);
  warmP.cultivation = 0;
  warmP.spiritWarm = 5;
  const gWarm = cultivate(warmP);
  assert(gWarm > gBase, '灵石温养提高修炼效率');
  assert((warmP.spiritWarm ?? 0) === 4, '温养年限随闭关逐年递减');

  console.log('· 功法熟练度与残篇');
  const profP = createPlayer('测试', ORIGINS[0], SECTS[0]);
  const profBefore = profP.techProficiency['基础吐纳术'] ?? 0;
  cultivate(profP);
  assert((profP.techProficiency['基础吐纳术'] ?? 0) > profBefore, '闭关提升功法熟练度');
  profP.techProficiency['基础吐纳术'] = 29;
  assert(techLevelName(profP) === '入门', '熟练度 29 为入门');
  profP.techProficiency['基础吐纳术'] = 30;
  assert(techLevelName(profP) === '小成', '熟练度 30 为小成');

  const fragP = createPlayer('测试', ORIGINS[0], SECTS[0]);
  fragP.fragments['玄霜诀'] = 3;
  const fragState: GameState = { player: fragP, leads: [], year: 200 };
  io.queue = ['1'];
  const comprehended = await comprehendFragments(fragState, io);
  assert(comprehended === true, '残篇参悟补全功法');
  assert(fragP.technique === '基础吐纳术', '补全功法不自动改修');
  assert((fragP.techProficiency['玄霜诀'] ?? 0) === 30, '补全功法熟练度 30（小成）');
  assert(switchTechnique(fragP, '玄霜诀') === true, '可手动切换主修');
  assert(fragP.technique === '玄霜诀', '切换主修成功');
  fragP.fragments['无名残篇'] = 1;
  io.queue = ['1'];
  await comprehendFragments(fragState, io);
  assert((fragP.techProficiency['玄霜诀'] ?? 0) === 40, '无名残篇提升当前功法熟练度 +10');

  console.log('· 神通（功法附带）');
  const spellP = createPlayer('测试', ORIGINS[0], SECTS[0]);
  assert(spellP.spells.length === 0, '基础吐纳术无神通');
  learnTechnique(spellP, '青灵诀');
  assert(spellP.spells.includes('回春术'), '修习青灵诀习得回春术');
  learnTechnique(spellP, '青霄剑诀');
  assert(spellP.spells.includes('御剑术') && spellP.spells.includes('剑气纵横'), '镇宗功法附带双神通');

  console.log('· 功法品阶显示与主修升级');
  assert(!techniqueSummary('基础吐纳术').includes('灵品') && !techniqueSummary('基础吐纳术').includes('undefined'), '凡品功法无误标品阶');
  assert(techniqueSummary('青霄剑诀').startsWith('灵品·'), '灵品功法显示「灵品·」');
  assert(techniqueSummary('太虚引星诀').startsWith('仙品·'), '仙品功法显示「仙品·」');
  assert(!techniqueSummary('太虚引星诀').includes('undefined'), '仙品功法无 undefined');
  const upP = createPlayer('测试', ORIGINS[0], SECTS[0]);
  assert(upgradeTechnique(upP) === '青灵诀', '主修功法按 TECH_ORDER 升级');
  assert((upP.techProficiency['青灵诀'] ?? -1) >= 0, '升级功法入库');
  learnTechnique(spellP, '御风诀');
  assert(spellP.spells.includes('土遁术'), '御风诀附带土遁术（逃脱神通可达）');

  console.log('· 战斗神通');
  const cspellP = createPlayer('测试', ORIGINS[0], SECTS[0]);
  learnTechnique(cspellP, '青灵诀');
  io.queue = ['1', '1']; // 施法（主输出）→ 施展第 1 个（回春术）
  const spResult = await combat(cspellP, [], io);
  assert(['win', 'lose', 'escape'].includes(spResult), '战斗神通不报错');

  console.log('· 法宝装备化与功法防御');
  const eqP = createPlayer('测试', ORIGINS[0], SECTS[0]);
  const defBase = playerDefense(eqP);
  eqP.treasure = '太虚剑';
  assert(playerDefense(eqP) > defBase, '法宝提供防御加成');
  eqP.treasure = '无';
  learnTechnique(eqP, '玄龟甲功');
  switchTechnique(eqP, '玄龟甲功');
  assert(playerDefense(eqP) > defBase, '功法提供防御加成');
  assert(TREASURES['太虚剑'].atk === 90 && TREASURES['太虚剑'].def === 15, '法宝属性含攻防');

  console.log('· 突破（多次，检查境界下标不越界）');
  for (let i = 0; i < 10; i++) {
    if (p.realmIdx === REALMS.length - 1 && p.stageIdx === REALMS[p.realmIdx].stages.length - 1) break;
    p.cultivation = 100;
    await breakthrough(p, state.leads, io);
    assert(p.realmIdx >= 0 && p.realmIdx < REALMS.length, 'realmIdx 越界');
    assert(p.stageIdx >= 0 && p.stageIdx < REALMS[p.realmIdx].stages.length, 'stageIdx 越界');
    assert(p.cultivation <= 100 && p.cultivation >= 0, '突破后修为范围合法');
  }
  assert(p.biography.some((l) => l.includes('突破')) || p.realmIdx === 0, '大境界突破写入大事记');

  console.log('· 战斗（Mock 默认攻击，应有限回合内分出胜负）');
  const cr = await combat(p, state.leads, io);
  assert(['win', 'lose', 'escape'].includes(cr), 'combat 正常结算');

  console.log('· 游历（20 次，随机分支不抛错）');
  for (let i = 0; i < 20; i++) {
    await explore(state, io);
  }
  assert(state.leads.length <= 5, '女主数量不超过 5');

  console.log('· 游历事件表');
  assert(EVENTS.length >= 50, `事件数量 >= 50（当前 ${EVENTS.length}）`);
  assert(SKILLS.length === 4, '四艺技能齐全');

  console.log('· 坊市 / 四艺 / 红颜（应干净退出）');
  await market(p, io);
  await alchemy(p, io);
  await forge(p, io);
  await formation(p, io);
  await talisman(p, io);
  await romance(p, state.leads, io);

  console.log('· 双修（道侣专属）');
  const dP = createPlayer('测试', ORIGINS[0], SECTS[0]);
  const dLead = makeLead(dP);
  dLead.realmIdx = dP.realmIdx; // 同境界，双修收益为基准 16
  dLead.dao = true;
  dLead.favor = 50;
  const dState: GameState = { player: dP, leads: [dLead], year: 200 };
  dP.cultivation = 0;
  io.queue = ['1', '4', '', '0']; // 拜访第 1 位 → 双修 → 回车 → 返回
  await romance(dP, dState.leads, io);
  assert(dP.cultivation === 16, '双修修为 +16（论道两倍）');
  assert(dLead.favor > 50, '双修提升好感');

  console.log('· 拜访耗时（论道/双修不再一年内刷满修为）');
  const rP = createPlayer('测试', ORIGINS[0], SECTS[0]);
  const rLead = makeLead(rP, 60);
  rLead.realmIdx = rP.realmIdx;
  rLead.stageIdx = rP.stageIdx;
  rP.cultivation = 0;
  io.queue = ['1', '2', '2', '2', '0', '0']; // 拜访第 1 位 → 论道 ×3 → 退出拜访 → 退出红颜
  const rYears = await romance(rP, [rLead], io);
  assert(rYears === 3, `论道 3 次应耗时 3 年（实际 ${rYears}）`);
  assert(rP.cultivation === 24, `论道 3 次修为 +24（实际 ${rP.cultivation}）`);
  assert(rLead.seen?.['m40'] === true, '好感 40 里程碑小剧情已触发（仅一次）');

  const talkP = createPlayer('测试', ORIGINS[0], SECTS[0]);
  const talkLead = makeLead(talkP, 20);
  io.queue = ['1', '1', '1', '0', '0']; // 交谈 ×2
  assert((await romance(talkP, [talkLead], io)) === 2, '交谈 2 次耗时 2 年');
  io.queue = ['0']; // 只看不动手
  assert((await romance(talkP, [talkLead], io)) === 0, '未互动则不耗时');

  console.log('· 论道/双修收益随境界难度缩放');
  const lateP = createPlayer('测试', ORIGINS[0], SECTS[0]);
  lateP.realmIdx = REALMS.length - 1; // 渡劫期
  lateP.stageIdx = 0;
  lateP.cultivation = 0;
  const lateLead = makeLead(lateP, 90);
  lateLead.realmIdx = lateP.realmIdx;
  lateLead.stageIdx = lateP.stageIdx;
  lateLead.dao = true;
  io.queue = ['1', '4', '0', '0'];
  await romance(lateP, [lateLead], io);
  assert(
    lateP.cultivation > 0 && lateP.cultivation < 16,
    `渡劫期双修收益应低于炼气期的 16（实际 ${lateP.cultivation}）`,
  );

  console.log('· 主菜单编号固定（红颜登场不挤动突破境界）');
  const menuIO = new MockIO();
  const menuState: GameState = { player: createPlayer('测试', ORIGINS[0], SECTS[0]), leads: [], year: START_YEAR };
  await mainMenu(menuState, menuIO);
  const noLeadMenu = menuIO.log.join('\n');
  menuIO.log = [];
  menuState.leads = [makeLead(menuState.player, 20)];
  await mainMenu(menuState, menuIO);
  const withLeadMenu = menuIO.log.join('\n');
  assert(noLeadMenu.includes('7) 突破境界'), '无红颜时「突破境界」为 7)');
  assert(withLeadMenu.includes('7) 突破境界'), '有红颜时「突破境界」仍为 7)');
  assert(noLeadMenu.includes('6) 拜访红颜'), '无红颜时「拜访红颜」仍占 6) 并置灰');
  assert(withLeadMenu.includes('6) 拜访红颜'), '有红颜时「拜访红颜」为 6)');
  assert(noLeadMenu.includes('玄启'), '状态栏显示世界纪年');

  console.log('· 邂逅红颜初始好感与旁白相称');
  assert(makeLead(p).favor === 0, 'makeLead 默认好感 0');
  assert(makeLead(p, 30).favor === 30, 'makeLead 可指定初始好感');
  assert(makeLead(p, 150).favor === 100, '初始好感封顶 100');
  const metState: GameState = { player: createPlayer('测试', ORIGINS[0], SECTS[0]), leads: [], year: 200 };
  for (let i = 0; i < 120 && metState.leads.length < 3; i++) await explore(metState, io);
  assert(metState.leads.length > 0, '百余次游历应至少邂逅一位红颜');
  assert(metState.leads.every((l) => l.favor > 0), '游历邂逅的红颜初始好感 > 0（与「颇有兴致」相称）');

  console.log('· 服用丹药');
  p.pills['凝气丹'] = 5;
  io.answer = '1';
  await takePill(p, io);
  io.answer = null;
  assert(p.pills['凝气丹'] === 4, '服用丹药扣减');

  console.log('· 服用丹药分类（修复：历练所得丹药可见）');
  const pillP = createPlayer('测试', ORIGINS[0], SECTS[0]);
  pillP.pills['疗伤丹'] = 2;
  pillP.pills['筑基丹'] = 1;
  io.log = [];
  await takePill(pillP, io);
  assert(io.log.some((l) => l.includes('疗伤丹') && l.includes('战斗中使用')), '疗伤丹标注战斗中使用');
  assert(io.log.some((l) => l.includes('筑基丹') && l.includes('突破时使用')), '突破丹标注突破时使用');
  pillP.pills['凝气丹'] = 3;
  pillP.cultivation = 0;
  io.answer = '1';
  await takePill(pillP, io);
  io.answer = null;
  assert(pillP.pills['凝气丹'] === 2, '修为丹可正常服用');
  assert(pillP.cultivation === 40, '炼气期凝气丹 +40 修为');

  console.log('· 丹毒系统');
  const toxP = createPlayer('测试', ORIGINS[0], SECTS[0]);
  toxP.pills['凝气丹'] = 2;
  toxP.cultivation = 0;
  io.answer = '1';
  await takePill(toxP, io);
  io.answer = null;
  assert(toxP.pillToxin === 8, '服修为丹累积丹毒（20% 修为量）');
  toxP.pills['凝气丹'] = 0;
  toxP.pillToxin = 50;
  toxP.pills['净元丹'] = 1;
  io.answer = '1';
  await takePill(toxP, io);
  io.answer = null;
  assert(toxP.pillToxin === 20, '净元丹清除 30 丹毒');
  toxP.pillToxin = 29;
  assert(toxinPenalty(toxP) === 1, '丹毒 29 无碍');
  toxP.pillToxin = 30;
  assert(toxinPenalty(toxP) === 0.9, '丹毒 30 起效');
  const tp = createPlayer('测试', ORIGINS[0], SECTS[0]);
  tp.cultivation = 0;
  const g0 = cultivate(tp);
  tp.cultivation = 0;
  tp.pillToxin = 95;
  const g1 = cultivate(tp);
  assert(g1 < g0, '丹毒降低修炼效率');

  console.log('· 丹毒剧情节点（系统进入叙事）');
  const toxStoryP = createPlayer('测试', ORIGINS[0], SECTS[0]);
  toxStoryP.pillToxin = 70;
  io.queue = ['2']; // 散财延医
  await maybeTriggerStory({ player: toxStoryP, leads: [], year: 110 }, io);
  assert(toxStoryP.storyDone.includes('共·丹毒噬体'), '丹毒 ≥60 触发走火剧情');
  assert(toxStoryP.pillToxin < 70, '走火剧情可解丹毒');

  console.log('· 女主生成与描述');
  const lead = makeLead(p);
  assert(lead.name.length >= 2, '女主姓名合法');
  assert(leadDescription(lead).includes(lead.name), '女主描述包含姓名');

  console.log('· 女主境界可高于主角');
  const hiP = createPlayer('测试', ORIGINS[0], SECTS[0]); // 炼气期
  let sawHigher = false;
  for (let i = 0; i < 200; i++) {
    const l = makeLead(hiP);
    assert(l.realmIdx >= 0 && l.realmIdx <= REALMS.length - 1, '女主境界不越界（可至渡劫）');
    if (l.realmIdx > hiP.realmIdx) sawHigher = true;
  }
  assert(sawHigher, '女主境界可高于主角');

  console.log('· 红颜修为成长');
  const growLead = makeLead(p);
  const growLeads: FemaleLead[] = [growLead];
  for (let i = 0; i < 50; i++) advanceLeads(growLeads, REALMS.length - 2);
  assert(
    growLead.realm === REALMS[growLead.realmIdx].name + REALMS[growLead.realmIdx].stages[growLead.stageIdx],
    '红颜境界字符串与下标一致',
  );
  assert(growLead.realmIdx <= REALMS.length - 1, '红颜境界不越界（可至渡劫）');
  const capLead = makeLead(p);
  capLead.realmIdx = 3;
  const capLeads: FemaleLead[] = [capLead];
  for (let i = 0; i < 500; i++) advanceLeads(capLeads, 3);
  assert(capLead.realmIdx <= 5, '红颜最多领先主角两阶（封顶 +2）');

  console.log('· 渡劫飞升（有渡劫丹与道侣共渡必成功 + 结局收束）');
  p.realmIdx = REALMS.length - 1;
  p.stageIdx = REALMS[p.realmIdx].stages.length - 1;
  p.pills['渡劫丹'] = 1;
  const daoLead = makeLead(p);
  daoLead.dao = true;
  p.daoCompanion = daoLead.name;
  io.log = [];
  const won = await ascend({ player: p, leads: [daoLead], year: 400 }, io);
  assert(won === true, '持渡劫丹与道侣共渡，飞升应成功');
  assert(p.biography.some((l) => l.includes('飞升')), '飞升写入大事记');
  assert(io.log.some((l) => l.includes('人生大事记')), '结局输出人生大事记（立传）');

  if (failures === 0) {
    console.log('\n✅ 全部通过（最终境界：' + playerTitle(p) + '）');
  } else {
    console.log(`\n❌ ${failures} 项失败`);
    process.exitCode = 1;
  }
}

main();
