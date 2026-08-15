import { useEffect, useMemo, useState } from 'react';
import { ClipboardList } from 'lucide-react';
import type { ChecklistSegment } from '../api';
import { useCreateChecklistItem } from '../hooks';
import { pickDefaultIouAnchor } from '../checklist-utils';
import { useBaseline, type BaselineSegment } from '../../baseline';
import { useSeasons, type SeasonsClient } from '../../../hooks/useRoster';
import type { PageIdentityCtx } from '../../../console-pages';
import { useI18n } from '../../../i18n';
import { useForm } from '../../../hooks/useForm';
import { formActionsProps } from '../../../hooks/useFormActions';
import { SideDrawer } from '../../../components/SideDrawer';
import { SegToggle } from '../../../components/SegToggle';
import { Field } from '../../../components/Field';
import { Select } from '../../../components/Select';
import { FormActions } from '../../../components/FormActions';

interface ChecklistFormFields {
  title: string;
  anchorMode: 'gate' | 'date';
  anchorMilestoneId: string;
  anchorDueAt: string;
}

export function ChecklistQuickRecord({
  client,
  baselineClient,
  contextClient,
  source,
  identity,
}: {
  client: ChecklistSegment;
  baselineClient: BaselineSegment;
  contextClient: SeasonsClient;
  source: string;
  identity: PageIdentityCtx;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  const form = useForm<ChecklistFormFields>({
    fields: {
      title: { initial: '' },
      anchorMode: { initial: 'gate' as const },
      anchorMilestoneId: { initial: '' },
      anchorDueAt: { initial: '' },
    },
    valid: (v) => {
      const anchorOk = v.anchorMode === 'gate' ? Boolean(v.anchorMilestoneId) : Boolean(v.anchorDueAt);
      return Boolean(v.title.trim() && anchorOk);
    },
  });

  const now = useMemo(() => new Date(), []);

  const seasonsQuery = useSeasons(contextClient);
  const activeSeason = useMemo(() => {
    const seasons = seasonsQuery.data?.seasons ?? [];
    return seasons.find((s) => s.status === 'active') ?? seasons[0];
  }, [seasonsQuery.data]);
  const seasonId = activeSeason?.id;
  const baselineQuery = useBaseline(baselineClient, source, seasonId);
  const baseline = baselineQuery.data?.baseline ?? null;
  const milestones = useMemo(() => baseline?.milestones ?? [], [baseline]);

  const gateOptions = useMemo(
    () =>
      milestones
        .filter((m) => m.kind === 'gate' && m.status === 'pending')
        .sort((a, b) => a.plannedAt.localeCompare(b.plannedAt)),
    [milestones],
  );
  const defaultAnchor = useMemo(() => pickDefaultIouAnchor(milestones, now), [milestones, now]);
  const defaultAnchorId = defaultAnchor?.id ?? '';

  useEffect(() => {
    if (!open) return;
    form.patch({
      title: '',
      anchorDueAt: '',
      ...(defaultAnchorId
        ? { anchorMode: 'gate' as const, anchorMilestoneId: defaultAnchorId }
        : gateOptions.length === 0
          ? { anchorMode: 'date' as const, anchorMilestoneId: '' }
          : {}),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultAnchorId]);

  const writeLocked = !identity.canWrite;

  const mutation = useCreateChecklistItem(client, source, seasonId, {
    onSuccess: () => setOpen(false),
  });

  const valid = form.valid && Boolean(seasonId);

  if (!seasonId || !baseline) return null;

  const { title, anchorMode, anchorMilestoneId, anchorDueAt } = form.values;

  return (
    <>
      <button
        type="button"
        className="btn btn--secondary btn--sm checklist-quickrecord__trigger"
        onClick={() => setOpen(true)}
      >
        <ClipboardList size={16} aria-hidden="true" /> {t('checklist.quick.open')}
      </button>
      <SideDrawer open={open} onClose={() => setOpen(false)} title={t('checklist.quick.title')}>
        <p className="settings-desc">{t('checklist.quick.desc')}</p>
        <form
          className="pm-form"
          onSubmit={form.handleSubmit(() => {
            if (writeLocked) return;
            const req =
              anchorMode === 'gate'
                ? { title: title.trim(), anchorMilestoneId, origin: 'iou' as const }
                : {
                    title: title.trim(),
                    anchorDueAt: `${anchorDueAt}T00:00:00.000Z`,
                    origin: 'iou' as const,
                  };
            mutation.mutate(req);
          })}
        >
          <Field label={t('checklist.add.title')} required>
            <input
              value={title}
              onChange={(e) => form.set('title', e.target.value)}
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
              onChange={(v) => form.set('anchorMode', v)}
              ariaLabel={t('checklist.quick.anchor')}
            />
          </Field>
          {anchorMode === 'gate' ? (
            <Field label={t('checklist.quick.anchor.gate')} required>
              {gateOptions.length > 0 ? (
                <Select
                  value={anchorMilestoneId}
                  onChange={(v) => form.set('anchorMilestoneId', v)}
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
                onChange={(e) => form.set('anchorDueAt', e.target.value)}
                aria-required
              />
            </Field>
          )}
          <FormActions
            {...formActionsProps(mutation, {
              submitLabel: t('checklist.quick.submit'),
              submittingLabel: t('checklist.quick.submitting'),
              valid,
              writeLocked,
              lockedHint: t('identity.writeHint'),
              t,
              errorFallbackKey: 'checklist.quick.error',
            })}
          />
        </form>
      </SideDrawer>
    </>
  );
}
