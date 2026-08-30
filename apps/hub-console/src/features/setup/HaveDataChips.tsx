import { useI18n, type TranslationKey } from '../../i18n';

/**
 * ONBOARD-QA chips 分支（2026-08-30 拍板）：CSV/文档批量步开头先问「有现成的 XX 吗」——
 * 「有」展开原上传 UI；「没有，之后弄」记确认卡并直接进下一题。反悔走门级「上一步」回退
 * （已访问步保持挂载，选择态不丢）。
 */
export function HaveDataChips({
  questionKey,
  onHave,
  onLater,
}: {
  questionKey: TranslationKey;
  onHave: () => void;
  onLater: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="setup-chips-block">
      <p className="setup-chips-block__q">{t(questionKey)}</p>
      <div className="setup-chips">
        <button type="button" className="setup-chip" onClick={onHave}>
          {t('gate.qa.yes')}
        </button>
        <button type="button" className="setup-chip setup-chip--ghost" onClick={onLater}>
          {t('gate.qa.no')}
        </button>
      </div>
    </div>
  );
}
