---
kind: canonical-domain
status: active
domain: knowledge
truth_for: debugging-closeout-search-and-knowledge-import
last_reviewed: 2026-08-15
---

# Knowledge 领域

## 1. 职责与边界

Knowledge 管调试问题、结案归档、错误条目、知识节点、相似历史召回和 Markdown 文档导入。目标是让调试动作自然沉淀为下一次能找到的线索，而不是另建一张要求事后维护的知识表。

## 2. 当前行为（CURRENT）

- `GET /api/kb/similar` 根据症状、标签、根因和处理词重合返回 top-N 候选及客观 reasons。
- `POST /api/kb/closeout` 要求根因和处理，派生 ArchiveDocument、ErrorEntry 和 KnowledgeNode。
- `POST /api/kb/import-docs` 可导入 Markdown 文档；知识节点可跨赛季使用。
- 相似召回响应固定说明“只列候选，不断言同因”，由人核对后采用。
- KnowledgeNode 和召回投影不含成员维度；来源使用结构链接或 generatedBy 类型。

## 3. 目标结构（TARGET）

- model 保存 Issue/Archive/Error/KnowledgeNode；policies 保存相似排名和结案派生；import 保存 Markdown 适配。
- server service 负责“结案同时写知识与相关治理事实”的事务用例，repository 只持久化知识域。
- console 统一 search/closeout/import 的 hooks 和状态；不接收完整 client。
- Hermes 和飞书只调用公开 use case，不越过服务层直写知识 Store。

## 4. 领域不变式

- 相似检索只给候选、依据和验证动作，不断言根因相同。
- 唯一必要的人工输入是结案根因/处理；缺失时不得伪造完成。
- 不按作者、结案人或成员统计数量、速度和“擅长领域”。
- 跨赛季知识不强绑当前 season；任务关联必须是结构引用。
- AI 可以整理和提取，不能替代实物复现与人工确认。

## 5. 跨域接口

- PM 可引用 Issue/KnowledgeNode，结案可关联 Task，但两域分别拥有自己的状态。
- artifacts 为知识文档、日志、图片和提交提供文件/URI 引用。
- integrations 提供“记一笔”和检索触点，只提交明确输入与确认结果。
- system 提供 actor 凭证和写权限；名字只存在本次事实，不进入召回排序。

## 6. 已知陷阱

- CURRENT 的 closeout route 同时操作治理与 KB Store，缺少明确事务。
- 真实调试时间线自然上游尚未完全接通，不能宣称已经消除额外填写成本。
- 旧设计把知识树浏览、AI 结构化和飞书摄入混在一期；这些仍是后续能力。
- Markdown 导入是资料入口，不代表内容已验证或自动成为规范。

## 7. 未落地差异与 TODO

- `ARCH-UNIFY`：knowledge 模块化，并通过 application transaction 收口跨域 closeout。
- `KB-AI-STRUCT`：积累真实语料后再评估 AI 结构化。
- `KB-LARK-DESIGN`：飞书 wiki/drive 摄入受 `LARK-BIN-PROBE` 阻塞。
- `AXIS-TREE-VIZ`：知识树展示后置，不影响当前相似召回闭环。
