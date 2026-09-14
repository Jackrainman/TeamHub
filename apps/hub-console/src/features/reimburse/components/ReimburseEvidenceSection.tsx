import { useRef, useState, type ChangeEvent } from 'react';
import { Paperclip } from 'lucide-react';
import {
  REIMBURSE_EVIDENCE_ACCEPT,
  REIMBURSE_EVIDENCE_MAX_BYTES,
  REIMBURSE_EVIDENCE_MAX_PER_ENTRY,
  ReimburseEvidenceKindSchema,
  type ReimburseEntry,
  type ReimburseEvidenceKind,
} from '@teamhub/hub-contracts';
import type { ReimburseSegment } from '../api';
import {
  useDeleteReimburseEvidence,
  useReimburseEvidence,
  useUploadReimburseEvidence,
} from '../hooks';
import { useI18n, type TranslationKey } from '../../../i18n';
import {
  evidenceRejectReasonFor,
  formatEvidenceSize,
  groupEvidenceByKind,
  type EvidenceRejectReason,
} from '../reimburse-utils';

const EVIDENCE_KINDS = ReimburseEvidenceKindSchema.options;

const KIND_KEY: Record<ReimburseEvidenceKind, TranslationKey> = {
  invoice: 'reimb.evidence.kind.invoice',
  paymentShot: 'reimb.evidence.kind.paymentShot',
  inspection: 'reimb.evidence.kind.inspection',
};

const REJECT_KEY: Record<EvidenceRejectReason, TranslationKey> = {
  'too-large': 'reimb.evidence.reject.tooLarge',
  'ext-unsupported': 'reimb.evidence.reject.extUnsupported',
};

const MAX_MB = Math.round(REIMBURSE_EVIDENCE_MAX_BYTES / (1024 * 1024));

/**
 * 条目凭证留档区（D-094）：发票原件 / 付款截图 / 查验单三档各自的上传、清单、
 * 鉴权下载与删除。收起时零网络请求，展开才取清单——条目对象上永不含凭证元数据，
 * 这份清单就是本条目原件的唯一可见途径（服务端再按本人 / 管理员读者链鉴权）。
 * 上传与删除的入口只对条目本人开放（上传服务端恒本人；管理员能下载，但删别人的
 * 留档不该是一键可达的动作）。下载是 cookie 鉴权的 GET，每次留操作者痕迹。
 */
export function ReimburseEvidenceSection({
  client,
  source,
  entry,
  isOwner,
}: {
  client: ReimburseSegment;
  source: string;
  entry: ReimburseEntry;
  isOwner: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [reject, setReject] = useState<EvidenceRejectReason | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingKind = useRef<ReimburseEvidenceKind>('invoice');

  const evidenceQuery = useReimburseEvidence(client, source, entry.id, open);
  const uploadMutation = useUploadReimburseEvidence(client, source, entry.id);
  const deleteMutation = useDeleteReimburseEvidence(client, source, entry.id);

  const evidence = evidenceQuery.data?.evidence ?? [];
  const grouped = groupEvidenceByKind(evidence);
  const atCapacity = evidence.length >= REIMBURSE_EVIDENCE_MAX_PER_ENTRY;

  function pickFor(kind: ReimburseEvidenceKind) {
    pendingKind.current = kind;
    fileInputRef.current?.click();
  }

  function onFileChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ''; // 清掉才能连着选同一个文件
    if (!file) return;
    const reason = evidenceRejectReasonFor(file);
    if (reason) {
      setReject(reason);
      return;
    }
    setReject(null);
    uploadMutation.mutate({ kind: pendingKind.current, file });
  }

  return (
    <div className="reimb-evidence" role="group" aria-label={t('reimb.evidence.title')}>
      <button
        type="button"
        className="btn btn--sm btn--ghost reimb-evidence__toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Paperclip size={14} aria-hidden="true" /> {t('reimb.evidence.title')}
      </button>

      {open ? (
        <div className="reimb-evidence__body">
          <p className="reimb-evidence__hint">
            {t('reimb.evidence.hint', {
              accept: REIMBURSE_EVIDENCE_ACCEPT,
              max: REIMBURSE_EVIDENCE_MAX_PER_ENTRY,
              mb: MAX_MB,
            })}
          </p>
          {evidenceQuery.isPending ? (
            <p className="form-hint" role="status">{t('reimb.evidence.loading')}</p>
          ) : null}
          {evidenceQuery.isError ? (
            <p className="form-hint form-hint--warn" role="alert">{t('reimb.evidence.error')}</p>
          ) : null}
          {reject ? (
            <p className="form-hint form-hint--warn" role="alert">
              {t(REJECT_KEY[reject], { mb: MAX_MB, accept: REIMBURSE_EVIDENCE_ACCEPT })}
            </p>
          ) : null}
          {uploadMutation.isPending ? (
            <p className="form-hint" role="status">{t('reimb.evidence.uploading')}</p>
          ) : null}

          {EVIDENCE_KINDS.map((kind) => (
            <div className="reimb-evidence__kind" key={kind}>
              <div className="reimb-evidence__kind-head">
                <span className="reimb-evidence__kind-title">{t(KIND_KEY[kind])}</span>
                {isOwner ? (
                  <button
                    type="button"
                    className="btn btn--sm btn--secondary"
                    disabled={atCapacity || uploadMutation.isPending}
                    onClick={() => pickFor(kind)}
                  >
                    {t('reimb.evidence.pick')}
                  </button>
                ) : null}
              </div>
              {grouped[kind].length === 0 ? (
                <p className="reimb-evidence__none">{t('reimb.evidence.none')}</p>
              ) : (
                <ul className="reimb-evidence__list">
                  {grouped[kind].map((item) => (
                    <li key={item.id}>
                      <span className="reimb-evidence__name">{item.originalName}</span>
                      <span className="reimb-evidence__meta">
                        {formatEvidenceSize(item.sizeBytes)} · {item.uploadedAt.slice(0, 10)}
                      </span>
                      <span className="reimb-evidence__ops">
                        <a
                          className="btn btn--sm btn--secondary"
                          href={client.reimburseEvidenceDownloadUrl(entry.id, item.id)}
                          download
                        >
                          {t('archive.download')}
                        </a>
                        {isOwner ? (
                          <button
                            type="button"
                            className="btn btn--sm btn--ghost"
                            disabled={deleteMutation.isPending}
                            onClick={() => deleteMutation.mutate(item.id)}
                          >
                            {t('reimb.evidence.delete')}
                          </button>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}

          <input
            ref={fileInputRef}
            type="file"
            accept={REIMBURSE_EVIDENCE_ACCEPT}
            style={{ display: 'none' }}
            onChange={onFileChosen}
          />
        </div>
      ) : null}
    </div>
  );
}
