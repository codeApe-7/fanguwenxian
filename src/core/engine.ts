// 游戏主循环与编排（依赖 GameIO 抽象，与终端/网页无关）。

import type { GameIO } from '../io.js';
import type { GameState, Player } from '../types.js';
import {
  REALMS, ORIGINS, SECTS, SCENARIOS, ARCHETYPES, ROOTS, ROOT_COSTS,
  TALENT_APTITUDES, TALENT_BODIES, TALENT_CHILDHOODS, TALENT_YOUTHS, SURNAMES,
  SECT_RANKS, SECT_RANK_NEED, TECHNIQUES,
  techLevelName, techPower, techPowerOf, switchTechnique, techniqueSummary,
  toxinPenalty, playerTitle, playerAttack, playerDefense, playerHp,
} from '../content.js';
import type { Talent, OriginDef } from '../content.js';
import { blue, bold, green, red, yellow, cyan, magenta, dim } from '../colors.js';
import { pick } from './rng.js';
import { createPlayer } from './character.js';
import { cultivate, breakthrough, ascend, takePill, comprehendFragments } from './cultivate.js';
import { explore } from './explore.js';
import { market } from './market.js';
import { alchemy, forge, formation, talisman } from './crafts.js';
import { romance, advanceLeads } from './romance.js';
import { sectMenu, sectYearEnd } from './sect.js';
import { maybeTriggerStory } from './storyline.js';
import { saveGame, hasSave } from '../store.js';

const W = 46;

function rule(ch: string, color = blue): string {
  return color(ch.repeat(W));
}

export async function intro(io: GameIO): Promise<'1' | '2' | '3'> {
  await io.clear();
  await io.narrate('凡人有疾，仙路无门。');
  await io.narrate('修仙一途，九死一生。');
  await io.narrate('你，一个再平凡不过的山野少年，能否逆天改命，飞升仙界？');
  io.print();
  io.print(bold('《凡骨问仙》· 终端文字冒险'));
  io.print(dim('─'.repeat(W)));
  while (true) {
    io.print(' 1) 开始新游戏');
    io.print(hasSave() ? ' 2) 继续存档' : ' 2) 继续存档（无存档）');
    io.print(' 3) 退出');
    const ch = await io.ask('选择：', ['1', '2', '3'], '1');
    if (ch === '2' && !hasSave()) {
      io.print(red('当前没有可继续的存档，请先开始新游戏。'));
      continue;
    }
    return ch as '1' | '2' | '3';
  }
}

// —— 加点辅助：从一组天赋中选择一项（0 返回 null） ——
async function pickTalent(io: GameIO, title: string, talents: Talent[]): Promise<Talent | null> {
  while (true) {
    io.print(cyan(`—— ${title} ——`));
    talents.forEach((t, i) => {
      const tag = t.cost === 0 ? dim('（免费）') : t.cost < 0 ? yellow(`（花费 ${-t.cost}）`) : green(`（返还 ${t.cost}）`);
      io.print(` ${i + 1}) ${t.name}：${t.desc}${tag}`);
    });
    io.print(' 0) 返回');
    const ch = await io.ask('选择：');
    if (ch === '0' || ch === '') return null;
    const idx = parseInt(ch, 10);
    if (isNaN(idx) || idx < 1 || idx > talents.length) {
      io.print(red('无效编号。'));
      continue;
    }
    return talents[idx - 1];
  }
}

async function pickOrigin(io: GameIO): Promise<OriginDef | null> {
  while (true) {
    io.print(cyan('—— 角色出生 ——'));
    ORIGINS.forEach((o, i) => {
      const tag = o.cost === 0 ? dim('（免费）') : o.cost < 0 ? yellow(`（花费 ${-o.cost}）`) : green(`（返还 ${o.cost}）`);
      io.print(` ${i + 1}) ${o.name}：${o.desc}${tag}`);
    });
    io.print(' 0) 返回');
    const ch = await io.ask('选择：');
    if (ch === '0' || ch === '') return null;
    const idx = parseInt(ch, 10);
    if (isNaN(idx) || idx < 1 || idx > ORIGINS.length) {
      io.print(red('无效编号。'));
      continue;
    }
    return ORIGINS[idx - 1];
  }
}

