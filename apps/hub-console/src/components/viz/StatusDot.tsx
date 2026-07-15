/**
 * StatusDot – 语义色状态灯（VISUAL-VITALITY V0）。live=true 时呼吸（vv-breathe，
 * reduced-motion 全局冻结）；tech 主题下自带辉光（styles.css 越界层，辉光预算「状态节点」类）。
 * 纯装饰件：语义文字由调用方相邻展示，故 aria-hidden。
 */
export type VizTone = 'green' | 'amber' | 'red' | 'blue' | 'neutral';

export function StatusDot({ tone, live = false }: { tone: VizTone; live?: boolean }) {
  return (
    <span
      className={`viz-dot viz-dot--${tone}${live ? ' is-live' : ''}`}
      aria-hidden="true"
    />
  );
}
