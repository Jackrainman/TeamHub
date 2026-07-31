import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Season } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import { useSeasons } from '../../hooks/useRoster';
import type { PageIdentityCtx } from '../../console-pages';
import { useI18n } from '../../i18n';
import { Field } from '../../components/Field';
import { FormActions } from '../../components/FormActions';
import { FormGrid } from '../../components/FormGrid';
import { humanizeFormError, seasonRangeLabel, suggestSeason } from '../../utils';
import { sectionPermission } from './section-permission';

// 赛季（SEASON-CREATE 补链路）：总览页空态文案"先在设置里建一个赛季"此前指向不存在的入口，
// 本分区兑现它——列现有赛季 + 新建表单。新建 = 宣告新的当前赛季（status 服务端钉 active、
// 旧 active 同笔归档，一届一个当前赛季）；queryKey 与总览 BaselineOverview 共享（['seasons', source]），
// 新建成功后 invalidate，总览首屏立即切到新赛季。
export function SeasonsSection({
  client,
  source,
  identity,
}: {
  client: HubApiClient;
  source: string;
  identity: PageIdentityCtx;
}) {
  const { t } = useI18n();
  // 写门锁（照 PoolPage 先例）+ 管理员前置资格判（复审留档 nit 收口，照 K2 前置资格判先例）：
  // 未登录 = loggedOutLocked；身份模式已登录但非 superAdmin = adminLocked（此前只判「是否登录」、漏了
  // 「是否管理员」，导致非管理员点了才撞服务端 403）。两者任一 → 写控件禁用 + 说明。
  const { writeLocked, lockHint } = sectionPermission(identity, t);
  const queryClient = useQueryClient();
  const seasonsQuery = useSeasons(client);

  const [name, setName] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');

  // 赛季建议卡（SEASON-SUGGEST 刀⑨）：无 active 赛季时给一键预填——suggestSeason 派生本届
  // 名称/区间，点击只把三字段填进下方表单（读路径不落库，用户可改后再提交）。
  const suggestion = useMemo(() => suggestSeason(new Date()), []);

  const mutation = useMutation({
    mutationFn: () =>
      client.createSeason({
        name: name.trim(),
        startsAt: `${startsAt}T00:00:00.000Z`,
        endsAt: endsAt ? `${endsAt}T00:00:00.000Z` : null,
      }),
    onSuccess: () => {
      setName('');
      setStartsAt('');
      setEndsAt('');
      void queryClient.invalidateQueries({ queryKey: ['seasons', source] });
    },
  });

  // 结束日期可留空（开季时常未知）；填了则须晚于开始日期（与 server 同判据，前端先挡一层）。
  const orderOk = !startsAt || !endsAt || endsAt > startsAt;
  const valid = Boolean(name.trim() && startsAt && orderOk) && !writeLocked;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid) return;
    mutation.mutate();
  }

  const seasons = seasonsQuery.data?.seasons ?? [];
  const hasActive = seasons.some((s) => s.status === 'active');

  // 预填建议进表单：date input 只吃 YYYY-MM-DD（suggestSeason 的 endsAt 钉 23:59:59.999Z，
  // 截日期段即可，提交时按表单既有规则拼 T00:00:00.000Z，行为与手填一致）。
  function applySuggestion() {
    setName(suggestion.name);
    setStartsAt(suggestion.startsAt.slice(0, 10));
    setEndsAt(suggestion.endsAt.slice(0, 10));
  }

  return (
    <section className="panel settings-panel">
      <div className="panel-header">
        <h2>{t('settings.section.seasons')}</h2>
      </div>
      <div className="settings-section">
        <p className="settings-desc">{t('settings.seasons.desc')}</p>
        {seasonsQuery.isLoading ? (
          <p className="settings-desc" role="status" aria-live="polite">…</p>
        ) : seasons.length === 0 ? (
          <p className="settings-desc">{t('settings.seasons.empty')}</p>
        ) : (
          <div className="adapter-grid">
            {seasons.map((season) => (
              <SeasonRow key={season.id} season={season} />
            ))}
          </div>
        )}
        {!seasonsQuery.isLoading && !hasActive ? (
          <div className="settings-section">
            <p className="settings-desc">
              {t('settings.seasons.suggest', {
                name: suggestion.name,
                range: seasonRangeLabel(suggestion),
              })}
            </p>
            <p>
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={applySuggestion}
                disabled={writeLocked}
              >
                {t('settings.seasons.suggestApply')}
              </button>
            </p>
          </div>
        ) : null}
        {lockHint ? <p className="task-detail__hint">{lockHint}</p> : null}
        <form className="pm-form" onSubmit={submit} title={lockHint ?? undefined}>
          <FormGrid cols={3}>
            <Field label={t('settings.seasons.field.name')} required>
              <input
                value={name}
                placeholder={t('settings.seasons.field.namePlaceholder')}
                onChange={(e) => setName(e.target.value)}
                disabled={writeLocked}
                aria-required
              />
            </Field>
            <Field label={t('settings.seasons.field.startsAt')} required>
              <input
                type="date"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                disabled={writeLocked}
                aria-required
              />
            </Field>
            <Field
              label={t('settings.seasons.field.endsAt')}
              error={!orderOk ? t('settings.seasons.dateOrder') : undefined}
            >
              <input
                type="date"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                disabled={writeLocked}
              />
            </Field>
          </FormGrid>
          <FormActions
            submitLabel={t('settings.seasons.submit')}
            submittingLabel={t('settings.seasons.submitting')}
            submitting={mutation.isPending}
            disabled={!valid}
            error={
              mutation.error
                ? humanizeFormError(mutation.error, t, 'settings.seasons.error')
                : null
            }
            success={
              mutation.isSuccess
                ? t('settings.seasons.success', { name: mutation.data.season.name })
                : null
            }
          />
        </form>
      </div>
    </section>
  );
}

function SeasonRow({ season }: { season: Season }) {
  const { t } = useI18n();
  const range = `${season.startsAt.slice(0, 10)} → ${season.endsAt ? season.endsAt.slice(0, 10) : '…'}`;
  return (
    <article className="adapter-row">
      <div>
        <strong>{season.name}</strong>
        <span>{range}</span>
      </div>
      {/* 已归档=中性灰（U3：非错误态不用红）；进行中=绿。 */}
      <span
        className={`badge badge--wide${season.status === 'active' ? ' badge--green' : ''}`}
      >
        {t(
          season.status === 'active'
            ? 'settings.seasons.status.active'
            : 'settings.seasons.status.archived',
        )}
      </span>
    </article>
  );
}
