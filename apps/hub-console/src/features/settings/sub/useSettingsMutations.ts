import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  MemberRole,
  RosterImportRow,
  RosterPreviewResponse,
  LarkConfigSaveResponse,
} from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../../api/client';
import { queryKeys } from '../../../api/queryKeys';

export function useSetupAdminMutation(
  client: HubApiClient,
  pin: string,
  onSuccess: () => void,
) {
  return useMutation({
    mutationFn: () => client.setupSuperAdmin({ pin }),
    onSuccess,
  });
}

export function useRosterPreviewMutation(
  client: HubApiClient,
  onSuccess: (data: RosterPreviewResponse) => void,
) {
  return useMutation({
    mutationFn: (file: File) => client.previewRoster(file),
    onSuccess,
  });
}

export function useRosterImportMutation(
  client: HubApiClient,
  onSuccess: () => void,
) {
  return useMutation({
    mutationFn: (rows: RosterImportRow[]) => client.importRosterRows(rows),
    onSuccess,
  });
}

export function useCreateSeasonMutation(
  client: HubApiClient,
  source: string,
  opts: { name: string; startsAt: string; endsAt: string; onSuccess: () => void },
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      client.createSeason({
        name: opts.name.trim(),
        startsAt: `${opts.startsAt}T00:00:00.000Z`,
        endsAt: opts.endsAt ? `${opts.endsAt}T00:00:00.000Z` : null,
      }),
    onSuccess: () => {
      opts.onSuccess();
      void queryClient.invalidateQueries({ queryKey: queryKeys.seasons(source) });
    },
  });
}

export function useGroupMutations(
  client: HubApiClient,
  opts: { createName: string; onCreateSuccess: () => void },
) {
  const queryClient = useQueryClient();
  const invalidateGroups = () =>
    void queryClient.invalidateQueries({ queryKey: queryKeys.groups() });

  const createMutation = useMutation({
    mutationFn: () => client.createGroup({ name: opts.createName.trim() }),
    onSuccess: () => {
      opts.onCreateSuccess();
      invalidateGroups();
    },
  });
  const renameMutation = useMutation({
    mutationFn: (vars: { id: string; name: string }) =>
      client.renameGroup(vars.id, { name: vars.name }),
    onSuccess: invalidateGroups,
  });
  const deleteMutation = useMutation({
    mutationFn: (vars: { id: string }) => client.deleteGroup(vars.id),
    onSuccess: invalidateGroups,
  });

  return { createMutation, renameMutation, deleteMutation };
}

export function useLarkMutations(
  client: HubApiClient,
  opts: {
    appId: string;
    appSecret: string;
    chatId: string;
    onSaveSuccess: (res: LarkConfigSaveResponse) => void;
    onSaveError: (err: Error) => void;
    onResetSuccess: () => void;
  },
) {
  const queryClient = useQueryClient();

  const saveMutation = useMutation({
    mutationFn: () =>
      client.saveLarkConfig({
        appId: opts.appId,
        appSecret: opts.appSecret,
        chatId: opts.chatId,
      }),
    onSuccess: (res) => {
      opts.onSaveSuccess(res);
      void queryClient.invalidateQueries({ queryKey: queryKeys.larkConfig() });
    },
    onError: (err: Error) => opts.onSaveError(err),
  });

  const resetMutation = useMutation({
    mutationFn: () => client.resetLarkConfig(),
    onSuccess: () => {
      opts.onResetSuccess();
      void queryClient.invalidateQueries({ queryKey: queryKeys.larkConfig() });
    },
  });

  return { saveMutation, resetMutation };
}

export function useMemberMutations(client: HubApiClient) {
  const queryClient = useQueryClient();
  const invalidateMembers = () =>
    void queryClient.invalidateQueries({ queryKey: queryKeys.members() });

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

  return { roleMutation, pmMutation, clearPinMutation };
}