async function pickRoot(io: GameIO): Promise<string | null> {
  while (true) {
    io.print(cyan('—— 灵根 ——'));
    ROOTS.forEach((r, i) => {
      const cost = ROOT_COSTS[r.name] ?? 0;
      const tag = cost === 0 ? dim('（免费）') : cost < 0 ? yellow(`（花费 ${-cost}）`) : green(`（返还 ${cost}）`);
      io.print(` ${i + 1}) ${r.name}：修炼 ×${r.mult}${tag}`);
    });
    io.print(' 0) 返回');
    const ch = await io.ask('选择：');
    if (ch === '0' || ch === '') return null;
    const idx = parseInt(ch, 10);
    if (isNaN(idx) || idx < 1 || idx > ROOTS.length) {
      io.print(red('无效编号。'));
      continue;
    }
    return ROOTS[idx - 1].name;
  }
}

export async function createCharacter(io: GameIO): Promise<GameState> {
  await io.clear();
  await io.narrate('你，一个再平凡不过的山野少年，即将踏上逆天改命的仙途。');

  const name = await io.ask('请输入你的姓名（回车随机）：');
  const finalName = name || pick(SURNAMES) + pick(['凡', '风', '尘', '毅', '岳', '青', '远']);

  // —— 命运剧本（纯故事线，决定主线剧情） ——
  io.print('—— 选择你的命运剧本 ——');
  SCENARIOS.forEach((s, i) => io.print(` ${i + 1}) ${s.name}：${s.tagline}`));
  const sci = parseInt(await io.ask('选择剧本：', SCENARIOS.map((_, i) => String(i + 1)), '1'), 10) - 1;
  const scenario = SCENARIOS[sci];
  for (const line of scenario.intro) await io.narrate(line);

  // —— 角色设定（决定修炼倍率与天赋点预算） ——
  io.print('—— 选择你的角色设定 ——');
  ARCHETYPES.forEach((a, i) => io.print(` ${i + 1}) ${a.name}：${a.desc}（天赋点 ${a.budget}）`));
  const ai = parseInt(await io.ask('选择角色设定：', ARCHETYPES.map((_, i) => String(i + 1)), '1'), 10) - 1;
  const archetype = ARCHETYPES[ai];

  // —— 天赋点加点（可反复修改，0 完成） ——
  let origin = ORIGINS[0];
  let aptitude = TALENT_APTITUDES.find((t) => t.cost === 0)!;
  let root = '三灵根';
  let body = TALENT_BODIES.find((t) => t.cost === 0)!;
  let childhood = TALENT_CHILDHOODS.find((t) => t.cost === 0)!;
  let youth = TALENT_YOUTHS.find((t) => t.cost === 0)!;
  const totalCost = () => origin.cost + aptitude.cost + (ROOT_COSTS[root] ?? 0) + body.cost + childhood.cost + youth.cost;

  while (true) {
    await io.clear();
    const remaining = archetype.budget + totalCost();
    io.print(cyan('═══ 天赋加点 ═══'));
    io.print(`剩余天赋点：${remaining >= 0 ? green(String(remaining)) : red(String(remaining))}`);
    io.print(` 1) 角色出生：${origin.name}（${origin.desc}）`);
    io.print(` 2) 资质：${aptitude.name}（${aptitude.desc}）`);
    const rm = ROOTS.find((r) => r.name === root)!;
    io.print(` 3) 灵根：${root}（修炼 ×${rm.mult}）`);
    io.print(` 4) 先天体质：${body.name}（${body.desc}）`);
    io.print(` 5) 儿时经历：${childhood.name}（${childhood.desc}）`);
    io.print(` 6) 青年经历：${youth.name}（${youth.desc}）`);
    io.print(' 0) 完成');
    const ch = await io.ask('选择要修改的类别：', ['0', '1', '2', '3', '4', '5', '6'], '0');
    if (ch === '0' || ch === '') {
      if (remaining < 0) {
        io.print(red('天赋点不足，请调整选择（可用返还点的缺陷来补齐）。'));
        await io.pause();
        continue;
      }
      break;
    }
    if (ch === '1') { const o = await pickOrigin(io); if (o) origin = o; }
    else if (ch === '2') { const t = await pickTalent(io, '资质', TALENT_APTITUDES); if (t) aptitude = t; }
    else if (ch === '3') { const r = await pickRoot(io); if (r) root = r; }
    else if (ch === '4') { const t = await pickTalent(io, '先天体质', TALENT_BODIES); if (t) body = t; }
    else if (ch === '5') { const t = await pickTalent(io, '儿时经历', TALENT_CHILDHOODS); if (t) childhood = t; }
    else if (ch === '6') { const t = await pickTalent(io, '青年经历', TALENT_YOUTHS); if (t) youth = t; }
  }

  // —— 宗门（开局无门槛，全部门派皆可拜入） ——
  io.print('—— 选择宗门 ——');
  SECTS.forEach((s, i) => io.print(` ${i + 1}) ${s.name}：${s.desc}（${s.bonus}）`));
  const si = parseInt(await io.ask('选择宗门：', SECTS.map((_, i) => String(i + 1)), '1'), 10) - 1;
  const sectDef = SECTS[si];

  // —— 汇总落成 ——
  const p = createPlayer(finalName, origin, sectDef);
  p.scenario = scenario.name;
  p.cheatBonus = archetype.cheatBonus;
  p.goldenFinger = archetype.name;
  p.root = root;
  p.rootMult = ROOTS.find((r) => r.name === root)!.mult;
  aptitude.apply(p); // 资质（绝对值）
  body.apply(p);     // 体质（增量，可与资质叠乘）
  childhood.apply(p);
  youth.apply(p);
  if (sectDef.heartBonus) p.heart = Math.max(0, Math.min(100, p.heart + sectDef.heartBonus));
  if (sectDef.skill && !p.skills.includes(sectDef.skill)) p.skills.push(sectDef.skill);

  // —— 剧本专属伏笔 ——
  await io.narrate(scenario.hook);

  // —— 拜入宗门接引 ——
  await io.narrate(`你拜入 ${green(p.sect)}，领取入门灵石，正式踏上仙途。`);
  p.spirit += 50;
  p.cultivation = Math.min(100, p.cultivation + 5);
  await io.pause();

  return { player: p, leads: [] };
}

