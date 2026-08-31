import { useMemo, useState, type FormEvent } from 'react';
import {
  generateRoboconBaselineTemplate,
  type CreateSeasonRequest,
} from '@teamhub/hub-contracts';
import type { BaselineSegment } from '../../baseline';
import { useUpdateBaseline } from '../../baseline';
import { useCreateSeason } from '../../pm/hooks';
import { useI18n } from '../../../i18n';
import { humanizeFormError, seasonRangeLabel, suggestSeason } from '../../../utils';
import { Field } from '../../../components/Field';
import { FormGrid } from '../../../components/FormGrid';
import { FormActions } from '../../../components/FormActions';

interface SeasonCreateClient {
  createSeason(req: CreateSeasonRequest): Promise<unknown>;
}

export function NoSeasonState({
  client,
  onCreated,
}: {
  client: SeasonCreateClient;
  onCreated: () => void;
}) {
  const { t } = useI18n();
  const suggestion = useMemo(() => suggestSeason(new Date()), []);
  const mutation = useCreateSeason(client, suggestion, onCreated);

  return (
    <section className="panel panel--hero baseline-hero">
      <div className="baseline-hero__body">
        <div className="state-band" role="status">{t('overview.baseline.noSeason')}</div>
        <p className="baseline-muted">
          {t('overview.baseline.noSeasonSuggest', {
            name: suggestion.name,
            range: seasonRangeLabel(suggestion),
          })}
        </p>
        <p>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending
              ? t('overview.baseline.noSeasonCreating')
              : t('overview.baseline.noSeasonCreate', { name: suggestion.name })}
          </button>
        </p>
        {mutation.error ? (
          <div className="state-band state-band-error" role="alert">
            {humanizeFormError(mutation.error, t, 'overview.baseline.noSeasonError')}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function BaselineEmptyState({
  client,
  source,
  seasonId,
}: {
  client: BaselineSegment;
  source: string;
  seasonId: string;
}) {
  const { t } = useI18n();
  const [semesterStart, setSemesterStart] = useState('');
  const [competitionDate, setCompetitionDate] = useState('');

  const mutation = useUpdateBaseline(client, source, seasonId);

  const orderOk =
    !semesterStart || !competitionDate || competitionDate > semesterStart;
  const valid = Boolean(semesterStart && competitionDate && orderOk);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid) return;
    mutation.mutate(
      generateRoboconBaselineTemplate({
        semesterStart: `${semesterStart}T00:00:00.000Z`,
        competitionDate: `${competitionDate}T00:00:00.000Z`,
      }),
    );
  }

  return (
    <section className="panel panel--hero baseline-hero">
      <div className="panel-header">
        <h2>{t('overview.baseline.empty.title')}</h2>
      </div>
      <div className="baseline-hero__body">
      <p className="baseline-muted">{t('overview.baseline.empty.desc')}</p>
      <form className="pm-form" onSubmit={submit}>
        <FormGrid>
          <Field label={t('overview.baseline.empty.semesterStart')} required>
            <input
              type="date"
              value={semesterStart}
              onChange={(e) => setSemesterStart(e.target.value)}
              aria-required
            />
          </Field>
          <Field
            label={t('overview.baseline.empty.competitionDate')}
            required
            error={!orderOk ? t('overview.baseline.empty.dateOrder') : undefined}
          >
            <input
              type="date"
              value={competitionDate}
              onChange={(e) => setCompetitionDate(e.target.value)}
              aria-required
            />
          </Field>
        </FormGrid>
        <FormActions
          submitLabel={t('overview.baseline.empty.generate')}
          submittingLabel={t('overview.baseline.empty.generating')}
          submitting={mutation.isPending}
          disabled={!valid}
          error={
            mutation.error
              ? humanizeFormError(mutation.error, t, 'overview.baseline.empty.error')
              : null
          }
          success={mutation.isSuccess ? t('overview.baseline.empty.success') : null}
        />
      </form>
      </div>
    </section>
  );
}
