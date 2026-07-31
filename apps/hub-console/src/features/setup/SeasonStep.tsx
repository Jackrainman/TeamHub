import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { HubApiClient } from '../../api/client';
import { useSeasons } from '../../hooks/useRoster';
import { useI18n } from '../../i18n';
import { humanizeFormError, seasonForYear, seasonYearOptions } from '../../utils';
import {
  seasonFormSubmittable,
  seasonNameYear,
  submitSeasonStep,
  suggestSeasonForm,
  type SeasonForm,
} from './setup-utils';

// ④ 建赛季（WIZARD-SEASON-STEP 刀⑬）：赛季名预填 suggestSeason 可改 + 学期开始（date input，预填推导
// startsAt 的日期段）+ 比赛日（date input，选填）→ createSeason（startsAt=学期开始→ISO、endsAt=suggestSeason
// 推导值，status 服务端钉 active）；两锚点齐（学期开始+比赛日都填）则顺手 generateRoboconBaselineTemplate +
// updateBaseline 落基准线模板；比赛日空只建赛季（提示进 app 后总览可补锚点生成）。已有 active 赛季显示
// 「已有当前赛季」可直接下一步（照 fleet「已有 N 台车」先例）；任何时刻可「跳过」（刀⑨ app 内空态一键创建兜底）。
export function SeasonStep({
  client,
  onNext,
}: {
  client: HubApiClient;
  onNext: () => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const seasonsQuery = useSeasons(client);
  const activeSeason =
    seasonsQuery.data?.seasons.find((s) => s.status === 'active') ?? null;
  const [form, setForm] = useState<SeasonForm>(() => suggestSeasonForm(new Date()));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [created, setCreated] = useState<{ name: string; baselineGenerated: boolean } | null>(
    null,
  );
  const [showCreateForm, setShowCreateForm] = useState(false);

  const submittable = seasonFormSubmittable(form);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!submittable) return;
    setPending(true);
    setError(null);
    try {
      const res = await submitSeasonStep(client, form);
      setCreated({ name: res.season.name, baselineGenerated: res.baselineGenerated });
      void queryClient.invalidateQueries({ queryKey: ['seasons'] });
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="setup-card setup-card--primary">
      <h2 className="setup-card__title">{t('gate.step.season')}</h2>
      <p className="setup-card__desc">{t('gate.season.desc')}</p>
      {seasonsQuery.isLoading ? (
        <p className="settings-desc" role="status" aria-live="polite">…</p>
      ) : activeSeason && !showCreateForm ? (
        <>
          <p className="settings-desc">
            {t('gate.season.hasSeason', { name: activeSeason.name })}
          </p>
          <div className="roster-import__actions">
            <button type="button" className="btn btn--primary" onClick={onNext}>
              {t('gate.season.next')}
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => setShowCreateForm(true)}
            >
              {t('gate.season.createNew')}
            </button>
          </div>
        </>
      ) : created ? (
        <>
          <p className="settings-desc">
            {created.baselineGenerated
              ? t('gate.season.createdWithBaseline', { name: created.name })
              : t('gate.season.createdNoBaseline', { name: created.name })}
          </p>
          <button type="button" className="btn btn--primary" onClick={onNext}>
            {t('gate.season.next')}
          </button>
        </>
      ) : (
        <form onSubmit={(e) => void submit(e)}>
          <label className="gate-field">
            <span>{t('gate.season.name')}</span>
            <select
              value={seasonNameYear(form.name)}
              onChange={(e) => {
                const year = Number(e.target.value);
                const s = seasonForYear(year);
                setForm({
                  ...form,
                  name: s.name,
                  semesterStart: s.startsAt.slice(0, 10),
                  endsAt: s.endsAt,
                });
              }}
            >
              {seasonYearOptions(new Date()).years.map((y) => (
                <option key={y} value={y}>
                  {y}赛季
                </option>
              ))}
            </select>
          </label>
          <label className="gate-field">
            <span>{t('gate.season.semesterStart')}</span>
            <input
              type="date"
              value={form.semesterStart}
              onChange={(e) => setForm({ ...form, semesterStart: e.target.value })}
              required
            />
          </label>
          <label className="gate-field">
            <span>{t('gate.season.competitionDate')}</span>
            <input
              type="date"
              value={form.competitionDate}
              onChange={(e) => setForm({ ...form, competitionDate: e.target.value })}
            />
          </label>
          <p className="settings-desc">{t('gate.season.competitionHint')}</p>
          {form.competitionDate && form.competitionDate <= form.semesterStart ? (
            <p className="form-hint form-hint--warn">{t('gate.season.dateOrder')}</p>
          ) : null}
          {error ? (
            <p className="form-hint form-hint--warn">
              {humanizeFormError(error, t, 'gate.season.error')}
            </p>
          ) : null}
          <div className="roster-import__actions">
            <button
              type="submit"
              className="btn btn--primary"
              disabled={!submittable || pending}
            >
              {pending ? t('gate.season.submitting') : t('gate.season.submit')}
            </button>
            <button type="button" className="btn btn--secondary" onClick={onNext}>
              {t('gate.season.skip')}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
