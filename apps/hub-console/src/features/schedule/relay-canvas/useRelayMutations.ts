import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import type { CreateResourceSessionRequest } from '../../../api/schemas/schedule';
import type { HubApiClient } from '../../../api/client';
import type { VocabularyKey } from '../../../i18n';

export type BannerState = { kind: 'err' | 'ok'; text: string } | null;

export function useRelayMutations({
  client,
  windowLabel,
  t,
  queryClient,
  queryKey,
  onSessionCreated,
}: {
  client: HubApiClient;
  windowLabel: string;
  t: (key: VocabularyKey, params?: Record<string, string | number>) => string;
  queryClient: QueryClient;
  queryKey: readonly string[];
  onSessionCreated: () => void;
}) {
  const [banner, setBanner] = useState<BannerState>(null);

  const refetch = () => {
    void queryClient.invalidateQueries({ queryKey });
  };

  const updateMutation = useMutation({
    mutationFn: (vars: {
      id: string;
      patch: { orderInWindow?: number; eta?: string | null };
    }) => client.updateResourceSession(vars.id, vars.patch),
    onSuccess: () => {
      setBanner(null);
      refetch();
    },
    onError: (e) =>
      setBanner({
        kind: 'err',
        text: t('schedule.relay.saveError', {
          detail: e instanceof Error ? e.message : String(e),
        }),
      }),
  });

  const createHandoffMutation = useMutation({
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
    onSuccess: () => {
      setBanner(null);
      refetch();
    },
    onError: (e) =>
      setBanner({
        kind: 'err',
        text: t('schedule.relay.handoffError', {
          detail: e instanceof Error ? e.message : String(e),
        }),
      }),
  });

  const deleteHandoffMutation = useMutation({
    mutationFn: (id: string) => client.deleteRelayHandoff(id),
    onSuccess: () => {
      setBanner(null);
      refetch();
    },
    onError: (e) =>
      setBanner({
        kind: 'err',
        text: t('schedule.relay.handoffDeleteError', {
          detail: e instanceof Error ? e.message : String(e),
        }),
      }),
  });

  const deleteSessionMutation = useMutation({
    mutationFn: (id: string) => client.deleteResourceSession(id),
    onSuccess: () => {
      setBanner(null);
      refetch();
    },
    onError: (e) =>
      setBanner({
        kind: 'err',
        text: t('schedule.relay.deleteError', {
          detail: e instanceof Error ? e.message : String(e),
        }),
      }),
  });

  const createSessionMutation = useMutation({
    mutationFn: (req: CreateResourceSessionRequest) =>
      client.createResourceSession(req),
    onSuccess: () => {
      onSessionCreated();
      setBanner(null);
      refetch();
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
