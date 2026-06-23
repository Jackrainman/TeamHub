import type { ActorRef } from '@teamhub/hub-contracts';

// 把人工填写的姓名转成 console ActorRef（依赖/需求创建的 confirmedBy 来源）。
// I0：空 / 纯空白 → null（不产生空 confirmer）；非空 → id=kebab、displayName=原文 trim、source='console'。
export function actorFromName(name: string): ActorRef | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const id = trimmed.toLowerCase().replace(/\s+/g, '-');
  return { id, displayName: trimmed, source: 'console' };
}
