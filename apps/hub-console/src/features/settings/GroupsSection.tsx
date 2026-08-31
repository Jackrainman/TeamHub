import { useState, type FormEvent } from 'react';
import type { Group } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import { useGroups } from '../../features/pm/hooks';
import type { PageIdentityCtx } from '../../console-pages';
import { useI18n } from '../../i18n';
import { Field } from '../../components/Field';
import { FormActions } from '../../components/FormActions';
import { FormGrid } from '../../components/FormGrid';
import { humanizeFormError } from '../../utils';
import { sectionPermission } from './section-permission';
import { useGroupMutations } from './hooks';

// 组（PROGRAM-GROUP-ABSTRACT 刀④，D-072「设置页可增减组」前置缺口的最小版）：列**全量**组（组树展示
// 需要非叶子/哨兵在场），用 server 派生位 `assignableGroupIds`（叶子组且非哨兵）分两类——叶子组=可选组
// （可领任务/挂人），可改名、可删除；非叶子/哨兵组=汇报视角，标注「不出现在选择」、不给改删控件。
// 删除防孤儿（有成员/有子组/有任务 → 409）与非叶子拦截都在服务端 store 同一临界区判，detail 透出到表单。
export function GroupsSection({
  client,
  source,
  identity,
}: {
  client: HubApiClient;
  source: string;
  identity: PageIdentityCtx;
}) {
  const { t } = useI18n();
  // 写门锁 + 管理员前置资格判（照赛季/成员分区同律）：未登录 或 身份模式非持旗 → 写控件禁用 + 说明。
  const { writeLocked, lockHint } = sectionPermission(identity, t);
  const groupsQuery = useGroups(client, source);

  const [name, setName] = useState('');
  const { createMutation, renameMutation, deleteMutation } = useGroupMutations(client, {
    createName: name,
    onCreateSuccess: () => setName(''),
  });

  const valid = Boolean(name.trim()) && !writeLocked;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid) return;
    createMutation.mutate();
  }

  const groups = groupsQuery.data?.groups ?? [];
  const assignable = new Set(groupsQuery.data?.assignableGroupIds ?? []);

  return (
    <section className="panel settings-panel">
      <div className="panel-header">
        <h2>{t('settings.section.groups')}</h2>
      </div>
      <div className="settings-section">
        <p className="settings-desc">{t('settings.groups.desc')}</p>
        {groupsQuery.isLoading ? (
          <p className="settings-desc" role="status" aria-live="polite">…</p>
        ) : groups.length === 0 ? (
          <p className="settings-desc">{t('settings.groups.empty')}</p>
        ) : (
          <div className="adapter-grid">
            {groups.map((group) => (
              <GroupRow
                key={group.id}
                group={group}
                assignable={assignable.has(group.id)}
                writeLocked={writeLocked}
                lockHint={lockHint}
                renaming={renameMutation.isPending && renameMutation.variables?.id === group.id}
                deleting={deleteMutation.isPending && deleteMutation.variables?.id === group.id}
                onRename={(newName) => renameMutation.mutate({ id: group.id, name: newName })}
                onDelete={() => {
                  if (
                    window.confirm(
                      t('settings.groups.delete.confirm', { name: group.name }),
                    )
                  ) {
                    deleteMutation.mutate({ id: group.id });
                  }
                }}
              />
            ))}
          </div>
        )}
        {renameMutation.error ? (
          <p className="form-hint form-hint--warn">
            {humanizeFormError(renameMutation.error, t, 'settings.groups.rename.error')}
          </p>
        ) : null}
        {deleteMutation.error ? (
          <p className="form-hint form-hint--warn">
            {humanizeFormError(deleteMutation.error, t, 'settings.groups.delete.error')}
          </p>
        ) : null}
        {lockHint ? <p className="task-detail__hint">{lockHint}</p> : null}
        <form className="pm-form" onSubmit={submit} title={lockHint ?? undefined}>
          <FormGrid>
            <Field label={t('settings.groups.field.name')} required>
              <input
                value={name}
                placeholder={t('settings.groups.field.namePlaceholder')}
                onChange={(e) => setName(e.target.value)}
                disabled={writeLocked}
                aria-required
              />
            </Field>
          </FormGrid>
          <FormActions
            submitLabel={t('settings.groups.submit')}
            submittingLabel={t('settings.groups.submitting')}
            submitting={createMutation.isPending}
            disabled={!valid}
            error={
              createMutation.error
                ? humanizeFormError(createMutation.error, t, 'settings.groups.error')
                : null
            }
            success={
              createMutation.isSuccess
                ? t('settings.groups.success', { name: createMutation.data.group.name })
                : null
            }
          />
        </form>
      </div>
    </section>
  );
}

// 单个组行：叶子组（可选组）给改名（行内编辑）+ 删除控件；非叶子/哨兵组只标注「汇报视角 · 不出现在
// 选择」（不可改删——服务端同判据 409 兜底）。改名行内编辑态为本行局部 state。
function GroupRow({
  group,
  assignable,
  writeLocked,
  lockHint,
  renaming,
  deleting,
  onRename,
  onDelete,
}: {
  group: Group;
  assignable: boolean;
  writeLocked: boolean;
  lockHint: string | null;
  renaming: boolean;
  deleting: boolean;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(group.name);

  function save() {
    const next = draft.trim();
    if (!next || next === group.name) {
      setEditing(false);
      setDraft(group.name);
      return;
    }
    onRename(next);
    setEditing(false);
  }

  return (
    <article className="adapter-row">
      <div>
        {editing ? (
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label={t('settings.groups.rename')}
          />
        ) : (
          <strong>{group.name}</strong>
        )}
      </div>
      <div
        className="settings-member__controls"
        title={writeLocked ? (lockHint ?? undefined) : undefined}
      >
        <span className={`badge badge--wide${assignable ? ' badge--green' : ''}`}>
          {t(
            assignable
              ? 'settings.groups.badge.assignable'
              : 'settings.groups.badge.reporting',
          )}
        </span>
        {assignable ? (
          editing ? (
            <>
              <button
                type="button"
                className="btn btn--primary btn--sm"
                disabled={renaming}
                onClick={save}
              >
                {t('settings.groups.rename.save')}
              </button>
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={() => {
                  setEditing(false);
                  setDraft(group.name);
                }}
              >
                {t('settings.groups.rename.cancel')}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                disabled={writeLocked}
                onClick={() => {
                  setDraft(group.name);
                  setEditing(true);
                }}
              >
                {t('settings.groups.rename')}
              </button>
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                disabled={writeLocked || deleting}
                onClick={onDelete}
              >
                {t('settings.groups.delete')}
              </button>
            </>
          )
        ) : null}
      </div>
    </article>
  );
}
