// 宗门任务库：三层文案（世界告示 / 执事口吻 / 指路短句）+ 冷却 + 境界窗。
//
// - step：菜单里的一行短句，只说「干什么」；
// - world：任务告示，说这件事在世界里是什么（不含主角视角）；
// - say：执事的一句话，人物口吻（{daoyou} 按职阶称呼、{place} 地点池填充）；
// - failSay：失败时执事的话——「没做到」也是剧情，且要扣贡献；
// - cd：冷却年数，防止刷同一任务；realmMin/realmMax：境界窗，
//   低阶杂役到了高境界自动下架（真人不巡山），高阶要务低境界接不了。

export interface SectTaskDef {
  id: string;
  step: string;
  world: string;
  say: string;
  kind: 'combat' | 'collect' | 'craft' | 'patrol';
  diff: 1 | 2 | 3;      // 难度星级：1 简单 / 2 普通 / 3 困难
  boost?: number;       // combat 敌人等级加成
  intro?: string;       // combat 开场白（{enemy} 占位）
  material?: string;
  matN?: number;
  pill?: string;
  reward: number;       // 基础贡献（按境界缩放）
  cd: number;           // 冷却（年）
  realmMin?: number;
  realmMax?: number;
  failSay: string;
}

export const SECT_TASKS: SectTaskDef[] = [
  // ═══ 困难（三星）：高风险高回报 ═══
  {
    id: '剿妖王', step: '剿灭作乱妖王', kind: 'combat', diff: 3, boost: 2, reward: 80, cd: 6,
    world: '一头妖王于{place}一带开辟巢穴，裹挟群妖劫掠山民，商路断绝已逾半年，其气焰之盛，寻常巡山弟子已近不得身。',
    say: '「{daoyou}，此獠伤我门下两人，账不能再拖了。荡平巢穴，首级带回来。」',
    intro: '妖王凶焰滔天，携众小妖扑杀而来——正是 {enemy}！',
    failSay: '「败了？……罢。伤养好再说，只是妖王经此一吓必迁巢穴，前功尽弃矣。」',
  },
  {
    id: '缉叛徒', step: '追缉叛逃真传', kind: 'combat', diff: 3, boost: 1, reward: 70, cd: 6,
    world: '一名真传弟子窃取镇宗功法半卷叛逃，沿途设障断追，据报正藏匿于{place}左近。宗门缉令：功法为上，生死次之。',
    say: '「{daoyou}，家丑不外扬——此事办得越快越静越好。他知道的太多了。」',
    intro: '叛逃真传负隅顽抗，手段狠辣——正是 {enemy}！',
    failSay: '「让他跑了……缉令只能再加价。此獠一日在外，宗门一日难安。」',
  },
  {
    id: '取灵药', step: '禁地取回灵药', kind: 'combat', diff: 3, boost: 1, reward: 75, cd: 6,
    world: '宗门后山禁地深处的一株百年灵药已至成熟之期，然禁地灵兽近年愈发凶戾，历届采药弟子折损不轻。',
    say: '「{daoyou}，药过熟则腐，只在这几日了。老朽这把骨头进不去，全托付你了。」',
    intro: '禁地之中守护灵药的凶兽双目赤红，扑面而来——正是 {enemy}！',
    failSay: '「药没取回来？唉——又要再等一个百年。去把伤养好罢。」',
  },
  // ═══ 普通（二星） ═══
  {
    id: '除妖', step: '属地除妖', kind: 'combat', diff: 2, reward: 45, cd: 3,
    world: '{place}的佃户联名递帖：有妖物夜袭田庄，伤了耕牛数头。属地安稳是宗门的脸面，此类帖子历来当日即批。',
    say: '「{daoyou}，小妖不足惧，难的是别惊了乡民。干净利落，去去就回。」',
    intro: '宗门属地有妖物作乱——正是 {enemy}！',
    failSay: '「区区小妖竟失了手……帖子老朽替你压三日，莫让外门那帮小子知道。」',
  },
  {
    id: '缉弃徒', step: '追捕叛逃弃徒', kind: 'combat', diff: 2, reward: 45, cd: 3,
    world: '一名外门弃徒盗走丹房一炉丹药夜遁，人赃俱在{place}方向。按门规：赃归原处，人送戒律堂。',
    say: '「{daoyou}，抓活的。戒律堂等着问话——丹方从谁手里漏出去的，比丹重要。」',
    intro: '叛逃弃徒狗急跳墙，负隅顽抗——正是 {enemy}！',
    failSay: '「人跑了？丹倒是小事，就怕丹方已经易主……此事记你一过，下不为例。」',
  },
  {
    id: '护药', step: '护送灵药赴坊市', kind: 'combat', diff: 2, reward: 50, cd: 3,
    world: '宗门每岁以灵药易灵石，商队往返{place}官道。近来道上不靖，已有两批货物遭截，坊市那头催货甚急。',
    say: '「{daoyou}，货比命贵——这话难听，可这一车药材换的是全宗下一季的丹钱。」',
    intro: '官道拐弯处杀出劫道的强敌——正是 {enemy}！',
    failSay: '「货……没了？下一季丹房的账，你让老朽怎么做……罢了，人回来就好。」',
  },
  {
    id: '上交聚灵', step: '上交聚灵丹一枚', kind: 'craft', diff: 2, pill: '聚灵丹', reward: 40, cd: 2,
    world: '丹房年考在即，各堂口按例征收聚灵丹充库，以备门中弟子闭关之需。',
    say: '「{daoyou}，丹一枚，贡献照给，童叟无欺。自己炼的买的都行——库房只认丹不认人。」',
    failSay: '「没有丹，老朽也变不出来。备齐了再来。」',
  },
  {
    id: '镇阵', step: '镇守护山大阵', kind: 'patrol', diff: 2, reward: 45, cd: 4, realmMin: 2,
    world: '护山大阵一角阵基年久失修，重修期间需一位«结丹以上»修士以自身法力坐镇阵眼，为期一年。',
    say: '「{daoyou}，坐阵眼是苦差，一年动弹不得——可满宗门数得着修为的，就那么几位。」',
    failSay: '',
  },
  // ═══ 简单（一星） ═══
  {
    id: '采灵草', step: '采集灵草交药园', kind: 'collect', diff: 1, material: '灵草', matN: 2, reward: 20, cd: 1, realmMax: 2,
    world: '药园入秋补种，向门中弟子收购野生灵草续种。此类杂役历来是外门弟子攒贡献的门路。',
    say: '「{daoyou}，灵草两株，须带土的活株。这活计不难，就是费鞋。」',
    failSay: '「草呢？两手空空来交什么差。」',
  },
  {
    id: '采灵花', step: '采集灵花交丹房', kind: 'collect', diff: 1, material: '灵花', matN: 1, reward: 25, cd: 1, realmMax: 2,
    world: '丹房本月开炉，缺灵花为引。告示贴在山门半月，应者寥寥——花期难赶，全凭运气。',
    say: '「{daoyou}，一朵就成，要开得正盛的。谢了——这炉丹等花下锅呢。」',
    failSay: '「没有花，丹就开不了炉。罢了，去催催别人。」',
  },
  {
    id: '上交凝气', step: '上交凝气丹一枚', kind: 'craft', diff: 1, pill: '凝气丹', reward: 30, cd: 2, realmMax: 3,
    world: '外门新收一批弟子，练气所需的凝气丹告罄，各堂口按例征丹。',
    say: '「{daoyou}，新入门的小家伙们等米下锅，匀一枚凝气丹，贡献短不了你的。」',
    failSay: '「没丹啊……那批小子只好再吐纳干熬些时日了。」',
  },
  {
    id: '巡山', step: '巡视宗门属地', kind: 'patrol', diff: 1, reward: 15, cd: 1, realmMax: 3,
    world: '按门规，属地四境每岁须巡视一周：查妖踪、修界碑、访佃户。脚程一年，风雨无阻。',
    say: '「{daoyou}，巡山是笨功夫，可门里的太平，就是一双双脚底板走出来的。」',
    failSay: '',
  },
  {
    id: '守灵田', step: '看守灵田一年', kind: 'patrol', diff: 1, reward: 15, cd: 1, realmMax: 3,
    world: '灵田夜里屡遭野物拱食，田监告到执事堂，讨一位弟子守夜驱兽，为期一年。',
    say: '「{daoyou}，守田清苦，胜在安稳——正好把日课补一补，两不耽误。」',
    failSay: '',
  },
];

/** 执事对玩家的称呼（按职阶，宗主另论）。 */
export function honorificOf(rank: number, isMaster: boolean): string {
  if (isMaster) return '宗主';
  return ['小友', '师弟', '真传', '长老'][Math.max(0, Math.min(3, rank))];
}
