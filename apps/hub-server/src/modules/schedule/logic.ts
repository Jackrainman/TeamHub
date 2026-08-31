import type {
  RelayHandoff,
  ResourceSession,
  SharedResource,
} from '@teamhub/hub-contracts';
import { deriveDisplayCode } from '@teamhub/hub-contracts';
import {
  RELAY_HANDOFF_SOURCE,
  RESOURCE_DEFAULT_STATUS,
  RESOURCE_SESSION_SOURCE,
  RESOURCE_STATUS_SOURCE,
} from '../../store/clamp-defaults.js';
import type {
  RelayHandoffDraft,
  ResourceDefaultPresetPatch,
  ResourceDraft,
  ResourceSessionDraft,
  ResourceSessionPatch,
  ResourceStatusPatch,
} from './repository.js';

/**
 * schedule 域 store 逻辑纯函数（ARCH-UNIFY A4 自 store/gov-store-logic.ts 迁出）：create/patch 的
 * 构造与受限迁移，三实现（sqlite / 测试 fake）共享同一份策略，零漂移。
 */

export function buildCreatedResource(draft: ResourceDraft, id: string, now: string): SharedResource {
  const displayCode =
    draft.season !== undefined
      ? deriveDisplayCode(draft.season, draft.robotTarget, draft.version ?? 1)
      : undefined;
  return {
    ...draft,
    id,
    status: RESOURCE_DEFAULT_STATUS,
    statusReason: null,
    statusSource: RESOURCE_STATUS_SOURCE,
    displayCode,
    updatedAt: now,
  };
}

export function buildCreatedResourceSession(
  draft: ResourceSessionDraft,
  id: string,
  now: string,
): ResourceSession {
  return { ...draft, id, source: RESOURCE_SESSION_SOURCE, createdAt: now };
}

export function buildCreatedResourceSessionsBatch(
  drafts: readonly ResourceSessionDraft[],
  nextId: () => string,
  now: string,
): ResourceSession[] {
  return drafts.map((draft) => ({
    ...draft,
    id: nextId(),
    source: RESOURCE_SESSION_SOURCE,
    invitedMemberIds: [],
    createdAt: now,
  }));
}

export function buildCreatedRelayHandoff(
  draft: RelayHandoffDraft,
  id: string,
  now: string,
): RelayHandoff {
  return { ...draft, id, source: RELAY_HANDOFF_SOURCE, createdAt: now };
}

export function applyResourceStatus(
  prev: SharedResource,
  patch: ResourceStatusPatch,
  now: string,
): SharedResource {
  return {
    ...prev,
    status: patch.status,
    statusReason: patch.statusReason !== undefined ? patch.statusReason : prev.statusReason,
    statusSource: RESOURCE_STATUS_SOURCE,
    updatedAt: now,
  };
}

export function applyResourceDefaultPreset(
  prev: SharedResource,
  preset: ResourceDefaultPresetPatch,
  now: string,
): SharedResource {
  if (preset === null) {
    const { defaultPreset: _drop, ...rest } = prev;
    return { ...rest, updatedAt: now };
  }
  return { ...prev, defaultPreset: preset, updatedAt: now };
}

export function applyResourceSessionPatch(
  prev: ResourceSession,
  patch: ResourceSessionPatch,
): ResourceSession {
  return {
    ...prev,
    orderInWindow: patch.orderInWindow !== undefined ? patch.orderInWindow : prev.orderInWindow,
    eta: patch.eta !== undefined ? patch.eta : prev.eta,
  };
}
