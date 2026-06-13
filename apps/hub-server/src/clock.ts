/**
 * 服务器时钟注入点：治理派生快照在「某一时刻」求值（被卡天数 / 沉默等都相对 now）。
 * mock-first 阶段默认 FixedClock 钉在 fixture 场景时间（见 server.ts），让派生结果稳定且与
 * hub-console mock 同口径；真实数据接入后改注入 RealClock。
 */
export interface Clock {
  now(): Date;
}

export class RealClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class FixedClock implements Clock {
  constructor(private readonly fixed: Date) {}

  now(): Date {
    return this.fixed;
  }
}