function showStatus(state: GameState, io: GameIO): void {
  const p = state.player;
  io.clear();
  io.print(rule('═'));
  io.print(bold(`  《凡骨问仙》 — ${p.name}`));
  io.print(rule('═'));
  io.print(`  出身：${p.origin}      宗门：${p.sect}`);
  if (p.sect !== '散修') {
    const rankIdx = Math.min(p.sectRank ?? 0, SECT_RANKS.length - 1);
    const maxRank = rankIdx >= SECT_RANKS.length - 1;
    const prog = maxRank ? '' : ` / ${SECT_RANK_NEED[rankIdx + 1]}`;
    const masterTag = p.sectMaster ? '·宗主' : '';
    io.print(`  职阶：${SECT_RANKS[rankIdx]}${masterTag}    贡献：${p.sectContribution ?? 0}${prog}`);
  }
  if (p.betrayedSect) io.print(red(`  通缉：被 ${p.betrayedSect} 追杀中（剩 ${p.betrayYears} 年）`));
  io.print(`  灵根：${yellow(p.root)}       年龄：${p.age} / 寿元 ${p.lifespan}`);
  io.print(`  境界：${green(playerTitle(p))}    修为：${p.cultivation.toFixed(0)} / 100`);
  const techProf = p.techProficiency[p.technique] ?? 0;
  const techMult = (TECHNIQUES[p.technique]?.mult ?? 1) * techPower(p);
  io.print(`  功法：${p.technique}·${techLevelName(p)}（熟练 ${techProf}，×${techMult.toFixed(2)}）    法宝：${cyan(p.treasure)}`);
  io.print(`  灵石：${yellow(String(p.spirit))}    心境：${p.heart}`);
  {
    const toxin = p.pillToxin ?? 0;
    if (toxin > 0) {
      const pen = toxinPenalty(p);
      const note = pen >= 1 ? dim('（无碍）') : pen >= 0.9 ? yellow('（修炼 −10%）') : pen >= 0.75 ? yellow('（修炼 −25%）') : red('（修炼 −50%！）');
      io.print(`  丹毒：${toxin}/100${note}`);
    }
  }
  {
    const daoNames = state.leads.filter((l) => l.dao).map((l) => l.name);
    if (p.daoCompanion && !daoNames.includes(p.daoCompanion)) daoNames.push(p.daoCompanion);
    if (daoNames.length > 0) io.print(`  道侣：${magenta(daoNames.join('、'))}（双修加成已生效）`);
  }
  if (p.goldenFinger) io.print(`  奇遇：${green(p.goldenFinger)}`);
  if (p.skills.length > 0) io.print(`  技艺：${p.skills.join('、')}`);
  if (p.formation !== '无') io.print(`  阵法：${cyan(p.formation)}`);
  const talis = Object.entries(p.talismans).filter(([, v]) => v > 0).map(([k, v]) => `${k}×${v}`).join(' ');
  if (talis) io.print(`  符箓：${talis}`);
  if (p.spells.length > 0) io.print(`  神通：${p.spells.join('、')}`);
  if (state.leads.length > 0) io.print(`  红颜：${state.leads.map((l) => l.name).join('、')}`);
  io.print(dim('─'.repeat(W)));
  io.print(`  攻击 ${playerAttack(p)}   防御 ${playerDefense(p)}   气血 ${playerHp(p)}   胜绩 ${p.fightsWon}`);
  io.print(dim('─'.repeat(W)));
  const pills = Object.entries(p.pills).filter(([, v]) => v > 0).map(([k, v]) => `${k}×${v}`).join(' ');
  const mats = Object.entries(p.materials).filter(([, v]) => v > 0).map(([k, v]) => `${k}×${v}`).join(' ');
  io.print('  丹药：' + (pills || '无'));
  io.print('  材料：' + (mats || '无'));
  io.print(rule('═'));
}

