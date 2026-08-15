// selfplay.ts — 策略化自动通关脚本（QA 用）。
// 与 playtest.ts 的区别：playtest 直接捏角色 + 随机应答；本脚本走【真实创角流程】
// （剧本→角色设定→天赋加点→宗门），并像一个会玩的玩家那样决策：
// 修为满突破、备突破丹、按冷却接任务、攒贡献晋升、逢届大比、定期游历与拜访红颜、
// 剧情抉择按「侠义/魔道」两套倾向选择。通关后输出 =====STATS===== 结构化覆盖率统计。
//
// 运行：npx tsx selfplay.ts [剧本1-4] [righteous|dark] [normal|strong] [宗门名]
// 存档自动重定向到 FANGU_SAVE_DIR（缺省 /tmp/fangu-selfplay），不会覆盖真实存档。

process.env.FANGU_SAVE_DIR ??= '/tmp/fangu-selfplay';

import type { GameIO } from './src/io.js';
import type { GameState, Player, FemaleLead } from './src/types.js';
import { REALMS, PILLS, SECT_RANKS, SECT_RANK_NEED, SECT_RANK_REALM, playerTitle } from './src/content.js';
import { SECT_TASKS } from './src/content/tasks.js';
import { STORY_NODES } from './src/content/story.js';
import { START_YEAR } from './src/content/world.js';
import { intro, createCharacter, runGame } from './src/core/engine.js';

const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

interface Opt { n: number; label: string }

type Policy = 'righteous' | 'dark';
type Build = 'normal' | 'strong';

// 剧情抉择的用词倾向（按选项文字打分取最高）
const POLICY_KEYS: Record<Policy, string[]> = {
  righteous: ['救', '驰援', '助', '守', '传', '渡', '恕', '收', '应', '归', '葬', '扶', '答应', '认', '讲', '护', '允'],
  dark: ['魔', '吞', '夺', '杀', '趁乱', '不救', '诛', '拒', '枭', '取利', '血', '废', '灭'],
};

// 关键分叉的显式选择（选项前缀匹配，优先于关键词打分）——
// 「渡魔：不吞不杀」这类否定式措辞会骗过朴素关键词，故枢纽节点逐一点名。
const POLICY_PICKS: Record<Policy, string[]> = {
  righteous: [
    '郑重许诺', '扶起老者', '以己道镇之', '引以为鉴', '接下此托', '留一部《凡骨录》',
    '囚而不杀', '依图潜入', '将计就计', '「不必想好',
    '邀众散修', '只取灵芝', '爽快掏钱', '渡口开放',
    '运功强压', '不去。此物近不得', '坦诚相告', '渡魔：', '坦然赴会', '「祖训是祖训', '斩功：', '设坛清账',
    '坦然安排身后', '开山门', '为故人立一座无名碑', '闭死关',
  ],
  dark: [
    '沉默不语', '静立片刻', '效法先人', '敞开识海', '婉言相拒', '敛尽声名', '推门入府',
    '当夜提剑', '雷霆强攻', '灯下静候', '「天大地大',
    '趁夜独入', '芝剑双取', '掀桌', '将渡口据为己用',
    '开一道缝', '连夜赶去', '一言不合', '吞魔：', '拒不赴会', '「很好。这份家底', '杀出一条血路', '斩寿：', '账？让它来收收看',
    '孤注一掷', '置之不理', '赠粮指路', '长揖一礼',
  ],
};

class SmartIO implements GameIO {
  asks = 0;
  buf: string[] = [];               // 自上次应答以来的输出（决策依据）
  state: GameState | null = null;   // 创角完成后注入

  // —— 创角计划 ——
  private talentPlan: Array<{ cat: string; want: string }>;
  private pendingWant: string | null = null;
  private remaining = 0;

