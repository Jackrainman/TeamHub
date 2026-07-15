import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import type {
  ActorRef,
  BaselineMilestonePublic,
  ChecklistItemStatus,
  ChecklistOrigin,
  GateChecklistItem,
  MemberPublic,
} from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import type { PageIdentityCtx } from '../../console-pages';
import { useI18n, type TranslationKey } from '../../i18n';
import { humanizeFormError } from '../../utils';
import { Field } from '../../components/Field';
import { Select } from '../../components/Select';
import { FormBanner } from '../../components/FormBanner';
import { memberOptionLabel } from '../identity/identity-utils';

/**
 * 门详情检查单卡（GATE-CHECKLIST-IOU 设计 §6，D-087）：里程碑清单里每道**门**（kind==='gate'）挂一张
 * 检查单卡——门从「证据+验收」的原子点升级为**检查项容器**。摘要行显示「N 项待清」badge（0 待清不显 badge，
 * 改显中性「检查单」toggle）；展开后逐项列出 title / origin 徽章（模板/欠条）/ status 徽章 / **留名**
 *（清偿人、豁免人+理由——D-085 事实卡「事实层永远带名」，本卡刻意不剥名）。
 *
 * 行动作（pending 项）：**清偿**（身份模式=本人一键，服务端从会话注入 clearedBy；匿名模式=选人 datalist
 * 供名，照 PmCreatePanel ownerId 选人先例）、**豁免**（点开填理由，强制非空；403 时横幅显示「豁免权属验收
 * 人名单」）；卡级：**本门追加检查项**（title 一格，anchor 预填本门）。
 *
 * 红线：绝不做按人聚合/排行/按人筛选；留名只出现在单条事实卡上（本卡），不进任何统计。
 */

const STATUS_TONE: Record<ChecklistItemStatus, string> = {
  pending: 'badge--amber',
  passed: 'badge--green',
  waived: 'badge--neutral',
};
const STATUS_KEY: Record<ChecklistItemStatus, TranslationKey> = {
  pending: 'checklist.status.pending',
  passed: 'checklist.status.passed',
  waived: 'checklist.status.waived',
};
const ORIGIN_KEY: Record<ChecklistOrigin, TranslationKey> = {
  template: 'checklist.origin.template',
  iou: 'checklist.origin.iou',
};

// 匿名模式选人 → ActorRef（source='console'，同 DepGraphPage/TodayPlanTable 的 confirmedBy 先例）。
function toActor(members: readonly MemberPublic[], id: string): ActorRef {
  return { id, displayName: memberOptionLabel(members, id), source: 'console' };
}

