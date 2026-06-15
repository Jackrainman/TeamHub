# legacy-harness — overhaul 前的 TeamHub harness（冻结快照 + 串行轨 fallback）

> harness 全改（`decisions.md` D-066）时，被 CC-centric 精简主手册替换掉的旧 harness 的**唯一**归档处，
> 同时是**非 Claude Code 串行轨编排（Codex / OpenCode）的 fallback**。先 copy 进来、archive 自含可跑后
> 才从主干移除（见 D-066 ADR 执行顺序）。

## 内容

| 文件 | 是什么 | 在主干被谁取代 |
|---|---|---|
| `AGENTS-serial.md` | 冻结的完整原 `AGENTS.md`（双轨 §6.A/B/C + self-iterate + §6.0 底座 + 验证/安全/宪法/真实性全内联，自含） | 根 `AGENTS.md`（精简 CC-centric） |
| `skills/atomic-task/` | §6.A 串行轨 skill | 精华折进 `AGENTS-serial.md` §6.0+§6.A；主手册铁律 |
| `skills/continuous-build/` | §6.B 连续轨 skill | CC 直接用 `Workflow`，不再需要显式 skill |
| `skills/self-iterate/` | §6.C 自迭代外环 skill | 退役（D-039 AI 已退治理，自迭代外环不再驱动产品方向） |
| `completion-model.yaml` | self-iterate 完成度谓词燃料 | 退役 |
| `agent-state.json` | 非权威活状态缓存 | 退役（`now.md` 是唯一真相，不再维护派生缓存） |
| `sync-skills.sh` / `verify-skills-sync.sh` | `.agents/skills` ↔ `.claude/skills` 双源镜像机器 | 单一 skills 位置后不再需要 |

## 给 Codex / OpenCode 串行轨

直接读 `AGENTS-serial.md`、跟随其 §6.0 + §6.A，**不需要**根 `AGENTS.md`。planning 真相源
（`now.md` / `backlog.md` / `decisions.md`）仍在 `docs/planning/`。退役 skill 的副本在本目录 `skills/`。

## 复活

若未来恢复双轨 / self-iterate（如确认 AI 重新参与治理判断、或重新支持需要显式三轨脚手架的弱工具），
从本目录 + git 历史捞回，别凭记忆重写。