export async function mainMenu(state: GameState, io: GameIO): Promise<string> {
  const p = state.player;
  showStatus(state, io);
  io.print(blue('═══ 选择你的行动 ═══'));

  // 突破境界：渡劫期大圆满可飞升（始终可用），否则需修为满才高亮。
  const atPeak = p.realmIdx === REALMS.length - 1 && p.stageIdx === REALMS[p.realmIdx].stages.length - 1;
  const breakLabel = atPeak || p.cultivation >= 100 ? '突破境界' : `突破境界${dim('（修为未满）')}`;

  // 固定编号菜单：「拜访红颜」恒占第 6 位，未结识红颜时置灰而非隐藏。
  // 若按有无红颜增删条目，「突破境界」会在女主登场那年从 6) 跳到 7)，
  // 全局按得最多的键在玩家手底下移位。
  const items: Array<[string, string]> = [
    ['1', '闭关修炼'],
    ['2', '游历探索'],
    ['3', '坊市交易'],
    ['4', '四艺技艺'],
    ['5', '宗门'],
    ['6', state.leads.length > 0 ? '拜访红颜' : `拜访红颜${dim('（尚无红颜）')}`],
    ['7', breakLabel],
    ['8', '存档'],
    ['9', '服用丹药'],
    ['10', '退出游戏'],
  ];

  const labels = items.map(([, label], i) => `${i + 1}) ${label}`);
  for (let i = 0; i < labels.length; i += 3) {
    io.print(' ' + labels.slice(i, i + 3).join('    '));
  }

  const nums = items.map((_, i) => String(i + 1));
  const idx = parseInt(await io.ask('选择：', nums, '1'), 10) - 1;
  return items[idx][0];
}

/** 四艺副业子菜单：炼丹/炼器/阵法/符箓（未掌握则提示解锁方式）。 */
async function craftsMenu(state: GameState, io: GameIO): Promise<boolean> {
  const p = state.player;
  const entries: Array<[string, () => Promise<void>]> = [
    ['炼丹', () => alchemy(p, io)],
    ['炼器', () => forge(p, io)],
    ['阵法', () => formation(p, io)],
    ['符箓', () => talisman(p, io)],
  ];
  while (true) {
    await io.clear();
    io.print(magenta('═══ 四艺技艺 ═══'));
    entries.forEach(([name], i) => {
      const ok = p.skills.includes(name);
      io.print(` ${i + 1}) ${name}${ok ? '' : dim('（未掌握）')}`);
    });
    io.print(' 0) 返回');
    const ch = await io.ask('选择技艺：');
    if (ch === '0' || ch === '') return false;
    const idx = parseInt(ch, 10);
    if (isNaN(idx) || idx < 1 || idx > entries.length) {
      io.print(red('无效编号。'));
      await io.pause();
      continue;
    }
    const [name, run] = entries[idx - 1];
    if (!p.skills.includes(name)) {
      io.print(red(`你尚未掌握${name}之术，需拜师、得传承或遇机缘方可习得。`));
      await io.pause();
      continue;
    }
    await run();
    return true;
  }
}