  // —— 局内意图与节奏 ——
  private sectIntent: 'task' | 'promote' | 'tourney' | 'master' | null = null;
  private buyPill: string | null = null;
  private visitActions = 0;
  private pickedLeadThisTrip = false;
  private curLead: FemaleLead | null = null;
  private lastVisitYear = -99;
  private lastTaskYear = -99;
  private lastExploreYear = -99;
  private lastTourneyYear = -99;
  private lastActivityYear = -99;

  constructor(
    readonly scenarioNum: string,
    readonly policy: Policy,
    readonly build: Build,
    readonly sectName: string,
  ) {
    // strong：龙傲天(16点) 拉满天灵根；normal：红尘众生(30点) 异灵根 + 余点堆资质体质经历
    this.talentPlan = build === 'strong'
      ? [{ cat: '3', want: '天灵根' }, { cat: '2', want: 'BEST' }, { cat: '4', want: 'BEST' }]
      : [
          { cat: '3', want: '异灵根' }, { cat: '2', want: 'BEST' }, { cat: '4', want: 'BEST' },
          { cat: '5', want: 'BEST' }, { cat: '6', want: 'BEST' },
        ];
  }

  clear(): void {}
  print(t = ''): void {
    const s = strip(t);
    console.log(s);
    this.buf.push(s);
  }
  async narrate(t: string): Promise<void> {
    this.print(t);
  }
  async pause(): Promise<void> {}

  async ask(question: string, choices?: string[], def?: string): Promise<string> {
    this.asks += 1;
    if (this.asks > 120000) {
      throw new Error('ask 次数超限，疑似死循环。最近输出：\n' + this.buf.slice(-25).join('\n'));
    }
    const q = strip(question);
    const ans = this.decide(q, choices, def);
    console.log(`${q} 〔${ans}〕`);
    this.buf = [];
    return ans;
  }

  private bufHas(needle: string): boolean {
    return this.buf.some((l) => l.includes(needle));
  }

