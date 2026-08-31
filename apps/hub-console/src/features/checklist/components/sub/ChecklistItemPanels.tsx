import type { GateChecklistItem, MemberPublic } from '@teamhub/hub-contracts';
import { useI18n } from '../../../../i18n';
import { Field } from '../../../../components/Field';
import { Select } from '../../../../components/Select';
import { FormBanner } from '../../../../components/FormBanner';
import { humanizeFormError } from '../../../../utils';
import { memberOptionLabel } from '../../../../shared/lib/identity-utils';
import { STATUS_KEY, STATUS_TONE, ORIGIN_KEY } from '../../checklist-item-meta';

/** 单条检查项的静态行（状态/来源徽章 + note + 留名事实），行动作由父级组合。 */
export function ChecklistItemFacts({ item }: { item: GateChecklistItem }) {
  const { t } = useI18n();
  return (
    <>
      <div className="checklist-item__head">
        <span className={`badge badge--xs ${STATUS_TONE[item.status]}`}>
          {t(STATUS_KEY[item.status])}
        </span>
        <strong className="checklist-item__title">{item.title}</strong>
        <span className="badge badge--xs badge--faint">{t(ORIGIN_KEY[item.origin])}</span>
      </div>
      {item.note ? <p className="checklist-item__note">{item.note}</p> : null}
      {/* 留名（事实卡，D-085 事实层永远带名）：清偿人 / 豁免人+理由，本卡刻意不剥名。 */}
      {item.clearedBy ? (
        <p className="checklist-item__actor">
          {t('checklist.clearedBy', { name: item.clearedBy.displayName })}
        </p>
      ) : null}
      {item.waivedBy ? (
        <p className="checklist-item__actor">
          {t('checklist.waivedBy', {
            name: item.waivedBy.displayName,
            reason: item.waiveReason ?? '',
          })}
        </p>
      ) : null}
    </>
  );
}

/** 匿名模式清偿：选人供名面板（照 PmCreatePanel ownerId 选人先例）。 */
export function ClearPanel({
  members,
  actorId,
  setActorId,
  pending,
  error,
  onConfirm,
  onCancel,
}: {
  members: MemberPublic[];
  actorId: string;
  setActorId: (id: string) => void;
  pending: boolean;
  error: Error | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="checklist-panel">
      <Field label={t('checklist.clear.picker')}>
        <Select
          value={actorId}
          onChange={setActorId}
          options={members.map((m) => m.id)}
          renderOption={(id) => memberOptionLabel(members, id)}
          placeholder={t('checklist.picker.placeholder')}
          ariaLabel={t('checklist.clear.picker')}
        />
      </Field>
      <div className="checklist-panel__actions">
        <button
          type="button"
          className="btn btn--primary btn--sm"
          disabled={!actorId || pending}
          onClick={onConfirm}
        >
          {t('checklist.clear.confirm')}
        </button>
        <button type="button" className="btn btn--secondary btn--sm" onClick={onCancel}>
          {t('checklist.cancel')}
        </button>
      </div>
      {error ? (
        <FormBanner kind="err" message={humanizeFormError(error, t, 'checklist.clear.error')} />
      ) : null}
    </div>
  );
}

/** 豁免：填理由（强制非空）；匿名模式另选验收人（名单内）。 */
export function WaivePanel({
  members,
  isIdentity,
  actorId,
  setActorId,
  reason,
  setReason,
  pending,
  error,
  onConfirm,
  onCancel,
}: {
  members: MemberPublic[];
  isIdentity: boolean;
  actorId: string;
  setActorId: (id: string) => void;
  reason: string;
  setReason: (v: string) => void;
  pending: boolean;
  error: Error | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const reviewers = members.filter((m) => m.gateReviewer);
  return (
    <div className="checklist-panel">
      {!isIdentity ? (
        <Field label={t('checklist.waive.picker')} hint={t('checklist.waive.pickerHint')}>
          <Select
            value={actorId}
            onChange={setActorId}
            options={reviewers.map((m) => m.id)}
            renderOption={(id) => memberOptionLabel(members, id)}
            placeholder={t('checklist.picker.placeholder')}
            ariaLabel={t('checklist.waive.picker')}
          />
        </Field>
      ) : null}
      <Field label={t('checklist.waive.reason')} required>
        <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} aria-required />
      </Field>
      <div className="checklist-panel__actions">
        <button
          type="button"
          className="btn btn--primary btn--sm"
          disabled={!reason.trim() || (!isIdentity && !actorId) || pending}
          onClick={onConfirm}
        >
          {t('checklist.waive.confirm')}
        </button>
        <button type="button" className="btn btn--secondary btn--sm" onClick={onCancel}>
          {t('checklist.cancel')}
        </button>
      </div>
      {error ? (
        <FormBanner kind="err" message={humanizeFormError(error, t, 'checklist.waive.error')} />
      ) : null}
    </div>
  );
}
