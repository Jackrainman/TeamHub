import { useQuery } from '@tanstack/react-query';
import type {
  LarkConfigSaveResponse,
  MemberRole,
  RosterImportRow,
  RosterPreviewResponse,
} from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import { queryKeys } from '../../api/queryKeys';
import { useHubMutation } from '../../hooks/useHubMutation';

/**
 * 设置域远端状态唯一消费点（§10；前身 settings/sub/useSettingsQueries.ts + useSettingsMutations.ts）。
 * 查询：useSystemStatus 在 features/system/hooks.ts（system 域）。本文件 = 设置页写动作 +
 * 飞书集成配置读（lark 属 integrations 词汇，设置页是其唯一宿主 UI）。
 */
export function useLarkConfig(client: HubApiClient) {
  return useQuery({
    queryKey: queryKeys.larkConfig(),
    queryFn: () => client.getLarkConfig(),
  });
}

export function useLarkChats(client: HubApiClient, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.larkChats(),
    queryFn: () => client.getLarkChats(),
    enabled,
    retry: false,
  });
}

export function useSetupAdminMutation(
  client: HubApiClient,
  pin: string,
  onSuccess: () => void,
) {
  return useHubMutation({
    meta: { silent: true },
    invalidateKeys: [],
    mutationFn: () => client.setupSuperAdmin({ pin }),
    onSuccess,
  });
}

export function useRosterPreviewMutation(
  client: HubApiClient,
  onSuccess: (data: RosterPreviewResponse) => void,
) {
  return useHubMutation({
    meta: { silent: true },
    invalidateKeys: [],
    mutationFn: (file: File) => client.previewRoster(file),
    onSuccess,
  });
}

export function useRosterImportMutation(
  client: HubApiClient,
  onSuccess: () => void,
) {
  return useHubMutation({
    meta: { silent: true },
    invalidateKeys: [queryKeys.members()],
    mutationFn: (rows: RosterImportRow[]) => client.importRosterRows(rows),
    onSuccess,
  });
}

export function useCreateSeasonMutation(
  client: HubApiClient,
  source: string,
  opts: { name: string; startsAt: string; endsAt: string; onSuccess: () => void },
) {
  return useHubMutation({
    meta: { silent: true },
    invalidateKeys: [queryKeys.seasons(source)],
    mutationFn: () =>
      client.createSeason({
        name: opts.name.trim(),
        startsAt: `${opts.startsAt}T00:00:00.000Z`,
        endsAt: opts.endsAt ? `${opts.endsAt}T00:00:00.000Z` : null,
      }),
    onSuccess: () => opts.onSuccess(),
  });
}

export function useGroupMutations(
  client: HubApiClient,
  opts: { createName: string; onCreateSuccess: () => void },
) {
  const createMutation = useHubMutation({
    meta: { silent: true },
    invalidateKeys: [queryKeys.groups()],
    mutationFn: () => client.createGroup({ name: opts.createName.trim() }),
    onSuccess: () => opts.onCreateSuccess(),
  });
  const renameMutation = useHubMutation({
    meta: { silent: true },
    invalidateKeys: [queryKeys.groups()],
    mutationFn: (vars: { id: string; name: string }) =>
      client.renameGroup(vars.id, { name: vars.name }),
  });
  const deleteMutation = useHubMutation({
    meta: { silent: true },
    invalidateKeys: [queryKeys.groups()],
    mutationFn: (vars: { id: string }) => client.deleteGroup(vars.id),
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
    onCreateChatSuccess: (chat: { chatId: string; name: string }) => void;
  },
) {
  const saveMutation = useHubMutation({
    invalidateKeys: [queryKeys.larkConfig()],
    mutationFn: () =>
      client.saveLarkConfig({
        appId: opts.appId,
        appSecret: opts.appSecret,
        chatId: opts.chatId,
      }),
    onSuccess: (res) => opts.onSaveSuccess(res),
    onError: (err: Error) => opts.onSaveError(err),
  });

  const resetMutation = useHubMutation({
    invalidateKeys: [queryKeys.larkConfig()],
    mutationFn: () => client.resetLarkConfig(),
    onSuccess: () => opts.onResetSuccess(),
  });

  const createChatMutation = useHubMutation({
    invalidateKeys: [queryKeys.larkChats()],
    mutationFn: (name: string) => client.createLarkChat({ name: name.trim() }),
    onSuccess: (chat) => opts.onCreateChatSuccess(chat),
  });

  return { saveMutation, resetMutation, createChatMutation };
}

export function useMemberMutations(client: HubApiClient) {
  const roleMutation = useHubMutation({
    meta: { silent: true },
    invalidateKeys: [queryKeys.members()],
    mutationFn: (vars: { id: string; role: MemberRole }) =>
      client.setMemberRole(vars.id, { role: vars.role }),
  });
  const pmMutation = useHubMutation({
    meta: { silent: true },
    invalidateKeys: [queryKeys.members()],
    mutationFn: (vars: { id: string; projectManager: boolean }) =>
      client.setMemberProjectManager(vars.id, { projectManager: vars.projectManager }),
  });
  const clearPinMutation = useHubMutation({
    meta: { silent: true },
    invalidateKeys: [queryKeys.members()],
    mutationFn: (vars: { id: string }) => client.clearMemberPin(vars.id),
  });

  return { roleMutation, pmMutation, clearPinMutation };
}
