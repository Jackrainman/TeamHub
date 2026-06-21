/**
 * FormBanner – 统一的成功 / 失败反馈条（抽既有 `form-banner` 内联标记）。
 *
 * 吐出与旧内联标记**逐字相同**的类：`form-banner form-banner--ok` / `form-banner form-banner--err`，
 * 故界面像素级不变。err 默认带 `role="alert"`（无障碍读屏即时播报），ok 默认无 role。
 *
 * `message` 必须是**调用点已翻译好的字符串**（调用点自行用已有 i18n key + errorDetail() 组合），
 * 本组件绝不持有 i18n key、绝不硬编码任何文案。
 *
 * 可选 `className` 追加到基类之后，用于保留某些调用点的专有样式（如 Resources 行内 `resources-row-error`），
 * 在不引入新 CSS 的前提下维持像素级一致。可选 `role` / `onClick` 覆盖（如可点关闭的浮层横幅）。
 *
 * 反监视 I0：本原语不收、不展示任何成员维度（owner/confirmer 仅是录入者凭证、非考勤）。
 */
export function FormBanner({
  kind,
  message,
  className,
  role,
  onClick,
}: {
  kind: 'ok' | 'err';
  message: string;
  className?: string;
  role?: string;
  onClick?: () => void;
}) {
  const base = kind === 'ok' ? 'form-banner form-banner--ok' : 'form-banner form-banner--err';
  const resolvedRole = role ?? (kind === 'err' ? 'alert' : undefined);
  return (
    <p
      className={className ? `${base} ${className}` : base}
      role={resolvedRole}
      onClick={onClick}
    >
      {message}
    </p>
  );
}
