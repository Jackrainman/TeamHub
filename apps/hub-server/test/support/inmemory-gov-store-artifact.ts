import type { ArtifactRef } from '@teamhub/hub-contracts';
import { buildCreatedArtifact } from '../../src/store/gov-store-logic.js';
import type { ArtifactDraft, ArtifactStore } from '../../src/store/gov-store.js';
import { nextSequentialId } from '../../src/store/id-sequence.js';
import type { InMemoryGovStoreBase } from './inmemory-gov-store-base.js';

/**
 * artifact 域方法 mixin（GOV-SPLIT）：ArtifactStore 两条写方法（appendArtifact / setArtifactFile）
 * 叠到基座上。方法体逐字自原 InMemoryGovStore 搬迁（mock-gov-store.ts 单文件拆分），零行为变化。
 */
type Base = new (...args: any[]) => InMemoryGovStoreBase;

export function ArtifactMixin<T extends Base>(
  BaseClass: T,
): T & (new (...args: any[]) => ArtifactStore) {
  return class InMemoryGovStoreArtifact extends BaseClass {
    /**
     * 图纸/归档物提交日志追加（POST /api/artifacts，V1-FOLLOWUPS ④）。Store 补 id + createdAt + **钉
     * submittedVia=`console`**（C5：来源 seam server 钉，请求不收）。**append-only**：只 push 进 snapshot.artifacts，
     * 无 update/delete。**I0 守恒**：ArtifactRef 无 person 字段，draft 也不含——日志主键是机构(mechanism)+
     * 版本(revision)+归档物，永无 memberId，不可事后 groupBy「谁提交最多」。
     */
    async appendArtifact(draft: ArtifactDraft): Promise<ArtifactRef> {
      const now = this.clock.now().toISOString();
      const artifact = buildCreatedArtifact(
        draft,
        nextSequentialId('artifact-new', this.artifactSeq),
        now,
      );
      this.snapshot.artifacts.push(artifact);
      return artifact;
    }

    /**
     * 给既有归档物挂文件指针（POST /api/artifacts/:id/upload）。**就地 idx 改**：只换 storedFile、不动其余字段、
     * 不新增行（重传=覆盖）。id 不存在回 null（路由 → 404）。I0：storedFile 无人员维度。
     */
    async setArtifactFile(
      id: string,
      file: NonNullable<ArtifactRef['storedFile']>,
    ): Promise<ArtifactRef | null> {
      const idx = this.snapshot.artifacts.findIndex((a) => a.id === id);
      if (idx === -1) return null;
      const updated: ArtifactRef = { ...this.snapshot.artifacts[idx], storedFile: file };
      this.snapshot.artifacts[idx] = updated;
      return updated;
    }
  };
}
