---
date: 2026-06-14
project: TeamHub hub-server / compose
relatedFiles: [compose.yaml, deploy/teamhub.env.example]
---

# compose 幻影 Postgres + KB 不挂卷 → 重启丢全部语料（审计 H5 / M11）

**症状**：
- compose 起一个 hub-server 从不读的 Postgres，白等 ~60s 健康重试 + 一个没用的容器，并误导运维以为治理数据进了 PG。
- KB 不挂卷，容器重启静默丢全部 IssueCard / ErrorEntry / ArchiveDocument，破「AI+知识库闭环」前提。

**根因**：
- hub-server 无 PG 客户端、从不读 DATABASE_URL；compose 却配了 depends_on / DATABASE_URL / pg_data。
- 有状态的 KB 语料没挂命名卷，落在容器可写层、重启即没。

**修复方案**：
- 删幻影 Postgres（服务 / depends_on / DATABASE_URL / pg_data）。
- 接 KB 持久：TEAMHUB_KB_DATA_FILE + hub_kb 卷；env.example 补 token + KB 路径。

**预防**：
- compose 里不留任何不被代码读的服务（白等健康检查 + 误导运维）。
- 有状态数据（KB / gov）必须挂命名卷，否则重启清零——与 A1（start-teamhub.sh 漏接 gov 落盘 env）同源教训：落盘机制必须在**真实部署路径**上接通，不能只在代码里存在。
