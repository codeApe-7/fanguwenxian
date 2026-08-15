// 传音投递管道：剧情主动找玩家，而不是等玩家去翻菜单。
//
// 每封传音有触发条件（好感/境界/flag/系统状态）与随机延迟——
// 同一批条件满足的信不会挤在同一年炸出，玩家感受到的是「陆陆续续有人找我」。
// 送达每年至多一封；forLead 信件按每位红颜实例化，开场白经性格对白矩阵取措辞。

import type { GameIO } from '../io.js';
import type { GameState, FemaleLead } from '../types.js';
import type { StoryEffects } from './story.js';
import { applyStoryEffects } from '../core/storyline.js';
import { dialogueOf } from './dialogue.js';
import { fill, addBio } from '../core/text.js';
import { combat } from '../core/combat.js';
import { green, red, yellow, dim } from '../colors.js';
import { incomeScale } from '../content.js';

export interface LetterDef {
  id: string;
  /** 按每位红颜实例化（实例 id 为 `${id}:${红颜名}`），开场白自动取其性格措辞。 */
  forLead?: boolean;
  /** 触发后随机延迟送达的年数区间。 */
  delay: [number, number];
  when: (state: GameState, lead?: FemaleLead) => boolean;
  /** 送达时的引子（缺省为通用传音旁白）。 */
  intro?: string;
  /** 正文（{name}/{her} 占位）。 */
  text?: string[];
  /** 送达即结算的效果。 */
  effects?: StoryEffects;
  /** 复杂信件（抉择/战斗）自定义处理。 */
  run?: (state: GameState, io: GameIO, lead?: FemaleLead) => Promise<void>;
}

