/**
 * 项目页视图联合类型 + 跨页"打开挂单池"意图（TASK-POST-CLAIM，D-088）。
 *
 * 挂单池是项目页内的第三个 tab（board / graph / pool），不是独立导航页；而「我的视图」空态要给一条
 * "去挂单池看看"的跳转（设计 §6）。跨页导航只有 `onNavigate(page)`（App.tsx setPage）、落到项目页会停在
 * 默认视图（graph），无法直接点到 pool tab。故用一个极轻的模块级意图槽：MyView 点链接时先
 * `requestProjectView('pool')` 再 `onNavigate('project')`；ProjectPage 挂载时 `consumeProjectView()`
 * 读取并清空，作为初始视图。SPA 单实例、意图一次性消费，无跨会话/持久化语义（刷新即丢，符合"临时跳转意图"）。
 */

export type ProjectView = 'board' | 'graph' | 'pool';

let pendingView: ProjectView | null = null;

/** 记下"下次打开项目页时切到哪个视图"的意图（MyView 空态跳挂单池用）。 */
export function requestProjectView(view: ProjectView): void {
  pendingView = view;
}

/** 读取并清空一次性视图意图；无意图 → null（ProjectPage 挂载时消费）。 */
export function consumeProjectView(): ProjectView | null {
  const v = pendingView;
  pendingView = null;
  return v;
}
