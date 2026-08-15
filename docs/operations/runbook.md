---
kind: operations
status: active
domain: operations
truth_for: backup-upgrade-recovery-and-diagnostics
last_reviewed: 2026-08-15
---

# TeamHub 运维 Runbook

## 1. 操作前门禁

任何重启、重建、升级、数据库切换或卷操作前：

```bash
./scripts/backup-teamhub-data.sh
```

必须确认脚本 exit code 为 0，且 `VACUUM INTO` 产物通过 `integrity_check`、schema 版本与 `schema_kind=unified` 读回。`app_settings` 已包含在数据库中；artifact 文件目录仍须另行 tar/rsync 并校验。

## 2. 日常启动与观察

```bash
./start-teamhub.sh
curl -s http://127.0.0.1:4177/health
curl -s http://127.0.0.1:4177/api/system/status
```

`buildId` 用于确认实际运行的提交，`version` 应与根 `VERSION` 一致。设置页部署信息只能作为辅助；数据能否重启存活必须通过真实写读验证。

## 3. 升级

1. 记录当前 commit/tag、buildId、VERSION 和数据目录。
2. 完成并读回备份。
3. `git fetch`，确认本地与远端没有意外分叉。
4. 切换到目标提交并按发布物要求安装/构建。
5. 重启后检查 buildId、系统状态和关键领域读路径。
6. 写入一条安全测试事实并重启，确认统一 SQLite 真正持久。

## 4. 回滚

- 应用回滚：回到已知 commit/tag，重新构建并以 buildId 确认。
- 数据回滚：先备份事故现场，再从已校验备份恢复。
- Git 工作树修改使用 `git revert` 或明确补丁；禁止未经授权的 `git reset --hard`。
- 数据库或卷恢复禁止覆盖唯一副本，必须保留现场和恢复副本。

## 5. PIN 恢复

优先级：

1. 项目管理员在设置页重置成员 PIN。
2. 唯一管理员无法登录时，在宿主 loopback 调用成员 PIN 重置端点。
3. 服务无法启动时，备份后按当前存储实现执行人工恢复；不得把 PIN/hash 输出到终端记录或文档。

loopback 豁免必须基于真实 socket 地址，不信任远端伪造的转发头。

## 6. 常见故障定位

| 症状 | 首查 |
|---|---|
| 页面仍是旧版本 | `/health.buildId`、静态站路径、实际进程 |
| 重启后数据消失 | `TEAMHUB_DB_FILE`、`hub_data` 挂卷、目录写权限、数据库完整性 |
| 全队写入被限流 | 反代部署是否正确启用 TRUST_PROXY |
| Hermes 401 | loopback credential、token 生命周期、重试是否只一次 |
| 飞书保存失败 | App 凭据、应用审批、chat_id、机器人是否在群内 |
| 文件元数据存在但下载失败 | artifact 目录、文件名、校验和及 metadata/file 写入补偿 |

出现设计/执行异常时，按根 AGENTS 的历史回查协议从 `docs/archive/README.md` 定向查事故/决策，再用记录的 SHA 恢复原上下文。

## 7. 数据安全

- 禁止把 `docker compose down --volumes` 用于真实项目。
- 不删除用户数据，不做破坏性迁移，不在没有恢复演练时合并数据清理与代码升级。
- 备份集合为统一 SQLite、artifact 目录和必要秘密/启动配置；结构化数据库必须使用在线安全的 `VACUUM INTO`，不要直接复制正在写入的 SQLite 文件。
- 发票等报账文件从不在服务端，因此不属于 TeamHub 备份集。

## 8. 需要审批的操作

SSH、sudo、systemd、反代、80/443、真实部署、tag 删除、真实数据迁移、卷删除和自动发布均需用户明确授权。未经授权只提供命令方案或做本地只读检查。
