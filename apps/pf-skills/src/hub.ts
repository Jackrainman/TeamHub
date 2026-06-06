import {
  AdapterDescriptorSchema,
  HubEventSchema,
  type AdapterDescriptor,
  type HubEvent,
} from '@teamhub/hub-contracts';
import type { SkillMode, SkillReply } from './types.js';

export function buildPfSkillsAdapterDescriptor(
  mode: SkillMode,
  now = new Date(),
): AdapterDescriptor {
  return AdapterDescriptorSchema.parse({
    id: 'pf-skills',
    kind: 'tool',
    displayName: 'Teamhub pf-skills',
    status: mode === 'mock' ? 'enabled' : 'unconfigured',
    capabilities: [
      `debug.checklist.${mode}`,
      'skill.dispatch',
      'hub.event.skill.completed',
    ],
    healthCheckedAt: mode === 'mock' ? now.toISOString() : undefined,
  });
}

export function skillReplyToHubEvent(
  symptom: string,
  reply: SkillReply,
  now = new Date(),
): HubEvent {
  return HubEventSchema.parse({
    id: `pf-skills-${now.getTime()}`,
    source: 'system',
    type: 'skill.completed',
    createdAt: now.toISOString(),
    payload: {
      skill: 'debug-checklist',
      mode: reply.kind,
      symptom,
      text: reply.text,
    },
  });
}
