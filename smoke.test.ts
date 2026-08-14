// 核心逻辑回归测试：用 MockIO 驱动，验证无运行时错误且状态自洽。
// 运行：npm test

import type { GameIO } from './src/io.js';
import type { GameState, FemaleLead } from './src/types.js';
import { ORIGINS, SECTS, REALMS, SCENARIOS, GOLDEN_FINGERS, SKILLS, STORYLINES, SCENARIO_HEROINES, PERSONALITY_MODS, TECHNIQUES, learnTechnique, switchTechnique, techLevelName, toxinPenalty, playerAttack, playerTitle } from './src/content.js';
import { createPlayer, rollRoot, makeLead } from './src/core/character.js';
import { createCharacter } from './src/core/engine.js';
import { maybeTriggerStory } from './src/core/storyline.js';
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

async function main() {
  const io = new MockIO();
  const p = createPlayer('测试', ORIGINS[0], SECTS[0]);
  const state: GameState = { player: p, leads: [] };

  console.log('· 灵根与开局数据');
  const root = rollRoot();
  assert(root.mult > 0 && root.name.length > 0, 'rollRoot 返回合法');
  assert(ORIGINS.length === 16, '出身共 16 个（四剧本各 4 个）');
  assert(SCENARIOS.length === 4, '剧本共 4 个');
  for (const s of SCENARIOS) {
    assert(s.origins.length === 4, `剧本「${s.name}」有 4 条出身路线`);
    assert(s.origins.every((n) => ORIGINS.some((o) => o.name === n)), `剧本「${s.name}」出身引用有效`);
  }
  assert(GOLDEN_FINGERS.length >= 3, '金手指至少 3 个');
  assert(ORIGINS.some((o) => o.pill), '存在带赠丹的出身');
  assert(GOLDEN_FINGERS.every((g) => g.cheatBonus > 1), '金手指修炼倍率合法');
  assert(Object.keys(TECHNIQUES).length >= 50, `功法库至少 50 门（当前 ${Object.keys(TECHNIQUES).length} 门）`);
  assert(SECTS.length >= 8, `宗门至少 8 个（当前 ${SECTS.length}）`);

  console.log('· 开局流程（剧本→出身→灵根→金手指）');
  const fresh = await createCharacter(io);
  assert(fresh.player.name.length > 0, '开局角色姓名合法');
  assert(fresh.player.sect === SECTS[0].name, '默认选第一个宗门');
  assert(fresh.player.goldenFinger !== null, '金手指已选定');
  assert(fresh.player.cheatBonus > 1, '金手指修炼加成已生效');

  io.queue = ['', '1', '1', '9']; // 姓名/剧本/出身默认，宗门选第 9 个（血煞魔宗）
  const magicFresh = await createCharacter(io);
  assert(magicFresh.player.sect === '血煞魔宗', '开局可拜入魔道宗门（全门派可选）');

  console.log('· 主线事件链');
  assert(Object.keys(STORYLINES).length === 4, '四个剧本均有主线');
  for (const [name, beats] of Object.entries(STORYLINES)) {
    assert(beats.length >= 4, `剧本「${name}」主线事件至少 4 段`);
  }
  assert(Object.keys(SCENARIO_HEROINES).length === 4, '四剧本各有一位专属女主');
  assert(Object.keys(PERSONALITY_MODS).length === 8, '八种性格均有数值');
  fresh.player.age = 18;
  const fired = await maybeTriggerStory(fresh, io);
  assert(fired === true, '到龄触发主线事件');
  assert(fresh.player.storyStep === 1, '主线进度推进');

  console.log('· 专属女主邂逅');
  fresh.player.age = 20;
  const fired2 = await maybeTriggerStory(fresh, io);
  assert(fired2 === true, '女主邂逅节点触发');
  assert(fresh.leads.length === 1 && fresh.leads[0].name === '苏婉清', '专属女主苏婉清登场');
  assert(fresh.player.storyStep === 2, '邂逅后进度推进');

  console.log('· 主线战斗分支');
  const combatP = createPlayer('测试', ORIGINS[0], SECTS[0]);
  combatP.scenario = '世家贵子';
  combatP.storyStep = 2;   // 第三段：追查仇家（含战斗分支）
  combatP.age = 25;
  io.answer = '1';
  const firedC = await maybeTriggerStory({ player: combatP, leads: [] }, io);
  io.answer = null;
  assert(firedC === true, '战斗分支主线可触发');
  assert(combatP.storyStep === 3, '战斗后进度推进');

  console.log('· 宗门系统（拜入/捐献/晋升/叛出/追杀）');
  const sectP = createPlayer('测试', ORIGINS[0], SECTS[0]); // 散修
  sectP.spirit = 2000;
  const sectState: GameState = { player: sectP, leads: [] };
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
  io.queue = ['1', '9']; // 散修菜单「拜入」→ 选第 9 个（合欢宗，需红颜）
  await sectMenu(sectState, io);
  assert(sectP.sect === '散修', '无红颜不得入合欢宗');

  console.log('· 职阶放大宗门效果');
  const atkP = createPlayer('测试', ORIGINS[0], SECTS[6]); // 太乙剑宗
  const atk0 = playerAttack(atkP);
  atkP.sectRank = 3; // 长老：宗门效果 ×2
  const atk3 = playerAttack(atkP);
  assert(atk3 > atk0, '长老职阶放大宗门攻击加成');

  console.log('· 宗门大比（3 年一届）');
  const tP = createPlayer('测试', ORIGINS[0], SECTS[1]); // 丹霞谷
  tP.sectRank = 1; // 内门
  tP.age = 18;
  const tState: GameState = { player: tP, leads: [] };
  const tBefore = tP.sectContribution;
  io.queue = ['4'];
  const tFired = await sectMenu(tState, io);
  assert(tFired === true, '大比消耗一年');
  assert(tP.sectContribution > tBefore, '大比获得贡献');

  console.log('· 挑战宗主');
  const mP = createPlayer('测试', ORIGINS[0], SECTS[1]); // 丹霞谷
  mP.sectRank = 3; // 长老
  mP.sectContribution = 600;
  const mState: GameState = { player: mP, leads: [] };
  io.queue = ['5', 'y'];
  await sectMenu(mState, io);
  assert(mP.sectMaster === true || mP.sectMaster === false, '宗主挑战可执行');
  assert([0, 600].includes(mP.sectContribution), '宗主挑战贡献结算合理');

  console.log('· 宗主年俸与宗门战争');
  const wP = createPlayer('测试', ORIGINS[0], SECTS[1]); // 丹霞谷
  wP.sectMaster = true;
  const wState: GameState = { player: wP, leads: [] };
  const salBefore = wP.spirit;
  sectYearEnd(wP, io);
  assert(wP.spirit === salBefore + 100, '宗主每年领俸禄 100');
  io.queue = ['6', '1', 'y']; // 宣战 → 目标 1 → 确定
  const warFired = await sectMenu(wState, io);
  assert(warFired === true, '宗门战争可执行');

  console.log('· 宗门宝库（藏经阁/聚宝仙楼）');
  const shopP = createPlayer('测试', ORIGINS[0], SECTS[1]); // 丹霞谷
  shopP.sectContribution = 1000;
  const shopState: GameState = { player: shopP, leads: [] };
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
  const fragState: GameState = { player: fragP, leads: [] };
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

  console.log('· 战斗神通');
  const cspellP = createPlayer('测试', ORIGINS[0], SECTS[0]);
  learnTechnique(cspellP, '青灵诀');
  io.queue = ['6', '1']; // 选神通 → 施展第 1 个（回春术）
  const spResult = await combat(cspellP, [], io);
  assert(['win', 'lose', 'escape'].includes(spResult), '战斗神通不报错');

  console.log('· 突破（多次，检查境界下标不越界）');
  for (let i = 0; i < 10; i++) {
    if (p.realmIdx === REALMS.length - 1 && p.stageIdx === REALMS[p.realmIdx].stages.length - 1) break;
    p.cultivation = 100;
    await breakthrough(p, state.leads, io);
    assert(p.realmIdx >= 0 && p.realmIdx < REALMS.length, 'realmIdx 越界');
    assert(p.stageIdx >= 0 && p.stageIdx < REALMS[p.realmIdx].stages.length, 'stageIdx 越界');
    assert(p.cultivation <= 100 && p.cultivation >= 0, '突破后修为范围合法');
  }

  console.log('· 战斗（Mock 默认攻击，应有限回合内分出胜负）');
  const cr = await combat(p, state.leads, io);
  assert(['win', 'lose', 'escape'].includes(cr), 'combat 正常结算');

  console.log('· 游历（20 次，随机分支不抛错）');
  for (let i = 0; i < 20; i++) {
    await explore(state, io);
  }
  assert(state.leads.length <= 5, '女主数量不超过 5');

  console.log('· 游历事件表');
  assert(EVENTS.length >= 50, '事件数量 >= 50');
  assert(SKILLS.length === 4, '四艺技能齐全');

  console.log('· 坊市 / 四艺 / 红颜（应干净退出）');
  await market(p, io);
  await alchemy(p, io);
  await forge(p, io);
  await formation(p, io);
  await talisman(p, io);
  await romance(p, state.leads, io);

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
  assert(pillP.cultivation === 10, '炼气期凝气丹 +10 修为');

  console.log('· 丹毒系统');
  const toxP = createPlayer('测试', ORIGINS[0], SECTS[0]);
  toxP.pills['凝气丹'] = 2;
  toxP.cultivation = 0;
  io.answer = '1';
  await takePill(toxP, io);
  io.answer = null;
  assert(toxP.pillToxin === 2, '服修为丹累积丹毒（20% 修为量）');
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

  console.log('· 女主生成与描述');
  const lead = makeLead(p);
  assert(lead.name.length >= 2, '女主姓名合法');
  assert(leadDescription(lead).includes(lead.name), '女主描述包含姓名');

  console.log('· 红颜修为成长');
  const growLead = makeLead(p);
  const growLeads: FemaleLead[] = [growLead];
  for (let i = 0; i < 50; i++) advanceLeads(growLeads, REALMS.length - 2);
  assert(
    growLead.realm === REALMS[growLead.realmIdx].name + REALMS[growLead.realmIdx].stages[growLead.stageIdx],
    '红颜境界字符串与下标一致',
  );
  assert(growLead.realmIdx <= REALMS.length - 2, '红颜境界不越界');

  console.log('· 渡劫飞升（有渡劫丹与道侣共渡必成功）');
  p.realmIdx = REALMS.length - 1;
  p.stageIdx = REALMS[p.realmIdx].stages.length - 1;
  p.pills['渡劫丹'] = 1;
  const daoLead = makeLead(p);
  daoLead.dao = true;
  p.daoCompanion = daoLead.name;
  const won = await ascend(p, [daoLead], io);
  assert(won === true, '持渡劫丹与道侣共渡，飞升应成功');

  if (failures === 0) {
    console.log('\n✅ 全部通过（最终境界：' + playerTitle(p) + '）');
  } else {
    console.log(`\n❌ ${failures} 项失败`);
    process.exitCode = 1;
  }
}

main();
