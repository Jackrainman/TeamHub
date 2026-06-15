---
date: 2026-06-14
project: TeamHub hub-server / hub-contracts
relatedFiles: [src/pm-requests.ts]
---

# CreateTaskRequest 字段注入 — 客户端伪造 done / derived（审计 H4）

**症状**：
- 客户端建任务时可注入 status=done / shelved（跳过工作、伪造完成），或 statusSource=derived（冒充系统派生信号、违 C5 派生优先铁律）。

**根因**：
- CreateTaskRequestSchema 未把 status / statusSource 钳到安全 enum 子集，客户端可塞任意特权值并静默落库。

**修复方案**：
- status 钳到 enum(pending | inProgress)；statusSource 钳到 enum(lark | git | console)。
- 非法值 Zod 直接 400 拒，不静默落库；git/lark 派生信号建 inProgress 任务的合法用法仍允许。

**预防**：
- 写请求 schema 必须钳到安全 enum 子集，omit 掉所有 server 派生 / 完成态字段，从结构上杜绝客户端注入特权值。
- 「完成」「派生」这类有信任语义的值，永远由 server 判定，不接受客户端自报。
