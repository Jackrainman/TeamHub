import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { MemberRole } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import { useMembers, useGroups } from '../../hooks/useRoster';
import type { PageIdentityCtx } from '../../console-pages';
import { useI18n } from '../../i18n';
import { GRADE_KEY } from '../../shared/roster';
import { Select } from '../../components/Select';
import { canShowMemberPin } from './pin-visibility';
import { humanizeFormError } from '../../utils';
import { MEMBER_ROLE_OPTIONS, ROLE_KEY } from './settings-constants';
import { sectionPermission } from './section-permission';
import { MemberPinReveal, SetupAdminCard, RosterImportBlock } from './sub/MembersSubComponents';

export function MembersPermissionsSection({
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
  const { writeLocked, lockHint } = sectionPermission(identity, t);
  const membersQuery = useMembers(client, 'settings-members');
  const groupsQuery = useGroups(client, source);

  const invalidateMembers = () =>
    void queryClient.invalidateQueries({ queryKey: ['members'] });
  const invalidateRoster = () => {
    invalidateMembers();
    void queryClient.invalidateQueries({ queryKey: ['groups'] });
  };

  const roleMutation = useMutation({
    mutationFn: (vars: { id: string; role: MemberRole }) =>
      client.setMemberRole(vars.id, { role: vars.role }),
    onSuccess: invalidateMembers,
  });
  const pmMutation = useMutation({
    mutationFn: (vars: { id: string; projectManager: boolean }) =>
      client.setMemberProjectManager(vars.id, { projectManager: vars.projectManager }),
    onSuccess: invalidateMembers,
  });
  const clearPinMutation = useMutation({
    mutationFn: (vars: { id: string }) => client.clearMemberPin(vars.id),
    onSuccess: invalidateMembers,
  });

  const members = membersQuery.data?.members ?? [];
  const groups = groupsQuery.data?.groups ?? [];
  const groupName = (id: string) => groups.find((g) => g.id === id)?.name ?? id;
  const hasPm = members.some((m) => m.projectManager === true);
  const emptyRoster = !membersQuery.isLoading && members.length === 0;
  const showSetup = identity.mode === 'identity' && !membersQuery.isLoading && !hasPm;

  return (
    <section className="panel settings-panel">
      <div className="panel-header">
        <h2>{t('settings.section.members')}</h2>
      </div>
      <div className="settings-section">
        <p className="settings-desc">{t('settings.members.desc')}</p>
        <RosterImportBlock
          client={client}
          emptyRoster={emptyRoster}
          sectionWriteLocked={writeLocked}
          lockHint={lockHint}
          members={members}
          groups={groups}
          onImported={invalidateRoster}
        />
        {lockHint ? <p className="task-detail__hint">{lockHint}</p> : null}
        {showSetup ? (
          <SetupAdminCard client={client} writeLocked={writeLocked} onDone={invalidateMembers} />
        ) : null}
        {membersQuery.isLoading ? (
          <p className="settings-desc" role="status" aria-live="polite">…</p>
        ) : members.length === 0 ? (
          <p className="settings-desc">{t('settings.members.empty')}</p>
        ) : (
          <div className="adapter-grid adapter-grid--members">
            {members.map((member) => (
              <article className="adapter-row" key={member.id}>
                <div>
                  <strong>{member.displayName}</strong>
                  <span>
                    {t(GRADE_KEY[member.grade])} · {groupName(member.groupId)}
                  </span>
                </div>
                <div
                  className="settings-member__controls"
                  title={writeLocked ? (lockHint ?? undefined) : undefined}
                >
                  <Select
                    value={member.role}
                    onChange={(role) => roleMutation.mutate({ id: member.id, role })}
                    options={MEMBER_ROLE_OPTIONS}
                    renderOption={(r) => t(ROLE_KEY[r])}
                    ariaLabel={t('settings.members.role.label')}
                    disabled={
                      writeLocked ||
                      (roleMutation.isPending && roleMutation.variables?.id === member.id)
                    }
                  />
                  <label className="pm-check">
                    <input
                      type="checkbox"
                      checked={member.projectManager === true}
                      disabled={
                        writeLocked ||
                        (pmMutation.isPending && pmMutation.variables?.id === member.id)
                      }
                      onChange={(e) => {
                        const grant = e.target.checked;
                        if (
                          !grant &&
                          !window.confirm(
                            t('settings.members.pm.revokeConfirm', {
                              name: member.displayName,
                            }),
                          )
                        )
                          return;
                        pmMutation.mutate({
                          id: member.id,
                          projectManager: grant,
                        });
                      }}
                    />
                    <span>{t('settings.members.pm.toggle')}</span>
                  </label>
                  {member.gateReviewer ? (
                    <span className="badge badge--wide badge--green">
                      {t('settings.reviewers.badge.auto')}
                    </span>
                  ) : null}
                  {identity.mode === 'identity' && canShowMemberPin(identity, member.id) ? (
                    <MemberPinReveal client={client} memberId={member.id} />
                  ) : null}
                  {identity.mode === 'identity' ? (
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      disabled={
                        writeLocked ||
                        (clearPinMutation.isPending &&
                          clearPinMutation.variables?.id === member.id)
                      }
                      onClick={() => {
                        if (
                          window.confirm(
                            t('settings.members.resetPin.confirm', {
                              name: member.displayName,
                            }),
                          )
                        ) {
                          clearPinMutation.mutate({ id: member.id });
                        }
                      }}
                    >
                      {t('settings.members.resetPin')}
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
        {clearPinMutation.isSuccess ? (
          <p className="form-hint">{t('settings.members.resetPin.done')}</p>
        ) : null}
        {clearPinMutation.error ? (
          <p className="form-hint form-hint--warn">
            {humanizeFormError(clearPinMutation.error, t, 'settings.members.resetPin.error')}
          </p>
        ) : null}
        {roleMutation.error ? (
          <p className="form-hint form-hint--warn">
            {humanizeFormError(roleMutation.error, t, 'settings.members.role.error')}
          </p>
        ) : null}
        {pmMutation.error ? (
          <p className="form-hint form-hint--warn">
            {humanizeFormError(pmMutation.error, t, 'settings.members.pm.error')}
          </p>
        ) : null}
      </div>
    </section>
  );
}
