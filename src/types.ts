// 核心类型与状态定义（纯数据，与终端/网页无关）。

export interface Player {
  name: string;
  origin: string;
  sect: string;
  scenario: string;       // 命运剧本名
  storyStep: number;      // 主线事件进度（下一个待触发下标）
  betrayedSect: string | null; // 叛出的宗门（被追杀中）
  betrayYears: number;         // 剩余追杀年限
  sectContribution: number;    // 当前宗门贡献点
  sectRank: number;            // 职阶下标（外门/内门/真传/长老）
  sectMaster: boolean;         // 是否已继位宗主
  mastered: string[];          // 已修习过一次性功效的功法（寿元等）
  techProficiency: Record<string, number>; // 各功法熟练度 0-100（入门/小成/大成/圆满）
  fragments: Record<string, number>;       // 功法残篇（集齐可参悟补全）
  spells: string[];                        // 已习得的神通/法术
  pillToxin: number;                       // 丹毒 0~100（过高降低修炼效率）
  root: string;
  rootMult: number;
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
}

export interface GameState {
  player: Player;
  leads: FemaleLead[];
}
