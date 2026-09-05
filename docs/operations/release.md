---
kind: operations
status: active
domain: release
truth_for: versioning-release-gates-and-artifacts
last_reviewed: 2026-08-15
---

# TeamHub 发布规范

## 1. 当前版本纪律

- 根 `VERSION` 是产品 SemVer 唯一来源，版本只能通过 `scripts/bump-version.sh` 修改。
- 修改 `apps/hub-*/src` 行为：修复 bump PATCH，新增能力 bump MINOR；纯文档不 bump。
- trunk-based，每个可独立验证单元单独 commit；push 前 fetch 检查分叉。
- A0 已删除旧飞书三包，并收成三个 Hub workspace、单根 lock 和与 VERSION 对齐的产品版本。

## 2. 发布门

正式版本至少满足：

- 工作树无非预期修改，根版本与三个 Hub 包一致。
- 三个 Hub 包的 verify 全绿，部署行为通过 e2e 和 `/health.buildId` 检查。
- 当前数据库与 artifact 备份能够读回。
- release notes 只描述用户可见变化、兼容性和已知限制，不伪造“已验证”。
- 安全边界、I0 和报销凭证边界（D-094：解析留浏览器 + 附件不对读者链外泄露）有明确回归场景。

## 3. 发布物

- CURRENT：源码 tag/commit 与 Dockerfile/compose 是现有分发路径。
- TARGET：提供预构建离线 tarball、SHA-256 和简明安装说明；是否携带 Node 二进制按目标 OS/arch 单独决定。
- npm 发布不做：Hub 包是私有内部工作区，不是公共 SDK。
- Docker 镜像可作为有网部署选项，不作为离线主发布物。

## 4. D-090 收敛后的要求

- 单 root workspace、单 lock、单 VERSION，根脚本自动覆盖所有受管包。
- 发布包只携带 console dist、server/contracts 运行时、统一 SQLite 启动路径、artifact 文件服务和运维脚本。
- 不携带 File Store、生产 InMemory fallback、旧飞书三包或多套配置真相。
- 旧数据不兼容是当前架构迁移假设；首次正式发布前必须在 release notes 明示数据重建边界。

## 5. 发布与部署分离

创建 tag/Release 是外部写操作，需要明确授权。发布物验证完成不等于允许部署真实服务器；systemd、反代和真实数据变更另走部署审批。

## 6. 回滚要求

- 每个发布版本必须能定位完整 commit SHA 和版本号。
- 应用回滚与数据恢复分别演练；禁止假设旧应用一定能读取新数据库。
- 引入 schema 变化时，应提供前进策略和恢复边界，即使当前明确不兼容旧测试数据。
- Release 撤回或 tag 删除是破坏性操作，必须单独审批。

## 7. PLANNED

- A0 的 workspace/lock/version 已完成；统一 SQLite 收口后再实现稳定离线打包脚本。
- 1.0 gate 由真实战队部署和恢复演练决定，不由功能数量或文档数量决定。
- CHANGELOG/Release notes 只保留版本结果；实现过程仍由 commit 历史承载。