  /** 从最近输出解析「N) 选项」列表（兼容主菜单一行三项的排版）。 */
  private options(): Opt[] {
    const out: Opt[] = [];
    for (const line of this.buf) {
      for (const seg of line.split(/\s{3,}/)) {
        const m = seg.match(/^\s*(\d+)\)\s*(.+?)\s*$/);
        if (m) out.push({ n: parseInt(m[1], 10), label: m[2] });
      }
    }
    return out;
  }

  // ———————— 决策核心 ————————

  private decide(q: string, choices?: string[], def?: string): string {
    const p = this.state?.player;
    const opts = this.options();

    // —— 创角阶段 ——
    if (q.startsWith('请输入你的姓名')) return this.build === 'strong' ? '顾青行' : '陈拾遗';
    if (q.startsWith('选择剧本')) return this.scenarioNum;
    if (q.startsWith('选择角色设定')) return this.build === 'strong' ? '2' : '4';
    if (q.startsWith('选择要修改的类别')) {
      const m = this.buf.map((l) => l.match(/剩余天赋点：(-?\d+)/)).filter(Boolean).pop();
      if (m) this.remaining = parseInt(m[1], 10);
      const step = this.talentPlan.shift();
      if (!step) return '0';
      this.pendingWant = step.want;
      return step.cat;
    }
    if (this.pendingWant && /—— (灵根|资质|先天体质|儿时经历|青年经历|角色出生) ——/.test(this.buf.join('\n'))) {
      const want = this.pendingWant;
      this.pendingWant = null;
      if (want !== 'BEST') {
        const hit = opts.filter((o) => o.label.startsWith(want)).pop();
        return hit ? String(hit.n) : '0';
      }
      let best: Opt | null = null;
      let bestCost = 0; // 预算内最贵的一项
      for (const o of opts) {
        const cm = o.label.match(/（花费 (\d+)）/);
        if (!cm) continue;
        const cost = parseInt(cm[1], 10);
        if (cost <= this.remaining && cost > bestCost) { best = o; bestCost = cost; }
      }
      return best ? String(best.n) : '0';
    }
    if (q.startsWith('选择宗门')) {
      const hit = opts.filter((o) => o.label.startsWith(this.sectName)).pop();
      return hit ? String(hit.n) : '1';
    }

    // —— 战斗 ——
    if (q.startsWith('选择行动')) {
      const hpLine = this.buf.filter((l) => l.includes('你：气血')).pop();
      const hm = hpLine?.match(/你：气血 (-?\d+)\/(\d+)/);
      const canHeal = ((p?.pills['疗伤丹'] ?? 0) > 0 || (p?.pills['回春丹'] ?? 0) > 0);
      const im = (name: string) => q.match(new RegExp(`(\\d+)\\)${name}`))?.[1] ?? null;
      if (hm && canHeal && parseInt(hm[1], 10) < parseInt(hm[2], 10) * 0.3) {
        const h = im('疗伤');
        if (h) return h;
      }
      return im('普通攻击') ?? def ?? '1';
    }
    if (q.startsWith('施展')) return '1';

    // —— 剧情/世界事件抉择：先查枢纽节点显式映射，再按倾向用词打分 ——
    if (q.startsWith('你的选择')) {
      const pool = choices ?? opts.map((o) => String(o.n));
      for (const pref of POLICY_PICKS[this.policy]) {
        const hit = opts.find((o) => o.label.startsWith(pref) && pool.includes(String(o.n)));
        if (hit) return String(hit.n);
      }
      let bestN: string | null = null;
      let bestScore = 0;
      for (const o of opts) {
        if (!pool.includes(String(o.n))) continue;
        const score = POLICY_KEYS[this.policy].reduce((s, k) => s + (o.label.includes(k) ? 1 : 0), 0);
        if (score > bestScore) { bestScore = score; bestN = String(o.n); }
      }
      return bestN ?? pool[Math.floor(Math.random() * pool.length)];
    }

    // —— y/n：一律积极参与 ——
    if (choices && choices.includes('y') && choices.includes('n')) return 'y';

    // —— 主菜单 ——
    if (p && choices && choices.includes('10')) return this.mainMenu(p);

    // —— 闭关 ——
    if (p && this.bufHas('═══ 闭关 ═══')) {
      const prof = p.techProficiency[p.technique] ?? 0;
      if (prof < 60 && p.cultivation < 95) return '5'; // 先把功法参悟上去，磨刀不误
      return '4';
    }

    // —— 宗门 ——
    if (this.bufHas('═══ 宗门 ═══')) {
      const it = this.sectIntent;
      this.sectIntent = null;
      if (it === 'task') return '1';
      if (it === 'promote') return '3';
      if (it === 'tourney') return '4';
      if (it === 'master') return '5';
      return '0';
    }
    if (q.startsWith('选择任务')) {
      const idx = this.pickTask();
      return idx === null ? '0' : String(idx);
    }

    // —— 坊市 ——
    if (this.bufHas('═══ 坊市 ═══')) return this.buyPill ? '1' : '5';
    if (q.startsWith('购买编号') && this.bufHas('—— 丹药 ——')) {
      const want = this.buyPill;
      this.buyPill = null;
      const hit = want ? opts.filter((o) => o.label.startsWith(want)).pop() : undefined;
      return hit ? String(hit.n) : '0';
    }
    if (/^(购买|兑换|出售|参悟)编号/.test(q)) return '0';
    if (q.startsWith('捐献多少灵石')) return '0';

    // —— 红颜 ——
    if (q.startsWith('选择拜访对象')) {
      if (!this.pickedLeadThisTrip && this.state && this.state.leads.length > 0) {
        this.pickedLeadThisTrip = true;
        this.visitActions = 0;
        // 优先照拂好感最低者（道侣视作已稳，排序靠后）
        let idx = 0;
        let low = Infinity;
        this.state.leads.forEach((l, i) => {
          const f = l.favor + (l.dao ? 100 : 0);
          if (f < low) { low = f; idx = i; }
        });
        this.curLead = this.state.leads[idx];
        return String(idx + 1);
      }
      this.pickedLeadThisTrip = false;
      return '0';
    }
    if (p && this.bufHas('═══ 拜访 ')) {
      const l = this.curLead;
      if (!l || this.visitActions >= 3) return '0';
      this.visitActions += 1;
      const need = Math.min(100, 80 + Math.max(0, l.realmIdx - p.realmIdx) * 10);
      if (!l.dao && l.favor >= need) return '4';        // 结为道侣
      if (l.dao && p.cultivation < 100) return '4';     // 双修
      if (!l.dao && l.favor < 70 && p.spirit > 800) return '3'; // 赠礼催好感
      if (l.favor >= 30) return '2';                    // 论道
      return '1';                                       // 交谈
    }
    if (q.startsWith('选择礼物')) {
      const stones = opts.filter((o) => /^灵石×/.test(o.label));
      if (stones.length > 0) return String(stones[stones.length - 1].n); // 只送灵石，最贵档
      return opts.length > 0 ? String(opts[0].n) : '0';
    }

    // —— 兜底 ——
    if (choices && choices.length > 0) return def && choices.includes(def) ? def : choices[0];
    return def ?? '0';
  }

  /** 主菜单策略：突破 > 备丹 > （限频的）红颜/宗门/游历 > 闭关。修行为主，杂务为辅。 */
  private mainMenu(p: Player): string {
    const st = this.state!;
    const year = st.year;
    if (year > START_YEAR + 1500) return '10'; // 安全阀：拖过 1500 年强制退出
    const atPeak = p.realmIdx === REALMS.length - 1 && p.stageIdx === REALMS[p.realmIdx].stages.length - 1;
    const big = p.stageIdx === REALMS[p.realmIdx].stages.length - 1;
    const pill = REALMS[p.realmIdx].breakPill;
    if (!atPeak && big && pill && (p.pills[pill] ?? 0) === 0
        && p.spirit >= (PILLS[pill]?.price ?? Infinity) && p.cultivation >= 60) {
      this.buyPill = pill;
      return '3';
    }
    if (atPeak || p.cultivation >= 100) return '7';
    // 杂务共享冷却：任意活动后至少闭关 2 年再理会俗务
    if (year - this.lastActivityYear >= 3) {
      // 红颜：尚有未结缘者才频繁走动
      if (st.leads.some((l) => !l.dao) && year - this.lastVisitYear >= 6) {
        this.lastVisitYear = year;
        this.lastActivityYear = year;
        this.pickedLeadThisTrip = false;
        return '6';
      }
      if (p.sect !== '散修') {
        const rank = Math.min(p.sectRank ?? 0, SECT_RANKS.length - 1);
        if (rank < SECT_RANKS.length - 1
            && (p.sectContribution ?? 0) >= SECT_RANK_NEED[rank + 1]
            && p.realmIdx >= SECT_RANK_REALM[rank + 1]) {
          this.sectIntent = 'promote';
          this.lastActivityYear = year;
          return '5';
        }
        // 长老攒足贡献便去争宗主之位（覆盖宗主线剧情）
        if (rank === SECT_RANKS.length - 1 && !p.sectMaster && (p.sectContribution ?? 0) >= 620) {
          this.sectIntent = 'master';
          this.lastActivityYear = year;
          return '5';
        }
        // 大比：中低境界的扬名期才去凑热闹（化神后不与晚辈争锋）
        if (year % 3 === 0 && rank >= 1 && p.realmIdx <= 4 && this.lastTourneyYear !== year) {
          this.lastTourneyYear = year;
          this.lastActivityYear = year;
          this.sectIntent = 'tourney';
          return '5';
        }
        // 任务：攒贡献晋升阶段才接
        if ((rank < SECT_RANKS.length - 1 || p.realmIdx <= 2)
            && year - this.lastTaskYear >= 5 && this.pickTask() !== null) {
          this.lastTaskYear = year;
          this.lastActivityYear = year;
          this.sectIntent = 'task';
          return '5';
        }
      }
      if (year - this.lastExploreYear >= 5) {
        this.lastExploreYear = year;
        this.lastActivityYear = year;
        return '2';
      }
    }
    return '1';
  }

  /** 镜像执事堂的任务列表逻辑，选一个当下可完成的任务（稳妥优先），返回 1 起的编号。 */
  private pickTask(): number | null {
    const p = this.state?.player;
    if (!p || !this.state) return null;
    p.taskCd ??= {};
    const eligible = SECT_TASKS.filter(
      (t) => (t.realmMin === undefined || p.realmIdx >= t.realmMin) &&
             (t.realmMax === undefined || p.realmIdx <= t.realmMax),
    );
    const doable = (t: (typeof eligible)[number]) => {
      if ((p.taskCd[t.id] ?? 0) > this.state!.year) return false;
      if (t.kind === 'collect') return (p.materials[t.material!] ?? 0) >= (t.matN ?? 1);
      if (t.kind === 'craft') return (p.pills[t.pill!] ?? 0) >= 1;
      return true;
    };
    const order = (t: (typeof eligible)[number]) =>
      t.kind === 'patrol' ? 0 : t.kind === 'combat' ? 1 : 2;
    let best: number | null = null;
    let bestOrd = 99;
    eligible.forEach((t, i) => {
      if (doable(t) && order(t) < bestOrd) { bestOrd = order(t); best = i + 1; }
    });
    return best;
  }
}

