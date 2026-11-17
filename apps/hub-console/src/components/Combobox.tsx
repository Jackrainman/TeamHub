import { useId } from 'react';

// 通用组合框（候选 + 手填）：原生 <input list> + <datalist>，零弹层库、贴合既有原生控件风格。
// 可从候选选择，也可直接输入新值；编号变化不需要改代码。
// 受控：value 字符串 + onChange(原始值，调用方按需 .trim())。datalist 在 <input> 之后、视觉不占位。
export function Combobox({
  value,
  onChange,
  options,
  placeholder,
  ariaLabel,
  className,
  required,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  // 必填：透传 aria-required 给 AT（与 Field required 视觉标记配套）。
  required?: boolean;
  // 禁用：总联调模式负责组锁定哨兵组等场景。
  disabled?: boolean;
}) {
  const listId = useId();
  return (
    <>
      <input
        className={className}
        list={listId}
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-required={required || undefined}
        disabled={disabled || undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id={listId}>
        {options.map((o) => (
          <option value={o} key={o} />
        ))}
      </datalist>
    </>
  );
}
