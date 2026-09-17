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

这个 Bash 脚本只完成数据库在线快照，exit 0 不代表附件已备份。完整备份包含 SQLite（含 app_settings）、图纸目录、报销凭证目录；附件与数据库必须来自同一停止写入的时间点。

完整备份流程（Windows / Ubuntu 相同；停止实例本身是单独的运维动作）：

1. 停止目标实例写入，确认三个源路径属于该实例，准备一个不存在的新备份目录。
2. 执行 `npm run backup -- <SQLite路径> <图纸目录> <凭证目录> <新备份目录> --stopped`。`--stopped` 是操作者对停写状态的确认，脚本不会停止服务。
3. 确认 exit 0：数据库经 VACUUM INTO、完整性和 schema 校验，两类附件复制后逐文件 SHA-256 校验；备份失败保留现场，不视为成功。
4. 执行 `npm run backup -- --verify <备份目录>` 可再次校验数据库与全部文件清单。

开发测试示例（先结束 `npm run dev`）：

```text
npm run backup -- tmp/dev-data/teamhub.sqlite tmp/dev-data/artifacts tmp/dev-data/evidence tmp/backups/test-001 --stopped
npm run backup -- --verify tmp/backups/test-001
```

恢复演练：将备份中的 teamhub.sqlite、artifacts、evidence 复制到一个全新恢复目录，以独立端口和显式路径启动测试实例，确认业务条目可读、图纸与报销凭证可下载。不得覆盖唯一原始数据，也不要在有写入的恢复目录继续校验旧清单。启动秘密配置另行受控保存，备份工具不读取它们。仅有测试件时仍保留数据，真实使用前必须完成一次应用级恢复演练。

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
- 报销凭证原件按 D-094 在服务端受控留档，必须与数据库同批备份；票据解析仍在浏览器本地。

## 8. 需要审批的操作

SSH、sudo、systemd、反代、80/443、真实部署、tag 删除、真实数据迁移、卷删除和自动发布均需用户明确授权。未经授权只提供命令方案或做本地只读检查。
