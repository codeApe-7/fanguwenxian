// 游戏 I/O 接口：核心逻辑只依赖这个抽象，不依赖任何具体渲染实现。
// 终端版由 terminal.ts 实现；将来网页版写一个 WebIO 实现同一接口即可。

export interface GameIO {
  /** 清屏 */
  clear(): void;
  /** 输出一行普通文本 */
  print(text?: string): void;
  /** 剧情旁白（带颜色/打字机效果） */
  narrate(text: string): Promise<void>;
  /** 提问。choices 提供时仅接受其中值；def 为回车时的默认值 */
  ask(question: string, choices?: string[], def?: string): Promise<string>;
  /** 暂停等待回车 */
  pause(): Promise<void>;
}
