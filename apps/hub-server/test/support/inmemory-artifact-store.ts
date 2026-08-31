import { GOVERNANCE_SCENARIO_NOW, buildArchiveSeed } from '@teamhub/hub-contracts';
import type { ArtifactRef } from '@teamhub/hub-contracts';
import { FixedClock } from '../../src/clock.js';
import type { Clock } from '../../src/clock.js';
import {
  buildCreatedArtifact,
  type ArtifactDraft,
  type ArtifactRepository,
} from '../../src/modules/archive/repository.js';
import { nextSequentialId, createIdSequence } from '../../src/store/id-sequence.js';
import type { IdSequence } from '../../src/store/id-sequence.js';

/**
 * 归档物域内存 fake（ARCH-UNIFY A4；前身 inmemory-gov-store-artifact.ts 的 ArtifactMixin）。
 * 默认 seed = `buildArchiveSeed()`（图纸版本日志 fixture），与 InMemoryGovStore 缺省 seed 先例同律。
 * 方法体语义与原 mixin 逐字一致：append-only push + setArtifactFile 就地 idx 改。
 */
export class InMemoryArtifactRepository implements ArtifactRepository {
  private readonly artifacts: ArtifactRef[];
  private readonly clock: Clock;
  private artifactSeq: IdSequence;

  constructor(
    seed: readonly ArtifactRef[] = buildArchiveSeed(),
    clock: Clock = new FixedClock(new Date(GOVERNANCE_SCENARIO_NOW)),
  ) {
    this.artifacts = seed.map((a) => ({ ...a }));
    this.clock = clock;
    this.artifactSeq = createIdSequence(this.artifacts.length);
  }

  async listArtifacts(): Promise<ArtifactRef[]> {
    return this.artifacts.map((a) => ({ ...a }));
  }

  async appendArtifact(draft: ArtifactDraft): Promise<ArtifactRef> {
    const artifact = buildCreatedArtifact(
      draft,
      nextSequentialId('artifact-new', this.artifactSeq),
      this.clock.now().toISOString(),
    );
    this.artifacts.push(artifact);
    return artifact;
  }

  async setArtifactFile(
    id: string,
    file: NonNullable<ArtifactRef['storedFile']>,
  ): Promise<ArtifactRef | null> {
    const idx = this.artifacts.findIndex((a) => a.id === id);
    if (idx === -1) return null;
    const updated: ArtifactRef = { ...this.artifacts[idx], storedFile: file };
    this.artifacts[idx] = updated;
    return updated;
  }
}
