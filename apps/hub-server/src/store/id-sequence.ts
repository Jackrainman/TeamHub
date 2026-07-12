/**
 * id 生成纯函数模块（STORE-SPLIT-SQLITE，product-redefine-2026-07 §4.4 / §9-③）。
 *
 * **为何独立于任一 Store 实现**：id 生成此前内联在 `InMemoryGovStore`（mock-gov-store.ts:160 一带，
 * 8 个 `xxxSeq: number` 字段 + `` `prefix-${++this.xxxSeq}` `` 散落各 create 方法）——`FileGovStore`
 * 靠组合 `InMemoryGovStore` 才免于重抄一份，但 `SqliteGovStore` 真正接线（SS3 后续刀）时若继续各写各的
 * 计数器逻辑，三实现同一条 L1 纪律（单调自增、id 只增不减、杜绝复用已删 id 撞 FK）会漂三份。
 * 抽成本文件的纯函数后，SQLite 实现可直接复用（即便真实持久层最终换成数据库自增主键 / UUID，
 * 过渡期语义仍由这里单一定义）。
 *
 * 纯度说明：`IdSequence.next()` 本身有内部可变状态（计数器），但**构造函数 `createIdSequence` 是纯的**
 * （无外部副作用、只读入参 `startAt`）——这是「有状态对象由纯工厂函数产出」的常规模式，
 * 与 `Clock`/`FixedClock`（clock.ts）同一类设计。
 */

/** 单调自增计数器句柄：`next()` 每次调用 +1、永不回退（无 reset/decrement 口子）。 */
export interface IdSequence {
  next(): number;
}

/**
 * 从既有 seed 数组长度起步的单调自增序列（L1 纪律，见 mock-gov-store.ts 原注释）：
 * 首条 create 得 `startAt + 1`，与旧 `数组.length + 1` 派生在零删除时逐字等价（无 id 格式回归），
 * 但此后只增不减——杜绝「delete 后复用已删 id 静默撞 FK」的脆弱性。
 */
export function createIdSequence(startAt: number): IdSequence {
  let value = startAt;
  return {
    next(): number {
      return ++value;
    },
  };
}

/**
 * 用序列生成 `` `${prefix}-${n}` `` 形态 id——store 里 `task-new-3` / `sess-new-7` / `kn-cl-2` 等
 * 惯用格式的单一实现（前缀本身不锁死具体拼法，调用方传完整前缀，如 `'task-new'` / `'kn-cl'`）。
 */
export function nextSequentialId(prefix: string, seq: IdSequence): string {
  return `${prefix}-${seq.next()}`;
}
