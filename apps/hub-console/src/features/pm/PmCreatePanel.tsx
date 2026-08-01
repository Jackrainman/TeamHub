import { useEffect, useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import type {
  Task,
  RobotTarget,
  TaskComplexity,
  InvestmentHorizon,
  InvestmentValue,
  InvestmentTimeAccumulation,
} from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import { useMembers, useGroups } from '../../hooks/useRoster';
import type { CreateTaskRequest } from '../../api/schemas/pm';
import type { PageIdentityCtx } from '../../console-pages';
import { useI18n, type TranslationKey } from '../../i18n';
import { parseList } from '../../utils';
import { useForm } from '../../hooks/useForm';
import { formActionsProps } from '../../hooks/useFormActions';
import { Field } from '../../components/Field';
import { FormActions } from '../../components/FormActions';
import { FormGrid } from '../../components/FormGrid';
import { Select } from '../../components/Select';
import { Combobox } from '../../components/Combobox';
import { defaultOwnerId, memberOptionLabel } from '../../shared/lib/identity-utils';

const ROBOT_TARGETS: RobotTarget[] = ['R1', 'R2', 'shared'];
const ROBOT_TARGET_KEY: Record<RobotTarget, TranslationKey> = {
  R1: 'pm.robot.R1',
  R2: 'pm.robot.R2',
  shared: 'pm.robot.shared',
};
const COMPLEXITIES: TaskComplexity[] = ['trivial', 'normal', 'hard'];
const COMPLEXITY_KEY: Record<TaskComplexity, TranslationKey> = {
  trivial: 'pm.complexity.trivial',
  normal: 'pm.complexity.normal',
  hard: 'pm.complexity.hard',
};

const INVESTMENT_HORIZONS: InvestmentHorizon[] = ['season', 'future'];
const INVESTMENT_HORIZON_KEY: Record<InvestmentHorizon, TranslationKey> = {
  season: 'pm.investment.horizon.season',
  future: 'pm.investment.horizon.future',
};
const INVESTMENT_VALUES: InvestmentValue[] = ['high', 'low'];
const INVESTMENT_VALUE_KEY: Record<InvestmentValue, TranslationKey> = {
  high: 'pm.investment.value.high',
  low: 'pm.investment.value.low',
};
const INVESTMENT_TIMEACCS: InvestmentTimeAccumulation[] = ['high', 'low'];
const INVESTMENT_TIMEACC_KEY: Record<InvestmentTimeAccumulation, TranslationKey> = {
  high: 'pm.investment.timeAcc.high',
  low: 'pm.investment.timeAcc.low',
};

interface PmFormFields {
  projectId: string;
  groupId: string;
  title: string;
  rawSummary: string;
  robotTarget: RobotTarget;
  complexity: TaskComplexity;
  owner: string;
  collaborators: string;
  isInvestment: boolean;
  invHorizon: InvestmentHorizon;
  invValue: InvestmentValue;
  invTimeAcc: InvestmentTimeAccumulation;
}

export function PmCreatePanel({
  client,
  tasks,
  identity,
  onCreated,
  onDirtyChange,
}: {
  client: HubApiClient;
  tasks: Task[];
  identity: PageIdentityCtx;
  onCreated: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { t } = useI18n();
  const groupsQuery = useGroups(client, 'pm-create');
  const groups = useMemo(() => groupsQuery.data?.groups ?? [], [groupsQuery.data]);
  const idToName = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups]);
  const nameToId = useMemo(() => new Map(groups.map((g) => [g.name, g.id])), [groups]);
  const groupOptions = useMemo(() => {
    const assignable = new Set(groupsQuery.data?.assignableGroupIds ?? []);
    const options: string[] = [];
    for (const g of groups) if (assignable.has(g.id)) options.push(g.name);
    for (const task of tasks) {
      if (!idToName.has(task.groupId) && !options.includes(task.groupId)) {
        options.push(task.groupId);
      }
    }
    return options;
  }, [groupsQuery.data, groups, tasks, idToName]);
  const defaults = useMemo(
    () => ({
      projectId: tasks[0]?.projectId ?? '',
      groupId: tasks[0]?.groupId
        ? (idToName.get(tasks[0].groupId) ?? tasks[0].groupId)
        : '',
      ownerId: defaultOwnerId(identity.mode, identity.session),
    }),
    [tasks, identity.mode, identity.session, idToName],
  );
  const membersQuery = useMembers(client, 'pm-create');
  const members = membersQuery.data?.members ?? [];
  const ownerOptions = useMemo(() => members.map((m) => m.id), [members]);

  const form = useForm<PmFormFields>({
    fields: {
      projectId: { initial: defaults.projectId, sticky: true },
      groupId: { initial: defaults.groupId, sticky: true },
      title: { initial: '' },
      rawSummary: { initial: '' },
      robotTarget: { initial: 'shared' as RobotTarget, sticky: true },
      complexity: { initial: 'normal' as TaskComplexity, sticky: true },
      owner: { initial: '', sticky: true },
      collaborators: { initial: '' },
      isInvestment: { initial: false },
      invHorizon: { initial: 'future' as InvestmentHorizon, sticky: true },
      invValue: { initial: 'high' as InvestmentValue, sticky: true },
      invTimeAcc: { initial: 'high' as InvestmentTimeAccumulation, sticky: true },
    },
    valid: (v) => Boolean(v.projectId.trim() && v.groupId.trim() && v.title.trim() && v.rawSummary.trim()),
  });

  useEffect(() => {
    if (!form.values.projectId && defaults.projectId) form.patch({ projectId: defaults.projectId });
    if (!form.values.groupId && defaults.groupId) form.patch({ groupId: defaults.groupId });
    else if (form.values.groupId && idToName.has(form.values.groupId)) {
      form.patch({ groupId: idToName.get(form.values.groupId)! });
    }
  }, [defaults.projectId, defaults.groupId, idToName]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!form.values.owner && defaults.ownerId) form.patch({ owner: defaults.ownerId });
  }, [defaults.ownerId]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = Boolean(
    form.values.title.trim() ||
      form.values.rawSummary.trim() ||
      form.values.owner.trim() !== defaults.ownerId.trim() ||
      form.values.collaborators.trim() ||
      form.values.isInvestment ||
      form.values.projectId.trim() !== defaults.projectId.trim() ||
      form.values.groupId.trim() !== defaults.groupId.trim(),
  );
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty]); // eslint-disable-line react-hooks/exhaustive-deps

  const mutation = useMutation({
    mutationFn: (req: CreateTaskRequest) => client.createTask(req),
    onSuccess: () => {
      form.resetAfterSubmit();
      onCreated();
    },
  });

  const writeLocked = !identity.canWrite;

  const {
    projectId, groupId, title, rawSummary, robotTarget, complexity,
    owner, collaborators, isInvestment, invHorizon, invValue, invTimeAcc,
  } = form.values;

  return (
    <form
      className="pm-form"
      onSubmit={form.handleSubmit(() => {
        if (writeLocked) return;
        mutation.mutate({
          projectId: projectId.trim(),
          groupId: nameToId.get(groupId.trim()) ?? groupId.trim(),
          title: title.trim(),
          rawSummary: rawSummary.trim(),
          robotTarget,
          intrinsicComplexity: complexity,
          ownerId: owner.trim() || null,
          collaboratorIds: parseList(collaborators),
          investment: isInvestment
            ? { horizon: invHorizon, value: invValue, timeAccumulation: invTimeAcc }
            : undefined,
        });
      })}
    >
      <FormGrid>
        <Field label={t('pm.field.projectId')} required>
          <input
            value={projectId}
            onChange={(e) => form.set('projectId', e.target.value)}
            aria-required
          />
        </Field>
        <Field
          label={t('pm.field.groupId')}
          required
          hint={t('pm.field.groupId.hint')}
        >
          <Combobox
            value={groupId}
            onChange={(v) => form.set('groupId', v)}
            options={groupOptions}
            placeholder={t('pm.field.groupId.placeholder')}
            ariaLabel={t('pm.field.groupId')}
            required
          />
        </Field>
      </FormGrid>
      <Field label={t('pm.field.title')} required>
        <input value={title} onChange={(e) => form.set('title', e.target.value)} aria-required />
      </Field>
      <Field label={t('pm.field.rawSummary')} required>
        <textarea
          rows={2}
          value={rawSummary}
          onChange={(e) => form.set('rawSummary', e.target.value)}
          aria-required
        />
      </Field>
      <FormGrid>
        <Field label={t('pm.field.robotTarget')} className="kb-field--narrow">
          <Select
            value={robotTarget}
            onChange={(v) => form.set('robotTarget', v)}
            options={ROBOT_TARGETS}
            renderOption={(rt) => t(ROBOT_TARGET_KEY[rt])}
          />
        </Field>
        <Field label={t('pm.field.complexity')}>
          <Select
            value={complexity}
            onChange={(v) => form.set('complexity', v)}
            options={COMPLEXITIES}
            renderOption={(c) => t(COMPLEXITY_KEY[c])}
          />
        </Field>
      </FormGrid>
      <FormGrid>
        <Field label={t('pm.field.owner')}>
          <Select
            value={owner}
            onChange={(v) => form.set('owner', v)}
            options={ownerOptions}
            renderOption={(id) => memberOptionLabel(members, id)}
            placeholder={t('pm.field.owner.unassigned')}
            ariaLabel={t('pm.field.owner')}
          />
        </Field>
        <Field label={t('pm.field.collaborators')}>
          <input
            value={collaborators}
            onChange={(e) => form.set('collaborators', e.target.value)}
          />
        </Field>
      </FormGrid>
      <Field
        as="div"
        label={t('pm.field.investment')}
        hint={t('pm.field.investment.hint')}
      >
        <label className="pm-check">
          <input
            type="checkbox"
            checked={isInvestment}
            onChange={(e) => form.set('isInvestment', e.target.checked)}
          />
          <span>{t('pm.investment.enable')}</span>
        </label>
      </Field>
      {isInvestment ? (
        <FormGrid>
          <Field label={t('pm.investment.horizon')}>
            <Select
              value={invHorizon}
              onChange={(v) => form.set('invHorizon', v)}
              options={INVESTMENT_HORIZONS}
              renderOption={(v) => t(INVESTMENT_HORIZON_KEY[v])}
            />
          </Field>
          <Field label={t('pm.investment.value')}>
            <Select
              value={invValue}
              onChange={(v) => form.set('invValue', v)}
              options={INVESTMENT_VALUES}
              renderOption={(v) => t(INVESTMENT_VALUE_KEY[v])}
            />
          </Field>
          <Field label={t('pm.investment.timeAcc')}>
            <Select
              value={invTimeAcc}
              onChange={(v) => form.set('invTimeAcc', v)}
              options={INVESTMENT_TIMEACCS}
              renderOption={(v) => t(INVESTMENT_TIMEACC_KEY[v])}
            />
          </Field>
        </FormGrid>
      ) : null}
      <p className="form-hint">{t('pm.field.actorHint')}</p>
      <FormActions
        {...formActionsProps(mutation, {
          submitLabel: t('pm.create.submit.task'),
          submittingLabel: t('pm.create.submitting'),
          valid: form.valid,
          writeLocked,
          lockedHint: t('identity.writeHint'),
          t,
          errorFallbackKey: 'pm.create.error',
          successMessage: mutation.isSuccess
            ? t('pm.create.success.task', { title: mutation.data.task.title })
            : null,
        })}
      />
    </form>
  );
}