async function main(): Promise<void> {
  const scenarioNum = process.argv[2] ?? '1';
  const policy = (process.argv[3] === 'dark' ? 'dark' : 'righteous') as Policy;
  const build = (process.argv[4] === 'normal' ? 'normal' : 'strong') as Build;
  const sectName = process.argv[5] ?? '玄清门';

  const io = new SmartIO(scenarioNum, policy, build, sectName);
  console.log(`===== 剧本${scenarioNum} · ${policy} · ${build} · 目标宗门:${sectName} =====`);
  const first = await intro(io);
  if (first !== '1') throw new Error(`intro 选择异常：${first}`);
  const state = await createCharacter(io);
  io.state = state;
  await runGame(state, io);

  // —— 结构化统计（覆盖率 / 结局 / flag），供批量分析 ——
  const p = state.player;
  const nodes = STORY_NODES.filter((n) => !n.scenario || n.scenario === p.scenario);
  const done = p.storyDone ?? [];
  const missed = p.storyMissed ?? [];
  const unseen = nodes.map((n) => n.id).filter((id) => !done.includes(id) && !missed.includes(id));
  const ending = p.biography.some((b) => b.includes('白日飞升')) ? '飞升'
    : p.biography.some((b) => b.includes('殒身雷下')) ? '渡劫身死'
    : p.age >= p.lifespan ? '寿尽'
    : '超时退出';
  console.log('=====STATS=====');
  console.log(JSON.stringify({
    args: { scenarioNum, policy, build, sectName },
    end: {
      ending, age: p.age, year: state.year, realm: playerTitle(p),
      spirit: p.spirit, fightsWon: p.fightsWon, heart: p.heart, sect: p.sect,
      rank: SECT_RANKS[Math.min(p.sectRank ?? 0, SECT_RANKS.length - 1)], master: p.sectMaster,
    },
    story: { coverage: `${done.length}/${nodes.length}`, done, missed, unseen },
    world: p.worldSeen,
    letters: p.lettersSent,
    flags: p.flags,
    leads: state.leads.map((l) => ({ name: l.name, favor: l.favor, dao: l.dao })),
    bio: p.biography,
  }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
