// 显式栈替代 DOM data-closing 判定，避免异步退场状态影响模态层级。
const stack: symbol[] = [];

/** 入栈；已存在则忽略（React 严格模式/重开不产生重复项）。 */
export function pushModal(id: symbol): void {
  if (!stack.includes(id)) stack.push(id);
}

/** 出栈；不存在则忽略。 */
export function popModal(id: symbol): void {
  const index = stack.lastIndexOf(id);
  if (index >= 0) stack.splice(index, 1);
}

/** 仅当 id 是当前栈顶（最后入栈且仍在栈内）时为 true。 */
export function isTopModal(id: symbol): boolean {
  return stack.length > 0 && stack.at(-1) === id;
}

/** 仅供单测清理。 */
export function resetModalStack(): void {
  stack.length = 0;
}
