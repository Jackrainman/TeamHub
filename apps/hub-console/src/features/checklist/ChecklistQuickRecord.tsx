import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList } from 'lucide-react';
import type { HubApiClient } from '../../api/client';
import type { PageIdentityCtx } from '../../console-pages';
import { useI18n } from '../../i18n';
import { humanizeFormError } from '../../utils';
import { SideDrawer } from '../../components/SideDrawer';
import { SegToggle } from '../../components/SegToggle';
import { Field } from '../../components/Field';
import { Select } from '../../components/Select';
import { FormActions } from '../../components/FormActions';
import { pickDefaultIouAnchor } from './checklist-utils';

/**
 * 全局「快记欠条」入口（GATE-CHECKLIST-IOU 设计 §3，D-087）：顶部工具条一个按钮 → 右侧抽屉
 *（SideDrawer 先例）里 30 秒动线——一句话（title）+ 挑门或挑日期（anchor 二选一），任何人可记。
 * **默认挂接=下一道整车级门**（pickDefaultIouAnchor：最近的未来待过门；无则回落自选日期模式）。
 *
 * 复用总览页同款 queryKey（['seasons',source] / ['baseline',source,seasonId]）→ 零额外请求命中缓存；
 * 提交后失效 ['checklist',source,seasonId]，门详情卡 / 告警区即时刷新。无基准线时整个入口不渲染
 *（欠条须挂在基准线的门/里程碑或自选到期日下，无基准线服务端 404）。
 *
 * 红线：本入口只「记一笔」（创建 pending 欠条），不做任何按人聚合/排行。
 */
export function ChecklistQuickRecord({
  client,
  source,
  identity,
}: {
  client: HubApiClient;
  source: string;
  identity: PageIdentityCtx;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [anchorMode, setAnchorMode] = useState<'gate' | 'date'>('gate');
  const [anchorMilestoneId, setAnchorMilestoneId] = useState('');
  const [anchorDueAt, setAnchorDueAt] = useState('');

  const now = useMemo(() => new Date(), []);

  // 与总览页共享缓存：赛季 + 基准线（同 queryKey）→ 命中缓存不重复请求。
  const seasonsQuery = useQuery({
    queryKey: ['seasons', source],
    queryFn: () => client.getSeasons(),
  });
  const activeSeason = useMemo(() => {
    const seasons = seasonsQuery.data?.seasons ?? [];
    return seasons.find((s) => s.status === 'active') ?? seasons[0];
  }, [seasonsQuery.data]);
  const seasonId = activeSeason?.id;
  const baselineQuery = useQuery({
    queryKey: ['baseline', source, seasonId],
    queryFn: () => client.getBaseline(seasonId as string),
    enabled: Boolean(seasonId),
  });
  const baseline = baselineQuery.data?.baseline ?? null;
  const milestones = useMemo(() => baseline?.milestones ?? [], [baseline]);

  // 挑门候选 = 待过的门（pending gate）；默认锚点 = 最近的未来待过门。
  const gateOptions = useMemo(
    () =>
      milestones
        .filter((m) => m.kind === 'gate' && m.status === 'pending')
        .sort((a, b) => a.plannedAt.localeCompare(b.plannedAt)),
    [milestones],
  );
  const defaultAnchor = useMemo(() => pickDefaultIouAnchor(milestones, now), [milestones, now]);
  const defaultAnchorId = defaultAnchor?.id ?? '';

  // 打开抽屉时初始化：有默认门 → 挂门模式并选中它；无 → 回落自选日期模式。milestones 异步到位后
  // （defaultAnchorId 变化）补一次默认选中。清空自由文本，避免上次残留。
  useEffect(() => {
    if (!open) return;
    setTitle('');
    setAnchorDueAt('');
    if (defaultAnchorId) {
      setAnchorMode('gate');
      setAnchorMilestoneId(defaultAnchorId);
    } else if (gateOptions.length === 0) {
      setAnchorMode('date');
      setAnchorMilestoneId('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultAnchorId]);

  const writeLocked = !identity.canWrite;

  const mutation = useMutation({
    mutationFn: () => {
      // 快记 = 自知的凑合，origin='iou'（欠条）；挂门 / 自选日期二选一。
      const req =
        anchorMode === 'gate'
          ? { title: title.trim(), anchorMilestoneId, origin: 'iou' as const }
          : { title: title.trim(), anchorDueAt: `${anchorDueAt}T00:00:00.000Z`, origin: 'iou' as const };
      return client.createChecklistItem(seasonId as string, req);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['checklist', source, seasonId] });
      setOpen(false);
    },
  });

  const anchorOk =
    anchorMode === 'gate' ? Boolean(anchorMilestoneId) : Boolean(anchorDueAt);
  const valid = Boolean(title.trim() && anchorOk && seasonId);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid || writeLocked) return;
    mutation.mutate();
  }

  // 无基准线（无 seasonId 或未生成模板）时整个入口不渲染——欠条无处可挂（服务端会 404）。
  if (!seasonId || !baseline) return null;

  return (
    <>
      <button
        type="button"
        className="btn btn--secondary btn--sm checklist-quickrecord__trigger"
        onClick={() => setOpen(true)}
      >
        <ClipboardList size={15} aria-hidden="true" /> {t('checklist.quick.open')}
      </button>
      <SideDrawer open={open} onClose={() => setOpen(false)} title={t('checklist.quick.title')}>
        <p className="settings-desc">{t('checklist.quick.desc')}</p>
        <form className="pm-form" onSubmit={submit}>
          <Field label={t('checklist.add.title')} required>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('checklist.add.placeholder')}
              aria-required
            />
          </Field>
          <Field as="div" label={t('checklist.quick.anchor')} hint={t('checklist.quick.anchorHint')}>
            <SegToggle
              value={anchorMode}
              options={[
                { value: 'gate' as const, label: t('checklist.quick.anchor.gate') },
                { value: 'date' as const, label: t('checklist.quick.anchor.date') },
              ]}
              onChange={setAnchorMode}
              ariaLabel={t('checklist.quick.anchor')}
            />
          </Field>
          {anchorMode === 'gate' ? (
            <Field label={t('checklist.quick.anchor.gate')} required>
              {gateOptions.length > 0 ? (
                <Select
                  value={anchorMilestoneId}
                  onChange={setAnchorMilestoneId}
                  options={gateOptions.map((m) => m.id)}
                  renderOption={(id) =>
                    gateOptions.find((m) => m.id === id)?.title ?? id
                  }
                  placeholder={t('checklist.quick.anchor.gatePlaceholder')}
                  ariaLabel={t('checklist.quick.anchor.gate')}
                />
              ) : (
                <p className="form-hint form-hint--warn">{t('checklist.quick.noGate')}</p>
              )}
            </Field>
          ) : (
            <Field label={t('checklist.quick.anchor.date')} required>
              <input
                type="date"
                value={anchorDueAt}
                onChange={(e) => setAnchorDueAt(e.target.value)}
                aria-required
              />
            </Field>
          )}
          <FormActions
            submitLabel={t('checklist.quick.submit')}
            submittingLabel={t('checklist.quick.submitting')}
            submitting={mutation.isPending}
            disabled={!valid || writeLocked}
            lockedHint={writeLocked ? t('identity.writeHint') : null}
            error={
              mutation.error
                ? humanizeFormError(mutation.error, t, 'checklist.quick.error')
                : null
            }
          />
        </form>
      </SideDrawer>
    </>
  );
}
