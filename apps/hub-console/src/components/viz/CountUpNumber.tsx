import { useCountUp } from './useCountUp';

/**
 * CountUpNumber – useCountUp 的最小组件包装（VISUAL-VITALITY V1 补，偏离注记见
 * visual-vitality.md §2.3）：让「数字滚动」能塞进任意 ReactNode 槽位（MetricTile value /
 * 倒计时数字），hook 规则不允许在条件分支里直接调 useCountUp。
 */
export function CountUpNumber({ value }: { value: number }) {
  return <>{useCountUp(value)}</>;
}
