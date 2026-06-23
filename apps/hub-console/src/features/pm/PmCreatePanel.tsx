import { useEffect, useMemo, useState, type FormEvent, type ReactNode, type RefObject } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ListPlus, GitFork, HelpCircle } from 'lucide-react';
import type {
  Task,
  RobotTarget,
  TaskComplexity,
  DependencyType,
} from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import { actorFromName } from './actor';
import type {
  CreateTaskRequest,
  CreateDependencyRequest,
  CreateNeedRequest,
} from '../../api/schemas/pm';
import { useI18n, type TranslationKey } from '../../i18n';
import { parseList, errorDetail, segClass } from '../../utils';
import { Field } from '../../components/Field';
import { FormActions } from '../../components/FormActions';
import { FormGrid } from '../../components/FormGrid';
import { Select } from '../../components/Select';
import { Combobox } from '../../components/Combobox';
import { FormEmptyState } from '../../components/FormEmptyState';

type Mode = 'task' | 'dependency' | 'need';

const ROBOT_TARGETS: RobotTarget[] = ['R1', 'R2', 'shared'];
// TODO(backend): RobotTarget 枚举目前硬编码 R1/R2/shared；真扩展（增 R3 等）需改 hub-contracts RobotTargetSchema + server 迁移。
const ROBOT_TARGET_KEY: Record<RobotTarget, TranslationKey> = {
  R1: 'pm.robot.R1',
  R2: 'pm.robot.R2',
  shared: 'pm.robot.shared',
};
const COMPLEXITIES: TaskComplexity[] = ['trivial', 'normal', 'hard'];
const DEP_TYPES: DependencyType[] = ['blocks', 'requires', 'sharesResource'];
const HUMAN_SOURCES = ['human', 'aiSuggested'] as const;

const COMPLEXITY_KEY: Record<TaskComplexity, TranslationKey> = {
  trivial: 'pm.complexity.trivial',
  normal: 'pm.complexity.normal',
  hard: 'pm.complexity.hard',
};
const DEP_TYPE_KEY: Record<DependencyType, TranslationKey> = {
  blocks: 'pm.depType.blocks',
  requires: 'pm.depType.requires',
  sharesResource: 'pm.depType.sharesResource',
};
const SOURCE_KEY: Record<(typeof HUMAN_SOURCES)[number], TranslationKey> = {
  human: 'pm.source.human',
  aiSuggested: 'pm.source.aiSuggested',
};

