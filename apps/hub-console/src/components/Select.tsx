/**
 * Select – 固定枚举的极薄封装（FORM-UNIFY B2）。
 *
 * 吐出原生 `<select>`（沿用调用点原 className），统一 options 渲染：
 * - `options`：枚举值数组；每项的可见文案由 `renderOption(value)` 返回（调用点用自己已有的 i18n key，
 *   或 richLabel 拼好的字符串）。本原语**绝不持有 i18n key、绝不硬编码任何文案**。
 * - `placeholder`：可选「冷启动占位 option」（value=""），文案由调用点用自己已有的 key 传入；
 *   不传则不渲染占位项（固定枚举默认值场景）。
 *
 * 泛型 `T extends string` 让 onChange 吐回原枚举字面量类型（调用点照旧 setX(v)）。
 *
 * 反监视 I0：本原语不收、不展示任何成员维度，不提供「选成员打卡」语义。
 */
export function Select<T extends string>({
  value,
  onChange,
  options,
  renderOption,
  placeholder,
  className,
  ariaLabel,
}: {
  value: T | '';
  onChange: (value: T) => void;
  options: readonly T[];
  // 每个枚举值 → 可见文案（调用点已翻译好 / richLabel 拼好）。
  renderOption: (value: T) => string;
  // 可选冷启动占位 option（value=""）的文案；调用点用自己已有的 key 传入。
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <select
      className={className}
      value={value}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {placeholder != null ? <option value="">{placeholder}</option> : null}
      {options.map((opt) => (
        <option value={opt} key={opt}>
          {renderOption(opt)}
        </option>
      ))}
    </select>
  );
}