export const LETTERS: LetterDef[] = [
  // —— 红颜来信：近况 ——
  {
    id: '红颜家书', forLead: true, delay: [1, 2],
    when: (_s, l) => !!l && l.met && !l.dao && l.favor >= 40 && l.favor < 80,
    text: [
      '信不长，说的都是小事：她近来的修行、路上看到的一场好雪、一句没头没尾的「勿念」。',
      '末尾的落款旁边，画了一株小小的药草——你们初识那日，她袖上绣的就是这个。',
    ],
    run: async (state, io, lead) => {
      if (!lead) return;
      lead.favor = Math.min(100, lead.favor + 4);
      io.print(green(`千里传音，情意可鉴。${lead.name} 好感 +4。`));
    },
  },
  // —— 红颜求援：危难见真心 ——
  {
    id: '红颜求援', forLead: true, delay: [0, 1],
    when: (_s, l) => !!l && l.met && l.favor >= 65,
    intro: '一道传音符跌跌撞撞撞进窗来，符纸边缘焦黑，显然一路遭了追截。',
    run: async (state, io, lead) => {
      if (!lead) return;
      const p = state.player;
      await io.narrate(fill('她在信中语气仓促：她为夺一株灵药遭人围困于绝谷，支撑不了几日。坐标随符附上——去或不去，«七日为限»。'));
      io.print(' 1) 星夜驰援');
      io.print(' 2) 按兵不动');
      const ch = await io.ask('你的选择：', ['1', '2'], '1');
      if (ch === '1') {
        const r = await combat(p, state.leads, io, `你赶到绝谷，围困${lead.name}的强敌转身迎来——正是 {enemy}！`, 1);
        if (r === 'win') {
          await io.narrate(fill(dialogueOf(lead.personality).rescued, { name: p.name, her: lead.name }));
          lead.favor = Math.min(100, lead.favor + 15);
          io.print(green(`患难见真情，${lead.name} 好感 +15。`));
          addBio(p, `驰援绝谷，救 ${lead.name} 于围困`);
        } else {
          lead.favor = Math.min(100, lead.favor + 5);
          p.heart = Math.max(0, p.heart - 3);
          await io.narrate(yellow('你虽败下阵来，仍拼死护她杀出一条生路。她扶着你，久久无言。'));
        }
      } else {
        lead.favor = Math.max(0, lead.favor - 25);
        p.heart = Math.max(0, p.heart - 5);
        p.flags['见死不救'] = (p.flags['见死不救'] ?? 0) + 1;
        await io.narrate(dim('你收起传音符，继续修行。数月后听闻她自己杀出了绝谷——只是自那以后，她再无传音来。'));
        io.print(red(`${lead.name} 好感 -25，心境 -5。`));
      }
    },
  },
  // —— 道侣家书 ——
  {
    id: '道侣家书', forLead: true, delay: [1, 3],
    when: (_s, l) => !!l && l.dao && l.favor >= 95,
    text: [
      '是她的传音。没有要事，絮絮说了些洞府的琐碎：药圃发了新芽，你惯坐的蒲团她晒过了，檐下的风铃换了根红绳。',
      '末了一句：「早些回来。」',
    ],
    run: async (state, io, lead) => {
      if (!lead) return;
      state.player.heart = Math.min(100, state.player.heart + 5);
      lead.favor = Math.min(100, lead.favor + 3);
      io.print(green('有人惦念的修行路，不苦。心境 +5。'));
    },
  },
  // —— 宗门嘉勉 ——
  {
    id: '宗门嘉勉', delay: [0, 1],
    when: (s) => s.player.sect !== '散修' && s.player.sectRank >= 1 && s.player.sectContribution >= 250,
    intro: '一道鎏金传音符落入掌心——是掌门亲发的门内嘉勉令。',
    text: [
      '令中历数你近年为宗门效力的功绩，着记«一功»，赐贡献三十点，通传各峰。',
      '末尾有一行小字，字迹与正文不同：「后生可畏。」',
    ],
    run: async (state, io) => {
      state.player.sectContribution += 30;
      state.player.heart = Math.min(100, state.player.heart + 3);
      io.print(green('贡献 +30，心境 +3。'));
    },
  },
  // —— 亡命中的暗信 ——
  {
    id: '旧同门密讯', delay: [0, 1],
    when: (s) => Boolean(s.player.betrayedSect) && (s.player.betrayYears ?? 0) > 0,
    intro: '一枚不起眼的灰色传音符混在坊市找零的碎灵石里，入手即化。',
    text: [
      '传讯者未留名姓，只说了两句话：「巡查改道，往东。」「保重。」',
      '你辨出那口音——当年同灶吃饭的师弟。叛出宗门，叛不掉一口锅里的交情。',
    ],
    effects: { heart: 3, cult: 5, log: '亡命途中，得旧同门密讯指路' },
  },
  // —— 昭衡司谢函（玄阴魔乱助战后） ——
  {
    id: '昭衡司谢函', delay: [1, 3],
    when: (s) => (s.player.flags['卫道'] ?? 0) >= 1,
    intro: '一道玄铁令牌样式的传音符落在案头，制式严整——昭衡司公文。',
    text: [
      '函中记你玄阴魔乱助战之功，附犒赏灵石一批，并录你名于「义修册」。',
      '公文腔十足，末尾却盖了一方私印：那位女司正的字，「有事，报我名字」。',
    ],
    effects: { spirit: 300, flags: { 正道盟友: 1 }, log: '录名昭衡司义修册' },
  },
  // —— 百宝斋青帖 ——
  {
    id: '百宝斋青帖', delay: [1, 2],
    when: (s) => s.player.spirit >= 3000 && s.player.realmIdx >= 2,
    intro: '一封洒金青帖不知何时已放在你的洞府门口，帖上一个「宝」字龙飞凤舞。',
    text: [
      '百宝斋总号来帖：久闻道友出手豪阔，特奉«贵客青帖»一面。',
      '凭此帖，四海拍卖大会各标的一律再让利——商家的嗅觉，比妖兽灵敏十倍。',
    ],
    effects: { flags: { 百宝贵客: 1 }, log: '获百宝斋贵客青帖' },
  },
  // —— 隐修赠言 ——
  {
    id: '隐修赠言', delay: [1, 2],
    when: (s) => s.player.heart >= 90,
    intro: '清晨推门，门环上不知何时系了一枚古朴的传音玉。',
    text: [
      '玉中只有一段苍老的声音：「老夫观你道心澄澈，尘垢不生，是个修行的好苗子。赠你四个字——」',
      '「守拙，抱朴。」',
      '玉音散尽，玉化为齑粉。你反复咀嚼这四个字，只觉修行路上多处滞涩豁然贯通。',
    ],
    effects: { cult: 20, heart: 3, log: '得无名隐修传音赠言' },
  },
  // —— 江湖战书 ——
  {
    id: '江湖战书', delay: [0, 1],
    when: (s) => s.player.fightsWon >= 30,
    intro: '一道猩红的传音符钉在你门前树上，符尾还在滴溜溜打转——是战书。',
    run: async (state, io) => {
      const p = state.player;
      await io.narrate(fill('「阁下连胜之名，江湖尽知。三日后«洗剑池»一会，胜者留名，败者留物。」落款：无名剑客。', {}));
      io.print(' 1) 赴约一战');
      io.print(' 2) 置之不理');
      const ch = await io.ask('你的选择：', ['1', '2'], '1');
      if (ch === '1') {
        const r = await combat(p, state.leads, io, '洗剑池畔，无名剑客长身而立，拔剑出鞘——正是 {enemy}！', 1);
        if (r === 'win') {
          const loot = 150 * incomeScale(p.realmIdx);
          p.spirit += loot;
          p.heart = Math.min(100, p.heart + 5);
          await io.narrate(green(`剑客败退，留下佩剑抵作彩头。你变卖得 ${loot} 灵石，江湖名号又响三分。`));
          addBio(p, '洗剑池应战无名剑客，胜之');
        } else {
          await io.narrate(yellow('技不如人，你交出随身灵石，拱手认负。剑客抱拳还礼：「承让。江湖再会。」'));
        }
      } else {
        p.heart = Math.max(0, p.heart - 2);
        await io.narrate(dim('你把战书取下烧了。江湖上从此多了一句闲话：那位，不敢应战。'));
      }
    },
  },
];
