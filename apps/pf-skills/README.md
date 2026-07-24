# @probeflash/pf-skills

ProbeFlash 业务 skill 调度库。首版只 ship `debug-checklist`（症状 → 检查清单）。

## 公共 API

```typescript
import { createSkillDispatcher } from '@probeflash/pf-skills';

const skills = createSkillDispatcher({ mode: 'mock' });
const reply = await skills.dispatch('自动跑点又歪了');
// → { kind: 'mock', text: '[mock 模式] ...' }
```

## Skill 模式

- `mock`（默认）：本地拼接文案，不调真实 LLM
- `claude`：当前 stub（throw not implemented）；接入真实 Claude provider 后实现
- `deepseek`：当前 stub；接入真实 DeepSeek provider 后实现

详见仓库根 `docs/archive/pre-pivot-plans/2026-05-21-lark-cli-integration-design.md` §3。
