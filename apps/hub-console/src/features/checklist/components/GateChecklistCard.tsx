import { useState, type FormEvent } from 'react';
import type {
  ActorRef,
  BaselineMilestonePublic,
  GateChecklistItem,
  MemberPublic,
} from '@teamhub/hub-contracts';
import type { ChecklistSegment } from '../api';
import {
  useClearChecklistItem,
  useCreateChecklistItem,
  useWaiveChecklistItem,
} from '../hooks';
import type { PageIdentityCtx } from '../../../console-pages';
import { useI18n } from '../../../i18n';
import { humanizeFormError } from '../../../utils';
import { Field } from '../../../components/Field';
import { FormBanner } from '../../../components/FormBanner';
import { memberOptionLabel } from '../../../shared/lib/identity-utils';
import { ChecklistItemFacts, ClearPanel, WaivePanel } from './sub/ChecklistItemPanels';

/**
 * 门详情检查单卡（GATE-CHECKLIST-IOU 设计 §6，D-087）：里程碑清单里每道**门**（kind==='gate'）挂一张
 * 检查单卡——门从「证据+验收」的原子点升级为**检查项容器**。摘要行显示「N 项待清」badge（0 待清不显 badge，
 * 改显中性「检查单」toggle）；展开后逐项列出 title / origin 徽章 / status 徽章 / 留名（本卡刻意不剥名）。
 * 行动作（清偿/豁免）与追加面板已拆到 sub/ChecklistItemPanels（SPLIT-1-TAIL）。
 *
 * 红线：绝不做按人聚合/排行/按人筛选；留名只出现在单条事实卡上（本卡），不进任何统计。
 */

// 匿名模式选人 → ActorRef（source='console'，同 DepGraphPage/TodayPlanTable 的 confirmedBy 先例）。
function toActor(members: readonly MemberPublic[], id: string): ActorRef {
  return { id, displayName: memberOptionLabel(members, id), source: 'console' };
}

export function GateChecklistCard({
  client,
  source,
  seasonId,
  milestone,
  items,
  identity,
  members,
}: {
  client: ChecklistSegment;
  source: string;
  seasonId: string;
  milestone: BaselineMilestonePublic;
  // 已按 anchorMilestoneId===milestone.id 过滤的检查项（含 pending/passed/waived 全状态，供事实回看）。
  items: GateChecklistItem[];
  identity: PageIdentityCtx;
  // 匿名模式清偿/豁免选人的候选来源（身份模式本人一键、不用它）。
  members: MemberPublic[];
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
  // 身份模式已登录 → 清偿/豁免本人一键（服务端注入留名）；否则（匿名模式）走选人供名。
  const isIdentity = identity.mode === 'identity' && identity.session != null;

  const resetPanels = () => {
    setAction(null);
    setActorId('');
    setReason('');
  };

  const clearMutation = useClearChecklistItem(client, source, seasonId, () => {
    resetPanels();
  });
  const waiveMutation = useWaiveChecklistItem(client, source, seasonId, () => {
    resetPanels();
  });
  const addMutation = useCreateChecklistItem(client, source, seasonId, {
    silent: true,
    onSuccess: () => {
      setAddTitle('');
      setAddOpen(false);
    },
  });

  // 清偿点击：身份模式已登录直接一键（本人）；匿名模式展开选人面板。
  const onClearClick = (id: string) => {
    if (writeLocked) return;
    if (isIdentity) {
      clearMutation.mutate({ id, req: {} });
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
    clearMutation.mutate({ id, req: { clearedBy: toActor(members, actorId) } });
  };
  const submitWaive = (id: string) => {
    if (!reason.trim()) return;
    if (!isIdentity && !actorId) return;
    waiveMutation.mutate({
      id,
      req: {
        waiveReason: reason.trim(),
        waivedBy: isIdentity ? undefined : toActor(members, actorId),
      },
    });
  };
  const submitAdd = (event: FormEvent) => {
    event.preventDefault();
    if (writeLocked || !addTitle.trim()) return;
    addMutation.mutate({
      title: addTitle.trim(),
      anchorMilestoneId: milestone.id,
      origin: 'iou',
    });
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
                  <ChecklistItemFacts item={item} />

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

                      {action && action.id === item.id && action.kind === 'clear' ? (
                        <ClearPanel
                          members={members}
                          actorId={actorId}
                          setActorId={setActorId}
                          pending={clearMutation.isPending}
                          error={clearMutation.error}
                          onConfirm={() => submitClear(item.id)}
                          onCancel={resetPanels}
                        />
                      ) : null}

                      {action && action.id === item.id && action.kind === 'waive' ? (
                        <WaivePanel
                          members={members}
                          isIdentity={isIdentity}
                          actorId={actorId}
                          setActorId={setActorId}
                          reason={reason}
                          setReason={setReason}
                          pending={waiveMutation.isPending}
                          error={waiveMutation.error}
                          onConfirm={() => submitWaive(item.id)}
                          onCancel={resetPanels}
                        />
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
              className="btn btn--dashed btn--sm"
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
