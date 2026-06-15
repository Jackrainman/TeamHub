---
date: 2026-06-14
project: TeamHub hub-server / hub-contracts
relatedFiles: [src/attribution.ts, src/server.ts]
---

# 依赖图成环 → GET /api/dep-graph 派生死循环卡死 server（审计 H1）

**症状**：
- POST /api/dependencies 能建出自环 / 成环的依赖边（后端落库前零语义校验）。
- 下次 GET /api/dep-graph 的 computeCriticalSet 回溯无 visited 守卫，遇环进入死循环，单个请求卡死整个 server（单请求 DoS）。

**根因**：
- computeCriticalSet 关键路径回溯没有 visited 守卫，已有环就无限回溯。
- POST /api/dependencies 落库前不校验，自环 / 成环边直接进快照。

**修复方案**：
- computeCriticalSet 回溯加 visited 守卫，防已有环死循环。
- 新增纯函数 wouldCreateCycle（自环 + DFS 可达判定，自身 DoS 安全）。
- POST /api/dependencies 落库前拒自环 / 成环（400）；前端 onConnect 也客户端守一道。

**预防**：
- 「图遍历 + 用户可写边」的组合：遍历必须自带 visited 守卫，写入必须落库前校验无环，两道都要。
- 任何接受用户构造有向边的端点，把「成环」当一等校验项，不是事后才想起。
