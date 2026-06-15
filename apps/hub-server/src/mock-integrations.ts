import type { AgentBackend, BotChannel, DataSource } from './contracts.js';
import {
  agentBackendFixtures,
  botChannelFixtures,
  dataSourceFixtures,
} from '@teamhub/hub-contracts';

// 集成模型三分的 mock 读出入口（mock-first）。各自防御性拷贝，避免调用方改到共享 fixture。
export function listMockBotChannels(): BotChannel[] {
  return botChannelFixtures.map((channel) => ({ ...channel }));
}

export function listMockAgentBackends(): AgentBackend[] {
  return agentBackendFixtures.map((backend) => ({
    ...backend,
    capabilities: [...backend.capabilities],
  }));
}

export function listMockDataSources(): DataSource[] {
  return dataSourceFixtures.map((source) => ({ ...source }));
}
