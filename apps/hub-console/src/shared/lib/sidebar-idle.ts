export const SIDEBAR_IDLE_MS = 4000;

/** 每次操作从零计时；手动切换和卸载共用取消入口。 */
export function createSidebarIdle(onIdle: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => { clearTimeout(timer); timer = undefined; };
  return {
    cancel,
    arm() {
      cancel();
      timer = setTimeout(() => { timer = undefined; onIdle(); }, SIDEBAR_IDLE_MS);
    },
  };
}