/** 一个录入面板：布置任务 / 连依赖 / 暴露需求。I0：只收集结构键 + 「谁负责」，不收集/不展示快慢、完成量。 */
export function PmCreatePanel({
  client,
  tasks,
  onCreated,
  panelRef,
}: {
  client: HubApiClient;
  tasks: Task[];
  onCreated: () => void;
  /** 可选 ref：外部（PmBoardPage 冷启动 CTA）滚动聚焦到面板用 */
  panelRef?: RefObject<HTMLElement | null>;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>('task');

  return (
    <section className="pm-create panel" aria-label={t('pm.create.title')} ref={panelRef as RefObject<HTMLElement>}>
      <header className="pm-create__head">
        <div>
          <h2>{t('pm.create.title')}</h2>
          {/* I0 中性说明：强调这是协作真相，不是人效排名。 */}
          <p className="pm-create__note">{t('pm.create.subtitle')}</p>
        </div>
        <div className="seg" role="tablist" aria-label={t('pm.create.title')}>
          <SegButton active={mode === 'task'} onClick={() => setMode('task')} controls="pm-tab-task">
            <ListPlus size={14} aria-hidden="true" /> {t('pm.create.tab.task')}
          </SegButton>
          <SegButton
            active={mode === 'dependency'}
            onClick={() => setMode('dependency')}
            controls="pm-tab-dep"
          >
            <GitFork size={14} aria-hidden="true" /> {t('pm.create.tab.dependency')}
          </SegButton>
          <SegButton active={mode === 'need'} onClick={() => setMode('need')} controls="pm-tab-need">
            <HelpCircle size={14} aria-hidden="true" /> {t('pm.create.tab.need')}
          </SegButton>
        </div>
      </header>

      {mode === 'task' ? (
        <div
          role="tabpanel"
          id="pm-tab-task"
          aria-labelledby="pm-tab-task-btn"
          tabIndex={0}
        >
          <TaskForm client={client} tasks={tasks} onCreated={onCreated} />
        </div>
      ) : mode === 'dependency' ? (
        <div
          role="tabpanel"
          id="pm-tab-dep"
          aria-labelledby="pm-tab-dep-btn"
          tabIndex={0}
        >
          <DependencyForm client={client} tasks={tasks} onCreated={onCreated} />
        </div>
      ) : (
        <div
          role="tabpanel"
          id="pm-tab-need"
          aria-labelledby="pm-tab-need-btn"
          tabIndex={0}
        >
          <NeedForm client={client} tasks={tasks} onCreated={onCreated} />
        </div>
      )}
    </section>
  );
}

function SegButton({
  active,
  onClick,
  controls,
  children,
}: {
  active: boolean;
  onClick: () => void;
  controls: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={`${controls}-btn`}
      aria-selected={active}
      aria-controls={controls}
      className={segClass(active)}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

// --- 布置任务 ---------------------------------------------------------------

function TaskForm({
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
  // 已挂载的 TaskForm 仍持有旧空态。只在字段仍为空时同步，保证不覆盖用户已输入的内容。
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
        <Field label={t('pm.field.projectId')}>
          <input value={projectId} onChange={(e) => setProjectId(e.target.value)} />
        </Field>
        <Field label={t('pm.field.groupId')}>
          {/* 候选可挑又需手填（groupId 会变）→ Combobox（input+datalist）。 */}
          <Combobox
            value={groupId}
            onChange={setGroupId}
            options={groupOptions}
            ariaLabel={t('pm.field.groupId')}
          />
        </Field>
      </FormGrid>
      <Field label={t('pm.field.title')}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label={t('pm.field.rawSummary')}>
        <textarea
          rows={2}
          value={rawSummary}
          onChange={(e) => setRawSummary(e.target.value)}
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

// --- 连依赖 -----------------------------------------------------------------

function DependencyForm({
  client,
  tasks,
  onCreated,
}: {
  client: HubApiClient;
  tasks: Task[];
  onCreated: () => void;
}) {
  const { t } = useI18n();
  const [fromTaskId, setFromTaskId] = useState('');
  const [toTaskId, setToTaskId] = useState('');
  const [type, setType] = useState<DependencyType>('blocks');
  const [source, setSource] = useState<(typeof HUMAN_SOURCES)[number]>('human');
  const [confirmer, setConfirmer] = useState('');

  const mutation = useMutation({
    mutationFn: (req: CreateDependencyRequest) => client.createDependency(req),
    onSuccess: () => {
      setConfirmer('');
      onCreated();
    },
  });

  if (tasks.length < 2) {
    return <FormEmptyState message={t('pm.create.needTwoTasks')} />;
  }

  const fromTask = tasks.find((task) => task.id === fromTaskId);
  const valid = fromTaskId && toTaskId && fromTaskId !== toTaskId && fromTask;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid || !fromTask) return;
    mutation.mutate({
      projectId: fromTask.projectId,
      fromTaskId,
      toTaskId,
      type,
      source,
      // confirmedBy = 录入本人凭证（I0）：填了→「已确认」边参与归因；留空→建议边不传播。读视图永不回显。
      confirmedBy: actorFromName(confirmer),
    });
  }

  const DEP_TYPE_HINT_KEY: Record<DependencyType, TranslationKey> = {
    blocks: 'pm.depType.hint.blocks',
    requires: 'pm.depType.hint.requires',
    sharesResource: 'pm.depType.hint.sharesResource',
  };

  return (
    <form className="pm-form" onSubmit={submit}>
      <FormGrid>
        <Field label={t('pm.field.fromTask')}>
          <TaskSelect tasks={tasks} value={fromTaskId} onChange={setFromTaskId} richLabel />
        </Field>
        <Field label={t('pm.field.toTask')}>
          <TaskSelect tasks={tasks} value={toTaskId} onChange={setToTaskId} richLabel />
        </Field>
      </FormGrid>
      {fromTaskId && toTaskId && fromTaskId === toTaskId ? (
        <p className="form-hint form-hint--warn">{t('pm.create.depSelfEdge')}</p>
      ) : null}
      <FormGrid>
        <Field label={t('pm.field.depType')}>
          <Select
            value={type}
            onChange={setType}
            options={DEP_TYPES}
            renderOption={(dt) => t(DEP_TYPE_KEY[dt])}
          />
          <p className="form-hint">{t(DEP_TYPE_HINT_KEY[type])}</p>
        </Field>
        <Field label={t('pm.field.source')}>
          <SourceSelect value={source} onChange={setSource} />
        </Field>
      </FormGrid>
      <Field label={t('pm.field.confirmer')}>
        <input value={confirmer} onChange={(e) => setConfirmer(e.target.value)} />
      </Field>
      <FormActions
        submitLabel={t('pm.create.submit.dependency')}
        submittingLabel={t('pm.create.submitting')}
        submitting={mutation.isPending}
        disabled={!valid}
        error={
          mutation.error
            ? t('pm.create.error', { detail: errorDetail(mutation.error) })
            : null
        }
        success={mutation.isSuccess ? t('pm.create.success.dependency') : null}
      />
    </form>
  );
}

// --- 暴露需求 ---------------------------------------------------------------

function NeedForm({
  client,
  tasks,
  onCreated,
}: {
  client: HubApiClient;
  tasks: Task[];
  onCreated: () => void;
}) {
  const { t } = useI18n();
  const groupOptions = useMemo(
    () => Array.from(new Set(tasks.map((task) => task.groupId))),
    [tasks],
  );
  const [onTaskId, setOnTaskId] = useState('');
  const [description, setDescription] = useState('');
  const [providerGroup, setProviderGroup] = useState('');
  const [neededSkills, setNeededSkills] = useState('');
  const [source, setSource] = useState<(typeof HUMAN_SOURCES)[number]>('human');
  const [confirmer, setConfirmer] = useState('');

  const mutation = useMutation({
    mutationFn: (req: CreateNeedRequest) => client.createNeed(req),
    onSuccess: () => {
      setDescription('');
      setNeededSkills('');
      setConfirmer('');
      onCreated();
    },
  });

  if (tasks.length < 1) {
    return <FormEmptyState message={t('pm.create.needOneTask')} />;
  }

  const onTask = tasks.find((task) => task.id === onTaskId);
  const valid = onTaskId && description.trim() && onTask;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid || !onTask) return;
    mutation.mutate({
      projectId: onTask.projectId,
      onTaskId,
      description: description.trim(),
      // 归组不归人（A1）：留空 = 还不知道找哪个组。claimedByMemberId 不收集（A2 反派单，server 强制 null）。
      providerGroupId: providerGroup.trim() || null,
      neededSkills: parseList(neededSkills),
      source,
      confirmedBy: actorFromName(confirmer),
    });
  }

  return (
    <form className="pm-form" onSubmit={submit}>
      {/* onTask 与 source 并排同一行（表单密度优化）*/}
      <FormGrid>
        <Field label={t('pm.field.onTask')}>
          <TaskSelect tasks={tasks} value={onTaskId} onChange={setOnTaskId} richLabel />
        </Field>
        <Field label={t('pm.field.source')}>
          <SourceSelect value={source} onChange={setSource} />
        </Field>
      </FormGrid>
      {/* description 保留全宽 */}
      <Field label={t('pm.field.needDescription')}>
        <textarea
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <FormGrid>
        <Field label={t('pm.field.providerGroup')}>
          {/* 候选可挑又需手填（归组、组名会变）→ Combobox。 */}
          <Combobox
            value={providerGroup}
            onChange={setProviderGroup}
            options={groupOptions}
            ariaLabel={t('pm.field.providerGroup')}
          />
        </Field>
        <Field label={t('pm.field.neededSkills')}>
          <input
            value={neededSkills}
            onChange={(e) => setNeededSkills(e.target.value)}
          />
        </Field>
      </FormGrid>
      <Field label={t('pm.field.confirmer')}>
        <input value={confirmer} onChange={(e) => setConfirmer(e.target.value)} />
      </Field>
      <FormActions
        submitLabel={t('pm.create.submit.need')}
        submittingLabel={t('pm.create.submitting')}
        submitting={mutation.isPending}
        disabled={!valid}
        error={
          mutation.error
            ? t('pm.create.error', { detail: errorDetail(mutation.error) })
            : null
        }
        success={mutation.isSuccess ? t('pm.create.success.need') : null}
      />
    </form>
  );
}

// --- 共享小组件 -------------------------------------------------------------

const STATUS_SHORT_KEY: Record<Task['status'], TranslationKey> = {
  pending: 'pm.status.short.pending',
  inProgress: 'pm.status.short.inProgress',
  blocked: 'pm.status.short.blocked',
  done: 'pm.status.short.done',
  shelved: 'pm.status.short.shelved',
};

function TaskSelect({
  tasks,
  value,
  onChange,
  /** richLabel=true 时 option 文案追加状态与所属组，帮区分同名任务 */
  richLabel,
}: {
  tasks: Task[];
  value: string;
  onChange: (id: string) => void;
  richLabel?: boolean;
}) {
  const { t } = useI18n();
  // 固定枚举（任务 id）→ Select；richLabel 作 renderOption 选项保留（追加状态/组帮区分同名任务）。
  // 占位 option 复用既有 pm.field.selectTask 文案。
  return (
    <Select
      value={value}
      onChange={onChange}
      options={tasks.map((task) => task.id)}
      placeholder={t('pm.field.selectTask')}
      renderOption={(id) => {
        const task = tasks.find((tk) => tk.id === id);
        if (!task) return id;
        return richLabel
          ? `[${t(STATUS_SHORT_KEY[task.status])}·${task.groupId}] ${task.title}`
          : task.title;
      }}
    />
  );
}

function SourceSelect({
  value,
  onChange,
}: {
  value: (typeof HUMAN_SOURCES)[number];
  onChange: (s: (typeof HUMAN_SOURCES)[number]) => void;
}) {
  const { t } = useI18n();
  return (
    <Select
      value={value}
      onChange={onChange}
      options={HUMAN_SOURCES}
      renderOption={(s) => t(SOURCE_KEY[s])}
    />
  );
}
