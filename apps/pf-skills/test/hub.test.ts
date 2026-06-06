import { describe, expect, test } from 'vitest';
import {
  AdapterDescriptorSchema,
  HubEventSchema,
} from '@teamhub/hub-contracts';
import {
  buildPfSkillsAdapterDescriptor,
  createSkillDispatcher,
  skillReplyToHubEvent,
} from '../src/index';

describe('pf-skills Hub contract adapter', () => {
  test('builds a schema-valid adapter descriptor for mock mode', () => {
    const descriptor = buildPfSkillsAdapterDescriptor(
      'mock',
      new Date('2026-06-06T00:00:00.000Z'),
    );

    expect(AdapterDescriptorSchema.safeParse(descriptor).success).toBe(true);
    expect(descriptor).toMatchObject({
      id: 'pf-skills',
      kind: 'tool',
      status: 'enabled',
    });
    expect(descriptor.capabilities).toContain('skill.dispatch');
  });

  test('maps a mock skill reply into a schema-valid HubEvent', async () => {
    const dispatcher = createSkillDispatcher({ mode: 'mock' });
    const reply = await dispatcher.dispatch('自动跑点又歪了');
    const event = skillReplyToHubEvent(
      '自动跑点又歪了',
      reply,
      new Date('2026-06-06T00:00:00.000Z'),
    );

    expect(HubEventSchema.safeParse(event).success).toBe(true);
    expect(event).toMatchObject({
      source: 'system',
      type: 'skill.completed',
    });
    expect(event.payload).toMatchObject({
      skill: 'debug-checklist',
      mode: 'mock',
      symptom: '自动跑点又歪了',
    });
  });
});
