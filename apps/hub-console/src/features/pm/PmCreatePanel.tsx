import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { Task, RobotTarget, TaskComplexity } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import type { CreateTaskRequest } from '../../api/schemas/pm';
import { useI18n, type TranslationKey } from '../../i18n';
import { parseList, errorDetail } from '../../utils';
import { Field } from '../../components/Field';
import { FormActions } from '../../components/FormActions';
import { FormGrid } from '../../components/FormGrid';
import { Select } from '../../components/Select';
import { Combobox } from '../../components/Combobox';

const ROBOT_TARGETS: RobotTarget[] = ['R1', 'R2', 'shared'];
// TODO(backend): RobotTarget 枚举目前硬编码 R1/R2/shared；真扩展（增 R3 等）需改 hub-contracts RobotTargetSchema + server 迁移。
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

/**
 * 新建任务表单（作为右侧抽屉 SideDrawer 的内容渲染）。
 * 原录入面板的「连依赖 / 暴露需求」两 tab 已下线——依赖改由依赖图拖拽连线建立（DepGraphPage.onConnect）。
 * I0：只收集结构键 + 「谁负责」，不收集 / 不展示快慢、完成量。
 */
export function PmCreatePanel({
  client,
  tasks,
  onCreated,
}: {
  client: HubApiClient;
  tasks: Task[];
  onCreated: () => void;
}) {
  const { t } = useI18n();
  const defaults = useMemo(
    () => ({
      projectId: tasks[0]?.projectId ?? '',
      groupId: tasks[0]?.groupId ?? '',
    }),
    [tasks],
  );
  const groupOptions = useMemo(
    () => Array.from(new Set(tasks.map((task) => task.groupId))),
    [tasks],
  );
  const [projectId, setProjectId] = useState(defaults.projectId);
  const [groupId, setGroupId] = useState(defaults.groupId);

  // 冷启动修复：tasks 初始为空 → defaults 均为 ''；onCreated → invalidateQueries 重填 tasks 后
  // 已挂载的表单仍持有旧空态。只在字段仍为空时同步，保证不覆盖用户已输入的内容。
  useEffect(() => {
    if (!projectId && defaults.projectId) setProjectId(defaults.projectId);
    if (!groupId && defaults.groupId) setGroupId(defaults.groupId);
  }, [defaults.projectId, defaults.groupId]); // eslint-disable-line react-hooks/exhaustive-deps

  const [title, setTitle] = useState('');
  const [rawSummary, setRawSummary] = useState('');
  const [robotTarget, setRobotTarget] = useState<RobotTarget>('shared');
  const [complexity, setComplexity] = useState<TaskComplexity>('normal');
  const [owner, setOwner] = useState('');
  const [collaborators, setCollaborators] = useState('');

  const mutation = useMutation({
    mutationFn: (req: CreateTaskRequest) => client.createTask(req),
    onSuccess: () => {
      setTitle('');
      setRawSummary('');
      setOwner('');
      setCollaborators('');
      onCreated();
    },
  });

  const valid =
    projectId.trim() && groupId.trim() && title.trim() && rawSummary.trim();

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid) return;
    mutation.mutate({
      projectId: projectId.trim(),
      groupId: groupId.trim(),
      title: title.trim(),
      rawSummary: rawSummary.trim(),
      robotTarget,
      intrinsicComplexity: complexity,
      ownerId: owner.trim() || null,
      collaboratorIds: parseList(collaborators),
    });
  }

  return (
    <form className="pm-form" onSubmit={submit}>
      <FormGrid>
        <Field label={t('pm.field.projectId')} required>
          <input
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            aria-required
          />
        </Field>
        <Field label={t('pm.field.groupId')} required>
          {/* 候选可挑又需手填（groupId 会变）→ Combobox（input+datalist）。 */}
          <Combobox
            value={groupId}
            onChange={setGroupId}
            options={groupOptions}
            ariaLabel={t('pm.field.groupId')}
            required
          />
        </Field>
      </FormGrid>
      <Field label={t('pm.field.title')} required>
        <input value={title} onChange={(e) => setTitle(e.target.value)} aria-required />
      </Field>
      <Field label={t('pm.field.rawSummary')} required>
        <textarea
          rows={2}
          value={rawSummary}
          onChange={(e) => setRawSummary(e.target.value)}
          aria-required
        />
      </Field>
      <FormGrid>
        <Field label={t('pm.field.robotTarget')} className="kb-field--narrow">
          <Select
            value={robotTarget}
            onChange={setRobotTarget}
            options={ROBOT_TARGETS}
            renderOption={(rt) => t(ROBOT_TARGET_KEY[rt])}
          />
        </Field>
        <Field label={t('pm.field.complexity')}>
          <Select
            value={complexity}
            onChange={setComplexity}
            options={COMPLEXITIES}
            renderOption={(c) => t(COMPLEXITY_KEY[c])}
          />
        </Field>
      </FormGrid>
      <FormGrid>
        <Field label={t('pm.field.owner')}>
          <input value={owner} onChange={(e) => setOwner(e.target.value)} />
        </Field>
        <Field label={t('pm.field.collaborators')}>
          <input
            value={collaborators}
            onChange={(e) => setCollaborators(e.target.value)}
          />
        </Field>
      </FormGrid>
      <p className="form-hint">{t('pm.field.actorHint')}</p>
      <FormActions
        submitLabel={t('pm.create.submit.task')}
        submittingLabel={t('pm.create.submitting')}
        submitting={mutation.isPending}
        disabled={!valid}
        error={
          mutation.error
            ? t('pm.create.error', { detail: errorDetail(mutation.error) })
            : null
        }
        success={
          mutation.isSuccess
            ? t('pm.create.success.task', { title: mutation.data.task.title })
            : null
        }
      />
    </form>
  );
}