type ActionResult = { years: number } | 'end';

/** 切换主修功法：列出全部已习得功法并对比属性（切换不耗时）。 */
async function switchMenu(state: GameState, io: GameIO): Promise<void> {
  const p = state.player;
  while (true) {
    const known = Object.keys(p.techProficiency ?? {});
    if (known.length === 0) {
      io.print(red('你尚未习得任何功法。'));
      return;
    }
    io.print(cyan('—— 切换主修 ——'));
    known.forEach((name, i) => {
      const prof = p.techProficiency[name] ?? 0;
      const eff = (TECHNIQUES[name]?.mult ?? 1) * techPowerOf(p, name);
      const mark = name === p.technique ? '（当前）' : '';
      io.print(` ${i + 1}) ${name}${mark}：${techniqueSummary(name)}，熟练 ${prof}（有效修炼 ×${eff.toFixed(2)}）`);
    });
    io.print(' 0) 返回');
    const ch = await io.ask('选择：');
    if (ch === '0' || ch === '') return;
    const idx = parseInt(ch, 10);
    if (isNaN(idx) || idx < 1 || idx > known.length) {
      io.print(red('无效编号。'));
      continue;
    }
    const name = known[idx - 1];
    if (name === p.technique) {
      io.print(yellow('你已主修此功法。'));
      continue;
    }
    switchTechnique(p, name);
    io.print(green(`自此主修《${name}》。`));
    return;
  }
}

/** 闭关子菜单：闭关 N 年 / 参悟功法 / 参悟残篇 / 切换主修。返回 { 总耗时年数, 修炼年数 }。 */
async function retreatMenu(state: GameState, io: GameIO): Promise<{ years: number; cultivate: number }> {
  const p = state.player;
  while (true) {
    await io.clear();
    const prof = p.techProficiency[p.technique] ?? 0;
    io.print(blue('═══ 闭关 ═══'));
    io.print(`当前功法：《${p.technique}》 ${techLevelName(p)}（熟练 ${prof}/100）`);
    if ((p.spiritWarm ?? 0) > 0) io.print(yellow(`灵石温养：剩余 ${p.spiritWarm} 年（闭关 +20%）`));
    io.print(' 1) 闭关 1 年    2) 闭关 3 年');
    io.print(' 3) 闭关 5 年    4) 闭关 10 年');
    io.print(' 5) 参悟功法（熟练度 +15，耗时 1 年）');
    io.print(' 6) 参悟残篇');
    io.print(' 7) 切换主修功法');
    io.print(' 8) 灵石温养（50 灵石 → 闭关 +20% ×5 年）');
    io.print(' 0) 返回');
    const ch = await io.ask('选择：', ['0', '1', '2', '3', '4', '5', '6', '7', '8'], '1');
    if (ch === '0' || ch === '') return { years: 0, cultivate: 0 };
    if (ch === '1' || ch === '2' || ch === '3' || ch === '4') {
      const years = [1, 3, 5, 10][parseInt(ch, 10) - 1];
      return { years, cultivate: years };
    }
    if (ch === '5') {
      if (prof >= 100) {
        io.print(yellow('此功法已臻圆满，参悟无益。'));
        await io.pause();
        continue;
      }
      p.techProficiency[p.technique] = Math.min(100, prof + 15);
      io.print(green(`你闭关参悟《${p.technique}》，熟练度 +15（${p.techProficiency[p.technique]}/100，${techLevelName(p)}）。`));
      return { years: 1, cultivate: 0 };
    }
    if (ch === '7') {
      await switchMenu(state, io);
      continue;
    }
    if (ch === '8') {
      if (p.spirit < 50) {
        io.print(red(`灵石不足（需 50，当前 ${p.spirit}）。`));
        await io.pause();
        continue;
      }
      p.spirit -= 50;
      p.spiritWarm = (p.spiritWarm ?? 0) + 5;
      io.print(green(`你取灵石布下温养法阵，未来 ${p.spiritWarm} 年闭关效率 +20%。`));
      await io.pause();
      continue;
    }
    if (await comprehendFragments(state, io)) return { years: 1, cultivate: 0 };
  }
}