export function GateChecklistCard({
  client,
  seasonId,
  milestone,
  items,
  identity,
  members,
  onChanged,
}: {
  client: HubApiClient;
  seasonId: string;
  milestone: BaselineMilestonePublic;
  // 已按 anchorMilestoneId===milestone.id 过滤的检查项（含 pending/passed/waived 全状态，供事实回看）。
  items: GateChecklistItem[];
  identity: PageIdentityCtx;
  // 匿名模式清偿/豁免选人的候选来源（身份模式本人一键、不用它）。
  members: MemberPublic[];
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  // 单一开启的行动作面板（只一条 item 的 clear/waive 面板同时展开，state 收敛）。
  const [action, setAction] = useState<{ id: string; kind: 'clear' | 'waive' } | null>(null);
  const [actorId, setActorId] = useState('');
  const [reason, setReason] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [addTitle, setAddTitle] = useState('');

  const pendingCount = items.filter((it) => it.status === 'pending').length;
  // 写门（IDENTITY-LITE，I2）：身份模式未登录 → 不可写（禁用动作 + 登录提示）；匿名 / 已登录可写。
  const writeLocked = !identity.canWrite;
  // 身份模式已登录 → 清偿/豁免本人一键（服务端注入留名）；否则（匿名模式）走选人 datalist 供名。
  const isIdentity = identity.mode === 'identity' && identity.session != null;
  const reviewers = members.filter((m) => m.gateReviewer);

  const resetPanels = () => {
    setAction(null);
    setActorId('');
    setReason('');
  };

  const clearMutation = useMutation({
    mutationFn: (vars: { id: string; actor?: ActorRef }) =>
      client.clearChecklistItem(vars.id, seasonId, vars.actor ? { clearedBy: vars.actor } : {}),
    onSuccess: () => {
      resetPanels();
      onChanged();
    },
  });
  const waiveMutation = useMutation({
    mutationFn: (vars: { id: string; waiveReason: string; actor?: ActorRef }) =>
      client.waiveChecklistItem(vars.id, seasonId, {
        waivedBy: vars.actor,
        waiveReason: vars.waiveReason,
      }),
    onSuccess: () => {
      resetPanels();
      onChanged();
    },
  });
  const addMutation = useMutation({
    mutationFn: (title: string) =>
      // anchor 预填本门（anchorMilestoneId=milestone.id）；门追加=自知的凑合，origin='iou'（欠条）。
      client.createChecklistItem(seasonId, {
        title,
        anchorMilestoneId: milestone.id,
        origin: 'iou',
      }),
    onSuccess: () => {
      setAddTitle('');
      setAddOpen(false);
      onChanged();
    },
  });

  // 清偿点击：身份模式已登录直接一键（本人）；匿名模式展开选人面板。
  const onClearClick = (id: string) => {
    if (writeLocked) return;
    if (isIdentity) {
      clearMutation.mutate({ id });
    } else {
      setAction({ id, kind: 'clear' });
      setActorId('');
    }
  };
  const onWaiveClick = (id: string) => {
    if (writeLocked) return;
    setAction({ id, kind: 'waive' });
    setActorId('');
    setReason('');
  };

  const submitClear = (id: string) => {
    if (!actorId) return;
    clearMutation.mutate({ id, actor: toActor(members, actorId) });
  };
  const submitWaive = (id: string) => {
    if (!reason.trim()) return;
    if (!isIdentity && !actorId) return;
    waiveMutation.mutate({
      id,
      waiveReason: reason.trim(),
      actor: isIdentity ? undefined : toActor(members, actorId),
    });
  };
  const submitAdd = (event: FormEvent) => {
    event.preventDefault();
    if (writeLocked || !addTitle.trim()) return;
    addMutation.mutate(addTitle.trim());
  };

  return (
    <div className="checklist-card">
      <button
        type="button"
        className="checklist-card__toggle link-button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {pendingCount > 0 ? (
          <span className="badge badge--xs badge--red">
            {t('checklist.pendingBadge', { count: pendingCount })}
          </span>
        ) : items.length > 0 ? (
          <span className="checklist-card__muted">{t('checklist.toggle.allClear')}</span>
        ) : (
          <span className="checklist-card__muted">{t('checklist.toggle.empty')}</span>
        )}
      </button>

      {open ? (
        <div className="checklist-card__body">
          {items.length > 0 ? (
            <ul className="checklist-items">
              {items.map((item) => (
                <li key={item.id} className="checklist-item">
                  <div className="checklist-item__head">
                    <span className={`badge badge--xs ${STATUS_TONE[item.status]}`}>
                      {t(STATUS_KEY[item.status])}
                    </span>
                    <strong className="checklist-item__title">{item.title}</strong>
                    <span className="badge badge--xs badge--faint">
                      {t(ORIGIN_KEY[item.origin])}
                    </span>
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

                  {item.status === 'pending' ? (
                    <div className="checklist-item__actions">
                      {action && action.id === item.id ? null : (
                        <>
                          <button
                            type="button"
                            className="btn btn--secondary btn--sm"
                            disabled={writeLocked || clearMutation.isPending}
                            onClick={() => onClearClick(item.id)}
                          >
                            {t('checklist.action.clear')}
                          </button>
                          <button
                            type="button"
                            className="btn btn--secondary btn--sm"
                            disabled={writeLocked || waiveMutation.isPending}
                            onClick={() => onWaiveClick(item.id)}
                          >
                            {t('checklist.action.waive')}
                          </button>
                          {writeLocked ? (
                            <span className="checklist-card__muted">{t('identity.writeHint')}</span>
                          ) : null}
                        </>
                      )}

                      {/* 匿名模式清偿：选人供名（照 PmCreatePanel ownerId 选人先例）。 */}
                      {action && action.id === item.id && action.kind === 'clear' ? (
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
                              disabled={!actorId || clearMutation.isPending}
                              onClick={() => submitClear(item.id)}
                            >
                              {t('checklist.clear.confirm')}
                            </button>
                            <button
                              type="button"
                              className="btn btn--secondary btn--sm"
                              onClick={resetPanels}
                            >
                              {t('checklist.cancel')}
                            </button>
                          </div>
                          {clearMutation.error ? (
                            <FormBanner
                              kind="err"
                              message={humanizeFormError(clearMutation.error, t, 'checklist.clear.error')}
                            />
                          ) : null}
                        </div>
                      ) : null}

                      {/* 豁免：填理由（强制非空）；匿名模式另选验收人（名单内）。 */}
                      {action && action.id === item.id && action.kind === 'waive' ? (
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
                            <textarea
                              rows={2}
                              value={reason}
                              onChange={(e) => setReason(e.target.value)}
                              aria-required
                            />
                          </Field>
                          <div className="checklist-panel__actions">
                            <button
                              type="button"
                              className="btn btn--primary btn--sm"
                              disabled={
                                !reason.trim() ||
                                (!isIdentity && !actorId) ||
                                waiveMutation.isPending
                              }
                              onClick={() => submitWaive(item.id)}
                            >
                              {t('checklist.waive.confirm')}
                            </button>
                            <button
                              type="button"
                              className="btn btn--secondary btn--sm"
                              onClick={resetPanels}
                            >
                              {t('checklist.cancel')}
                            </button>
                          </div>
                          {waiveMutation.error ? (
                            <FormBanner
                              kind="err"
                              message={humanizeFormError(waiveMutation.error, t, 'checklist.waive.error')}
                            />
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="checklist-card__muted">{t('checklist.card.empty')}</p>
          )}

          {/* 本门追加检查项（title 一格，anchor 预填本门）。 */}
          {addOpen ? (
            <form className="checklist-add" onSubmit={submitAdd}>
              <Field label={t('checklist.add.title')} required>
                <input
                  value={addTitle}
                  onChange={(e) => setAddTitle(e.target.value)}
                  placeholder={t('checklist.add.placeholder')}
                  aria-required
                />
              </Field>
              <div className="checklist-panel__actions">
                <button
                  type="submit"
                  className="btn btn--primary btn--sm"
                  disabled={writeLocked || !addTitle.trim() || addMutation.isPending}
                >
                  {t('checklist.add.confirm')}
                </button>
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  onClick={() => {
                    setAddOpen(false);
                    setAddTitle('');
                  }}
                >
                  {t('checklist.cancel')}
                </button>
              </div>
              {writeLocked ? (
                <span className="checklist-card__muted">{t('identity.writeHint')}</span>
              ) : null}
              {addMutation.error ? (
                <FormBanner
                  kind="err"
                  message={humanizeFormError(addMutation.error, t, 'checklist.add.error')}
                />
              ) : null}
            </form>
          ) : (
            <button
              type="button"
              className="btn btn--dashed btn--sm checklist-add__trigger"
              onClick={() => setAddOpen(true)}
            >
              {t('checklist.add.open')}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
