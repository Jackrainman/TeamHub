import { useQueryClient } from '@tanstack/react-query';
import type { MemberPublic, MemberRole, RosterImportRow, RosterPreviewResponse } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import { queryKeys } from '../../api/queryKeys';
import { useHubMutation } from '../../hooks/useHubMutation';

export function useSetupAdminMutation(client: HubApiClient, pin: string, onSuccess: () => void) {
  return useHubMutation({ meta: { silent: true }, invalidateKeys: [],
    mutationFn: () => client.setupSuperAdmin({ pin }), onSuccess });
}
export function useRosterPreviewMutation(client: HubApiClient, onSuccess: (data: RosterPreviewResponse) => void) {
  return useHubMutation({ meta: { silent: true }, invalidateKeys: [],
    mutationFn: (file: File) => client.previewRoster(file), onSuccess });
}
export function useRosterImportMutation(client: HubApiClient, onSuccess: () => void) {
  return useHubMutation({ meta: { silent: true }, invalidateKeys: [queryKeys.members(), queryKeys.groups()],
    mutationFn: (rows: RosterImportRow[]) => client.importRosterRows(rows), onSuccess });
}
export function useGroupMutations(client: HubApiClient, opts: { createName: string; onCreateSuccess: () => void }) {
  const createMutation = useHubMutation({ meta: { silent: true }, invalidateKeys: [queryKeys.groups()],
    mutationFn: () => client.createGroup({ name: opts.createName.trim() }), onSuccess: () => opts.onCreateSuccess() });
  const renameMutation = useHubMutation({ meta: { silent: true }, invalidateKeys: [queryKeys.groups()],
    mutationFn: (vars: { id: string; name: string }) => client.renameGroup(vars.id, { name: vars.name }) });
  const deleteMutation = useHubMutation({ meta: { silent: true }, invalidateKeys: [queryKeys.groups()],
    mutationFn: (vars: { id: string }) => client.deleteGroup(vars.id) });
  return { createMutation, renameMutation, deleteMutation };
}
export function useMemberMutations(client: HubApiClient) {
  const queryClient = useQueryClient();
  const syncMember = (member: MemberPublic) => {
    queryClient.setQueriesData<{ members: MemberPublic[] }>({ queryKey: queryKeys.members() }, (current) =>
      current ? { ...current, members: current.members.map((item) => item.id === member.id ? member : item) } : current);
    void queryClient.invalidateQueries({ queryKey: queryKeys.members() });
  };
  const roleMutation = useHubMutation({ meta: { silent: true }, invalidateKeys: [],
    mutationFn: (vars: { id: string; role: MemberRole }) => client.setMemberRole(vars.id, { role: vars.role }),
    onSuccess: (data) => syncMember(data.member) });
  const pmMutation = useHubMutation({ meta: { silent: true }, invalidateKeys: [],
    mutationFn: (vars: { id: string; projectManager: boolean }) => client.setMemberProjectManager(vars.id, { projectManager: vars.projectManager }),
    onSuccess: (data) => syncMember(data.member) });
  const clearPinMutation = useHubMutation({ meta: { silent: true }, invalidateKeys: [],
    mutationFn: (vars: { id: string }) => client.clearMemberPin(vars.id),
    onSuccess: (data) => syncMember(data.member) });
  return { roleMutation, pmMutation, clearPinMutation };
}