async function doAction(state: GameState, action: string, io: GameIO): Promise<ActionResult> {
  const p = state.player;
  switch (action) {
    case '1': {
      const plan = await retreatMenu(state, io);
      if (plan.years === 0) return { years: 0 };
      if (plan.cultivate === 0) return { years: plan.years }; // 参悟类：不修炼
      let total = 0;
      let actual = 0;
      for (let i = 0; i < plan.cultivate; i++) {
        total += cultivate(p);
        actual += 1;
        if (p.cultivation >= 100) break; // 修为已满，提前出关
      }
      io.print(green(`你闭关 ${actual} 年，共得修为 +${total.toFixed(1)}（当前 ${p.cultivation.toFixed(0)}/100）。`));
      if (p.cultivation >= 100) io.print(yellow('修为已臻圆满，可尝试突破境界。'));
      return { years: actual };
    }
    case '2':
      await explore(state, io);
      return { years: 1 };
    case '3':
      await market(p, io);
      return { years: 1 };
    case '4':
      if (await craftsMenu(state, io)) return { years: 1 };
      return { years: 0 };
    case '5':
      if (await sectMenu(state, io)) return { years: 1 };
      return { years: 0 };
    case '6':
      // 拜访耗时由 romance 按实际互动次数返回（每次交谈/论道/赠礼/双修各 1 年）
      return { years: await romance(p, state.leads, io) };
    case '7': {
      const lastRealm = REALMS.length - 1;
      if (p.realmIdx === lastRealm && p.stageIdx === REALMS[lastRealm].stages.length - 1) {
        await ascend(p, state.leads, io); // 渡劫期大圆满：触发飞升结局
        return 'end';
      }
      if (p.cultivation < 100) {
        io.print(red('修为未满，还无法冲击瓶颈。'));
        return { years: 0 };
      }
      await breakthrough(p, state.leads, io);
      return { years: 1 };
    }
    case '9':
      await takePill(p, io);
      return { years: 0 };
    default:
      return { years: 0 };
  }
}

function yearEnd(state: GameState, io: GameIO): boolean {
  const p = state.player;
  p.age += 1;
  if ((p.betrayYears ?? 0) > 0) {
    p.betrayYears -= 1;
    if (p.betrayYears === 0) {
      p.betrayedSect = null;
      io.print(yellow('旧宗对你的追杀令已撤，恩怨暂了。'));
    }
  }
  sectYearEnd(p, io);
  p.pillToxin = Math.max(0, (p.pillToxin ?? 0) - 2); // 丹毒每年自然消解 2 点
  advanceLeads(state.leads, p.realmIdx); // 红颜修为随时间成长
  if (p.age >= p.lifespan) return true;
  if (p.lifespan - p.age <= 10) {
    io.print(red(`⚠ 寿元将尽！仅剩 ${p.lifespan - p.age} 年！速寻突破之法！`));
  }
  return false;
}

function gameOver(p: Player, reason: string, io: GameIO): void {
  io.print(red('═'.repeat(W)));
  io.print(red(`   游戏结束：${p.name}，享年 ${p.age} 岁，${reason}`));
  io.print(red('═'.repeat(W)));
  io.print(yellow(`   最终境界：${playerTitle(p)}`));
}

export async function runGame(state: GameState, io: GameIO): Promise<void> {
  while (true) {
    const action = await mainMenu(state, io);

    if (action === '8') {
      saveGame(state, io);
      continue;
    }
    if (action === '10') {
      if ((await io.ask('确定退出？(y/n)', ['y', 'n'], 'n')) === 'y') {
        saveGame(state, io);
        io.print(dim('已存档退出。'));
        return;
      }
      continue;
    }

    const result = await doAction(state, action, io);
    if (result === 'end') {
      saveGame(state, io);
      return;
    }
    for (let i = 0; i < result.years; i++) {
      if (yearEnd(state, io)) {
        gameOver(state.player, '寿元耗尽，坐化而去', io);
        saveGame(state, io);
        return;
      }
    }
    await maybeTriggerStory(state, io);
    await io.pause();
  }
}
