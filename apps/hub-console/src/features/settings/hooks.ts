import type { MemberRole, RosterImportRow, RosterPreviewResponse } from '@teamhub/hub-contracts';
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
  const roleMutation = useHubMutation({ meta: { silent: true }, invalidateKeys: [queryKeys.members()],
    mutationFn: (vars: { id: string; role: MemberRole }) => client.setMemberRole(vars.id, { role: vars.role }) });
  const pmMutation = useHubMutation({ meta: { silent: true }, invalidateKeys: [queryKeys.members()],
    mutationFn: (vars: { id: string; projectManager: boolean }) => client.setMemberProjectManager(vars.id, { projectManager: vars.projectManager }) });
  const clearPinMutation = useHubMutation({ meta: { silent: true }, invalidateKeys: [queryKeys.members()],
    mutationFn: (vars: { id: string }) => client.clearMemberPin(vars.id) });
  return { roleMutation, pmMutation, clearPinMutation };
}
