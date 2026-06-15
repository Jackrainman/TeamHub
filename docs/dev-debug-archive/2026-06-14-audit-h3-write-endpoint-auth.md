---
date: 2026-06-14
project: TeamHub hub-server
relatedFiles: [src/server.ts, src/main.ts, deploy/teamhub.env.example]
---

# POST /api/* 写端点零鉴权 — 任意可达者污染治理 / 撑爆 KB（审计 H3）

**症状**：
- 写端点无鉴权、无限流、无 body 上限。非 loopback 暴露后，任意可达客户端可污染治理数据、猛打 closeout 撑爆 KB 文件、伪造回环 actor 身份。

**根因**：
- server 没有写信任边界；main.ts 允许非 loopback 裸暴露未鉴权写端点。

**修复方案**：
- Fastify bodyLimit 256KB + onRequest 钩子（仅 POST /api/*）：配 TEAMHUB_WRITE_TOKEN 则强制 Bearer（401）+ 每 IP 固定窗口限流（429）。
- main.ts：非 loopback 且未配 token → 拒绝启动。
- 反代 / 隧道部署后面须设 TEAMHUB_TRUST_PROXY=true，否则 request.ip 塌成全队单桶、限流退化成 DoS 面。

**预防**：
- 任何可写端点上线前必须有鉴权 + 限流 + body 上限三件套；非 loopback 裸暴露未鉴权写端点 = 拒启动。
- 部署在反代后必开 TRUST_PROXY；token 用 openssl rand -hex 32，不留占位串（见 docs/deploy/RUNBOOK.md）。
