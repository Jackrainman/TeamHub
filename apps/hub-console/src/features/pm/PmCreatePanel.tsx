import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { Task, RobotTarget, TaskComplexity } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import type { CreateTaskRequest } from '../../api/schemas/pm';
import { useI18n, type TranslationKey } from '../../i18n';
import { parseList, humanizeFormError } from '../../utils';
import { Field } from '../../components/Field';
import { FormActions } from '../../components/FormActions';
import { FormGrid } from '../../components/FormGrid';
import { Select } from '../../components/Select';
import { Combobox } from '../../components/Combobox';

// HUB-MODULARIZATION 第4步：Task.robotTarget 已在 hub-contracts 改 optional + 新增泛化槽
// targetLabel（无机器人租户可填自由标签）。本表单暂留硬编码 R1/R2/shared 下拉作 fallback——
// 真正"按租户词汇注入"（VocabularyRegistry 提供选项/翻译）留待 §5 第6步收口，本步不做。
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
  onDirtyChange,
}: {
  client: HubApiClient;
  tasks: Task[];
  onCreated: () => void;
  // 脏状态上抛（FORM-GUARD）：SideDrawer 关闭前用它判断要不要弹确认。可选，不传则不上抛。
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { t } = useI18n();
  const defaults = useMemo(
    () => ({
      projectId: tasks[0]?.projectId ?? '',
      groupId: tasks[0]?.groupId ?? '',
    }),
    [tasks],
  );
  // 组候选：GET /api/groups 全量组列表为主，任务反查的 groupId 兜底合并去重
  // （万一某组还没同步进组表但已有任务引用它，候选里仍要能选中）。
  const groupsQuery = useQuery({
    queryKey: ['groups', 'pm-create'],
    queryFn: () => client.getGroups(),
  });
  const groupOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const g of groupsQuery.data?.groups ?? []) ids.add(g.id);
    for (const task of tasks) ids.add(task.groupId);
    return Array.from(ids);
  }, [groupsQuery.data, tasks]);
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

  // 脏状态：自由文本字段有内容，或 projectId/groupId 已被用户改得偏离自动回填的默认值——
  // 避免冷启动回填本身（见上方 useEffect）被误判成"用户输入过"，害关闭确认无谓弹出。
  const dirty = Boolean(
    title.trim() ||
      rawSummary.trim() ||
      owner.trim() ||
      collaborators.trim() ||
      projectId.trim() !== defaults.projectId.trim() ||
      groupId.trim() !== defaults.groupId.trim(),
  );
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty]); // eslint-disable-line react-hooks/exhaustive-deps

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
        <Field
          label={t('pm.field.groupId')}
          required
          hint={t('pm.field.groupId.hint')}
        >
          {/* 候选可挑又需手填（groupId 会变）→ Combobox（input+datalist）。 */}
          <Combobox
            value={groupId}
            onChange={setGroupId}
            options={groupOptions}
            placeholder={t('pm.field.groupId.placeholder')}
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
            ? humanizeFormError(mutation.error, t, 'pm.create.error')
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
