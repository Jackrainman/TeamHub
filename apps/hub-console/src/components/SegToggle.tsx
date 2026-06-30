import { segClass } from '../utils';

/**
 * SegToggle – 二选一 / 多选枚举的分段 toggle 统一原语（FORM-UNIFY B2）。
 *
 * 吐出与旧手拼标记**逐字相同**的 DOM：`div.seg[role=group]` + 每项 `button.seg__btn(/--active)`
 * （active 类经 {@link segClass} 复用，与各处旧写法一致），界面像素级不变。
 *
 * active 态由 `value === option.value` **统一判定**（修易写反的手拼三元 bug 的根因——
 * 不再由调用点各写一遍三元、极性各异）。语义不翻转：哪个选项 value 等于当前 value，哪个高亮。
 *
 * 每项 label 必须是**调用点已翻译好的字符串**；本原语绝不持有 i18n key、绝不硬编码文案。
 *
 * 反监视 I0：本原语不收、不展示任何成员维度，不提供「选成员打卡」语义。
 */
export function SegToggle<T extends string | boolean>({
  value,
  options,
  onChange,
  ariaLabel,
  className,
}: {
  value: T;
  // 每项：枚举值 + 已翻译好的可见文案。
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  ariaLabel?: string;
  // 可选追加类（罕用）；并到 .seg 基类之后。
  className?: string;
}) {
  const base = className ? `seg ${className}` : 'seg';
  return (
    <div className={base} role="group" aria-label={ariaLabel}>
      {options.map((opt) => (
        <button
          // T 可能是 boolean（如 trackIndividually），key 用字符串化保证唯一稳定。
          key={String(opt.value)}
          type="button"
          className={segClass(value === opt.value)}
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
