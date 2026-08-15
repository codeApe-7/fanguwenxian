// 核心类型与状态定义（纯数据，与终端/网页无关）。

export interface Player {
  name: string;
  origin: string;
  sect: string;
  scenario: string;       // 命运剧本名
  storyStep: number;      // （旧版遗留）主线线性进度，仅存档迁移用
  storyDone: string[];    // 已触发的剧情节点 id
  storyMissed: string[];  // 已永久错过的剧情节点 id
  flags: Record<string, number>; // 剧情 flag 变量表（前置链/互斥分支/多结局判定）
  biography: string[];    // 人生大事记（立传用，「玄启107年（21岁）·某事」）
  taskCd: Record<string, number>;  // 宗门任务冷却：任务 id -> 可再接的世界纪年
  lettersSent: string[];           // 已投递过的传音 id（IsOnly 语义）
  pendingLetters: Array<{ id: string; dueYear: number }>; // 已触发待送达的传音（随机延迟）
  worldSeen: string[];             // 已参与/播报过的一次性世界大事 id
  betrayedSect: string | null; // 叛出的宗门（被追杀中）
  betrayYears: number;         // 剩余追杀年限
  sectContribution: number;    // 当前宗门贡献点
  sectRank: number;            // 职阶下标（外门/内门/真传/长老）
  sectMaster: boolean;         // 是否已继位宗主
  mastered: string[];          // 已修习过一次性功效的功法（寿元等）
  techProficiency: Record<string, number>; // 各功法熟练度 0-100（入门/小成/大成/圆满）
  fragments: Record<string, number>;       // 功法残篇（集齐可参悟补全）
  spells: string[];                        // 已习得的神通/法术
  spellLv: Record<string, number>;         // 各神通等级 1-5（升级不涨消耗，只涨威力）
  insight: number;                         // 悟道点：升神通用，全程给不满，逼你专精
  roots: Record<'金' | '木' | '水' | '火' | '土', number>; // 五行灵根值 0-100，主属性最深
  abode: string;                           // 洞府/灵脉名，决定闭关效率
  goldenCore: { type: string; quality: number } | null; // 结丹期一次性 build：金丹型与品
  yuanying: string | null;                 // 元婴期一次性 build：灵机异象名
  daoPath: string | null;                  // 化神期一次性 build：入道流派名
  pillToxin: number;                       // 丹毒 0~100（过高降低修炼效率）
  root: string;
  rootMult: number;
  aptitude: number;      // 资质修炼倍率（开局加点）
  realmIdx: number;      // 大境界下标
  stageIdx: number;      // 小境界下标
  cultivation: number;   // 当前小境界修为 0~100
  age: number;
  lifespan: number;
  spirit: number;        // 灵石
  spiritWarm: number;    // 灵石温养剩余年数（>0 时闭关修炼效率 +20%）
  technique: string;     // 修炼功法
  treasure: string;      // 法宝
  maxHp: number;
  heart: number;         // 心境 0~100
  pills: Record<string, number>;
  materials: Record<string, number>;
  skills: string[];              // 已解锁的副业技能（炼丹/炼器/阵法/符箓）
  formation: string;             // 当前所布阵法（'无' 表示未布阵）
  talismans: Record<string, number>; // 符箓道具
  daoCompanion: string | null;   // 道侣姓名
  goldenFinger: string | null;   // 金手指
  cheatBonus: number;            // 金手指修炼加成倍率
  fightsWon: number;
}

export interface FemaleLead {
  name: string;
  title: string;
  appearance: string;
  personality: string;
  realm: string;    // 境界名（展示用，随 realmIdx/stageIdx 同步）
  realmIdx: number; // 大境界下标（随时间成长）
  stageIdx: number; // 小境界下标
  favor: number;    // 好感度 0~100
  met: boolean;
  dao: boolean;     // 是否已是道侣
  seen?: Record<string, boolean>; // 已触发的专属场景（好感里程碑等，仅一次）
}

export interface GameState {
  player: Player;
  leads: FemaleLead[];
  year: number;     // 世界纪年（玄启 N 年）——世界大事按此运转，与玩家年龄解耦
}
