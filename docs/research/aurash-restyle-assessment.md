---
title: console 换 Aurash 风格 UI 可行性 / 适配性评估
status: deferred
date: 2026-06-15
sources:
  - /home/winbeau/wenbiao_zhao/Aurash/frontend（= xju-feiyue 参考项目，AGENTS §2 业务模型禁搬入）
  - apps/hub-console/src（styles.css / App.tsx / features/* / i18n / dep-graph）
  - workflow wf_0d35c8af-968（2 sonnet 侦察 + 3 opus 对立视角 + 1 opus 综合）
related_decisions:
  - D-060
---

# console 换 Aurash 风格 UI —— 评估结论

> **结论：PILOT-FIRST（先试点一页，别整站重写）。当前低优先级，业务逻辑先行。**
> 本文为已完成调研的落档；动手与否见 D-060，须先过决策门。评估期间**零 UI 代码改动**。
>
> **更新（2026-06-16，D-068）**：Phase 0（换 token + 字体）已落地，但不是「一次性替换」，而是按用户诉求做成**设置页运行时风格切换器**（经典绿 / 暖纸，opt-in、默认经典）。纯 CSS-variable 双 token（`:root[data-theme='warm']`），架构镜像 i18n 语言切换；**未碰** Tailwind/Radix/试点页/整站迁移——表 1 里 Phase 0 之后的行仍按决策门待定。已知限制：dep-graph `EDGE_COLORS`（JS 常量）不随主题变。

## 0. 一句话

技术上干净可行，但**值不值一分为二**：换 token + 字体的「暖纸风」是 <1 天、零框架风险、拿 80% 视觉收益的真升级；全套 Tailwind+Radix+shadcn 是 7–14 人天、只在 a11y 两处有真收益的工程，对一个在跑、双语、~10–20 人用的 5 页内部工具属过度工程默认不做。先做 Phase 0，再用一页试点 + 决策门验证是否往下走。

## 1. 可行性 + 工作量（①）

- 关键事实（已对代码核实）：单文件 `styles.css` **1392 行**；`@xyflow/react/dist/style.css` 在 `DepGraphPage.tsx:17` 导入；`EDGE_COLORS`/`NODE_W(212)`/`NODE_H(96)` 是 JS 常量（CSS 重写碰不到，要手改）；Tailwind/Radix/shadcn/next-themes/sonner 当前**全无**（需 greenfield 脚手架）。
- **共存唯一关键开关 = `corePlugins:{preflight:false}`**——否则 Tailwind reset 砸烂 xyflow 的 Controls/Background/Handle 与 styles.css 盒模型。两套选择器不相交（BEM `.dag-node--*` vs 工具类 `.flex/.gap-4`）故可共存。

| 阶段 | 工作量 | 风险 |
|---|---|---|
| Phase 0：换 ~15 个 `:root` token + 2 字体 | 0.25–0.5 天，0 .tsx / 0 依赖 | 近零，拿 ~80% 视觉收益 |
| Tailwind-only 脚手架（preflight:false + token 桥） | ~0.5–1 天 | 低 |
| 试点 1 页 | ~1–1.5 天 | 低 |
| 试点后整站 Tailwind-only 迁移 | **9–14 人天**（DepGraph 外壳占 1.5–3 天） | 大 diff |
| 全套 19-Radix + shadcn + sonner + next-themes（Option C） | 2–4 人周，+60–100KB gzip JS | 过度工程 ❌ |

## 2. 适配性 / 值不值（②）

- **值（token + 字体层）**：暖纸编辑风（serif 标题 + 米色面 #f7f6f3 + 近黑字 #37352f + 发丝线）比现在的绿黑功能风是真升级，<1 天零组件改动拿到。
- **默认不值（全套框架）**：console 是近乎冻结的 5 页内部工具（INV 是唯一待开导航位），"页面多/贡献者多"的复利论据不成立。唯一真工程收益是 **a11y**：录入浮层有 `role=dialog`/`aria-modal` 但**无焦点陷阱、无 Esc、无焦点恢复**，全表仅 ~9 条 focus 规则——Radix 能免费修，但只在浮层/表单 + 设置页 select **两处**有意义，不是 5 页都要。

## 3. 风险（③，按代价×概率排）

1. **I0/反排名文案被悄悄删（代价最高）**：3 条承重串已核实——`depgraph.entry.note`(:113/388)、`depgraph.detail.ownerNote`(:116/391)、`pm.create.subtitle`(:206/476)，加结构不变式（ownerLabel 不上节点脸、看板无人均列、`claimedByMemberId` 强制 null）。AGENTS §5 / D-056 铁律。**编译器抓得到"缺 key"、抓不到"删了仍定义的死串"** → 必须 PR 清单 + 人审。
2. **大 diff 回归（概率高）**：整站 ~11 文件、共享类涟漪（`.kb-field` 3 处、`.seg` 5 处）。缓解=逐页 PR、每步 verify:all 绿、绝不大爆炸。测试只断言 API 不断言 DOM → **verify:all 抓不到视觉破坏**，靠 4177 并排。
3. **@xyflow 渲染破裂（中、可避免）**：`preflight:false` 第一天设并验证；`.dag-node--blocked-idle` 斜纹渐变（被卡 vs 结构缺口语义区分）**必须留手写 CSS**；EDGE_COLORS 改色手改 .tsx。
4. **xju-feiyue 业务模型污染（硬停）**：**绝不整体拷 tokens.css**。禁 `cat-*`/`tag-*`/`ai-add-*`/`chart-*` token、MegaMenu/credits/conferences/schools/admin 组件、飞跃品牌文案。只有 ~12 中性结构 token + 通用 `ui/` primitive 可手挑过来（AGENTS §2）。

## 4. 分阶段建议（④，试点一页→设门）

- **Phase 0**（0.25–0.5 天，可单独交付）：换 token + 字体。纯 CSS，不碰 .tsx/依赖/I0/xyflow。只想要"好看"到此为止。
- **试点**（~1–1.5 天，看完 Phase 0 还想要 Radix UX 才做）：搭 Tailwind-only（preflight:false + token 桥进 `tailwind.config`），只重写 **OverviewPage**——已核实零共享 primitive（无 `.seg`/`.kb-field`/`status-pill`/`dag-node`）、纯读视图、不含 3 条 I0 串、无 @xyflow，在最小失败面跑通整套共存机制。**不挑 SettingsPage**（耦合 `.seg`+`.kb-field`，会逼着过早决定 4–5 页依赖的 primitive）。
- **决策门**（全满足才整站）：(a) verify:all 绿；(b) 4177 并排，团队主观签字认可；(c) bundle 增量可接受；(d) 其余四页无 styles.css/xyflow 回归。门不过 → 停在 Phase 0。
- 门过后逐页：KbSearch+PmBoard → 两写表单（共享 `.kb-field`/`.seg`）→ SettingsPage → **DepGraph 外壳最后**（dag-node 块不动）。**绝不拿 DepGraph 当试点。**
- **明确不做**：react-router 迁移（保留 useState 切页）、暗色模式（两边都浅色）、全套 Option C。

## 5. 三视角分歧

都落 pilot-first、都同意 Phase 0 是高 ROI 核心、都判 Option C 过度工程。分歧：质疑派"Phase 0 之后接近 NO-GO"，拥护派最看重 a11y，务实派把 Tailwind 当可回退实验；试点页拥护/质疑选 Settings，务实派用代码证据（共享 primitive 耦合）否决 → 综合采纳 **OverviewPage**。
