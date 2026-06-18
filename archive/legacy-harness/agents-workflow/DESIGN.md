---
status: forward-looking
written_at: 2026-05-16
activated_by: docs/planning/workflow-evolution.md §9 4 条 checklist 全部完成
note: 本文件未构成当前工作流约束；激活前 AI 不应据此立任务、不应据此修改 backlog/now.md/decisions.md
---

# ProbeFlash Agent 工作流协议 v1.0

> **目标**: AI 无状态领取任务，自行拆原子任务+plan，批量执行直到全阻塞

---

## 架构三层

```
┌─────────────────────────────────────────────────────────────┐
│  Session Layer (临时，当前聊天)                               │
│  ├── 当前任务上下文                                          │
│  ├── 原子任务plan（AI生成，用户确认）                         │
│  └── 执行决策：commit/并行/阻塞                                │
├─────────────────────────────────────────────────────────────┤
│  Queue Layer (持久化，跨会话)                                │
│  ├── docs/agents/workflow/queue.md  ← 唯一真源              │
│  ├── 任务状态机：ready | claimed | in-progress | blocked | done │
│  └── 依赖图谱：task.claimedBy / task.blockedBy[]              │
├─────────────────────────────────────────────────────────────┤
│  Archive Layer (只读历史)                                    │
│  └── docs/agents/workflow/archive/YYYY-MM-DD-HHMMSS-{task}.md │
└─────────────────────────────────────────────────────────────┘
```

---

## 核心协议

### 1. 入口指令

| 指令 | 行为 |
|------|------|
| **"持续推进"** | 读 queue → 找 ready 任务 → 认领 → 自拆plan → 执行 → 提交 |
| **"确认架构"** | 进入设计阶段，AI出方案，用户拍板 |
| **"统一安装"** | 批量执行所有 env-setup 类任务（npm install等） |

### 2. 任务状态机

```
                    认领失败
ready ──────────► claimed ─────► blocked
  │                  │
  │                  ▼
  │             in-progress ◄─── 执行中
  │                  │
  │                  ▼
  └────────────► verifying
                      │
          ┌───────────┴───────────┐
          ▼                       ▼
        done (归档)           failed
                                      │
                                      ▼
                                扫描可并行任务
```

### 3. 验证失败 → 并行扫描策略

```
当前任务 failed
    │
    ▼
扫描 queue.md 所有任务：
  - 找到所有 ready 且无依赖的
  - 找到所有 blockedBy 仅包含当前任务的
  - 批量认领（最多3个并行）
    │
    ▼
生成批量 plan → 用户确认 → 批量执行
```

### 4. 文件格式规范

**queue.md** (唯一可变源)

```markdown
---
version: 1.0
updated: 2026-05-16T14:30:00+08:00
---

# 任务队列

## Active

### T-001 [ready]
**scope**: lark-gateway architecture
**size**: large  # large | medium | small
**claimedBy**:    # empty = available
**blockedBy**: [] # 依赖任务ID列表
**brief**: 设计飞书网关整体架构，含模块划分、接口定义、数据流图

### T-002 [blocked]
**scope**: types module
**size**: small
**claimedBy**: 
**blockedBy**: [T-001]
**brief**: 实现 TypeScript 类型定义

## Archive

### T-000 [done]
**completed**: 2026-05-16T10:00:00
**brief**: 工作流范式设计
```

**state.md** (运行时状态)

```markdown
---
session: 2026-05-16-001
agent: Claude
---

## 当前会话状态

**claimed**: T-001
**startedAt**: 2026-05-16T14:30:00
**subtasks**: 5  # 自拆的原子任务数
**completedSubtasks**: 2

## 阻塞原因 (如有)

T-001 blocked: 等待用户确认架构设计

## 可并行任务

- T-003: types module (T-001.softDependency)
- T-004: logger stub (no dependency)
```

---

## 原子任务定义

AI 自拆的 plan 必须产出**原子任务**，标准：

```typescript
interface AtomicTask {
  id: string;           // 如 T-001-A1
  action: 'write' | 'edit' | 'run' | 'verify';
  target: string;       // 文件路径或命令
  content?: string;     // 写入内容 (write/edit)
  verify: string;       // 验证命令/条件
  rollback?: string;    // 失败回滚命令
}
```

原子任务**禁止**包含：
- 外部网络请求（npm install / curl 等）
- 交互式输入
- 需要人工判断的"检查"类操作

---

## 批量执行规则

1. **最大并行**: 3 个原子任务
2. **事务边界**: 每个原子任务独立 commit
3. **失败处理**: 
   - 单个失败 → 标记 blocked，记录原因
   - 批量中其他成功 → 正常归档
   - 扫描 queue 找可并行任务继续

---

## Session 结束条件

满足任一即停止：

1. queue 中无 ready 任务
2. 所有 claimed 任务都 blocked 且无新可并行任务
3. 用户明确说"停"

---

## 与现有计划整合

`docs/archive/pre-pivot-plans/2026-05-16-lark-gateway.md`（已退役归档，D-030）→ 拆为 queue.md 中的任务：

| 原 Task | 拆为 Queue Task | size |
|---------|----------------|------|
| Task 1-4 | T-001: 项目初始化 | large |
| Task 2 | T-002: 类型定义 | small |
| Task 3 | T-003: 配置模块 | small |
| Task 4 | T-004: 日志模块 | small |
| Task 5 | T-005: 消息解析 | medium |
| Task 6 | T-006: Skill 执行器 | medium |
| Task 7 | T-007: SSE 管理器 | medium |
| Task 8 | T-008: Feishu 客户端 | medium |
| Task 9 | T-009: Webhook 路由 | medium |
| Task 10 | T-010: 服务器启动 | small |
| Task 11 | T-011: 集成测试 | small |
| Task 12 | T-012: 文档 | small |

---

## 下一步

1. **写 queue.md** - 基于现有 plan 转换
2. **写 state.md** - 初始状态
3. **确认架构** - T-001 进入设计阶段
4. **统一安装** - 预装环境依赖
5. **持续推进** - 开始执行

---

**状态**: [ ] 待用户确认工作流设计
