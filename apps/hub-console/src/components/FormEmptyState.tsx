/**
 * FormEmptyState – 前置条件不足时的统一早退提示（FORM-UNIFY B2）。
 *
 * 吐出与各处旧早退段**逐字相同**的标记：`p.form-hint`（整组级提示），界面像素级不变。
 * 取代散写的 form-hint 早退段（PM 任务<2 / <1、AddLegForm 缺机器人或缺任务的双提示等）。
 *
 * `message` 必须是**调用点已翻译好的字符串**（调用点用自己已有的 i18n key 选好早退文案后传入）；
 * 本原语绝不持有 i18n key、绝不硬编码任何文案。
 *
 * 反监视 I0：本原语不收、不展示任何成员维度。
 */
export function FormEmptyState({ message }: { message: string }) {
  return <p className="form-hint">{message}</p>;
}
