import { useEffect, useState } from 'react';
import { useHubMutation } from '../../../hooks/useHubMutation';
import type { QueryClient } from '@tanstack/react-query';
import type { CreateResourceSessionRequest } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../../api/client';
import type { VocabularyKey } from '../../../i18n';
import { invalidateScheduleFamily } from '../schedule-invalidation';

/** session 族写动作的整族失效键（镜像 invalidateScheduleFamily，走平台 useHubMutation invalidateKeys）。 */
const SCHEDULE_FAMILY_KEYS = [['schedule'], ['relay'], ['resource-sessions'], ['tasks'], ['dep-graph']];
/** 接力手线窄失效键（镜像 invalidateRelayOnly）。 */
const RELAY_ONLY_KEYS = [['relay']];

export type BannerState = { kind: 'err' | 'ok'; text: string } | null;

export function useRelayMutations({
  client,
  windowLabel,
  t,
  queryClient,
  onSessionCreated,
}: {
  client: HubApiClient;
  windowLabel: string;
  t: (key: VocabularyKey, params?: Record<string, string | number>) => string;
  queryClient: QueryClient;
  onSessionCreated: () => void;
}) {
  const [banner, setBanner] = useState<BannerState>(null);

  // session 类写动作（增/改/删 + carry-over 批量）整族失效——session 同被 SchedulePage/
  // TodayPlanTable/relay 读取，只失效 relay 单 key 会让父级 schedule 视图在 staleTime 内晾旧。
  const refetch = () => {
    invalidateScheduleFamily(queryClient);
  };

  const updateMutation = useHubMutation({
    mutationFn: (vars: {
      id: string;
      patch: { orderInWindow?: number; eta?: string | null };
    }) => client.updateResourceSession(vars.id, vars.patch),
    invalidateKeys: SCHEDULE_FAMILY_KEYS,
    onSuccess: () => {
      setBanner(null);
    },
    onError: (e) =>
      setBanner({
        kind: 'err',
        text: t('schedule.relay.saveError', {
          detail: e instanceof Error ? e.message : String(e),
        }),
      }),
  });

  const createHandoffMutation = useHubMutation({
    mutationFn: (vars: {
      fromSessionId: string;
      toSessionId: string;
      projectId: string;
    }) =>
      client.createRelayHandoff({
        projectId: vars.projectId,
        windowLabel,
        fromSessionId: vars.fromSessionId,
        toSessionId: vars.toSessionId,
        confirmedBy: {
          id: 'console-relay',
          displayName: t('schedule.relay.actor'),
          source: 'console',
        },
      }),
    invalidateKeys: RELAY_ONLY_KEYS,
    onSuccess: () => {
      setBanner(null);
    },
    onError: (e) =>
      setBanner({
        kind: 'err',
        text: t('schedule.relay.handoffError', {
          detail: e instanceof Error ? e.message : String(e),
        }),
      }),
  });

  const deleteHandoffMutation = useHubMutation({
    mutationFn: (id: string) => client.deleteRelayHandoff(id),
    invalidateKeys: RELAY_ONLY_KEYS,
    onSuccess: () => {
      setBanner(null);
    },
    onError: (e) =>
      setBanner({
        kind: 'err',
        text: t('schedule.relay.handoffDeleteError', {
          detail: e instanceof Error ? e.message : String(e),
        }),
      }),
  });

  const deleteSessionMutation = useHubMutation({
    mutationFn: (id: string) => client.deleteResourceSession(id),
    invalidateKeys: SCHEDULE_FAMILY_KEYS,
    onSuccess: () => {
      setBanner(null);
    },
    onError: (e) =>
      setBanner({
        kind: 'err',
        text: t('schedule.relay.deleteError', {
          detail: e instanceof Error ? e.message : String(e),
        }),
      }),
  });

  const createSessionMutation = useHubMutation({
    mutationFn: (req: CreateResourceSessionRequest) =>
      client.createResourceSession(req),
    invalidateKeys: SCHEDULE_FAMILY_KEYS,
    onSuccess: () => {
      onSessionCreated();
      setBanner(null);
    },
    onError: (e) =>
      setBanner({
        kind: 'err',
        text: t('schedule.relay.addError', {
          detail: e instanceof Error ? e.message : String(e),
        }),
      }),
  });

  // 横幅几秒后自动消失（与依赖图同口径）；点击立即关闭。
  useEffect(() => {
    if (!banner) return;
    const timer = setTimeout(() => setBanner(null), 4000);
    return () => clearTimeout(timer);
  }, [banner]);

  return {
    banner,
    setBanner,
    refetch,
    updateMutation,
    createHandoffMutation,
    deleteHandoffMutation,
    deleteSessionMutation,
    createSessionMutation,
  };
}
