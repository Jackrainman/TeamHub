import type { SkillDispatcher, SkillDispatcherConfig } from './types.js';
import { dispatchDebugChecklist } from './debug-checklist/index.js';

export function createSkillDispatcher(
  cfg: SkillDispatcherConfig,
): SkillDispatcher {
  return {
    async dispatch(symptom: string) {
      return dispatchDebugChecklist(symptom, cfg.mode);
    },
  };
}

export type {
  SkillReply,
  SkillMode,
  SkillDispatcher,
  SkillDispatcherConfig,
} from './types.js';
export {
  buildPfSkillsAdapterDescriptor,
  skillReplyToHubEvent,
} from './hub.js';
