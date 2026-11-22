import { ChevronRight, FileClock, Trash2 } from 'lucide-react';
import type { ReimburseImportJob, ReimburseImportPair, ReimburseImportPendingReason } from '@teamhub/hub-contracts';
import { formatAmountFen } from '../reimburse-utils';

// 旧浏览器导入组件保留到单独清理轮次；仅做兼容导出，不再进入当前页面渲染树。
export { ReimburseUnmatchedPool } from './ReimburseUnmatchedPool';

const REASON_LABEL: Record<ReimburseImportPendingReason, string> = {
  'no-match': '缺发票或缺付款截图',
  'ambiguous-amount': '同金额候选重复',
  'no-amount': '未识别出金额',
  unsupported: '无法识别或格式不支持',
};

export function isArchivedReimburseImportJob(
  job: Pick<ReimburseImportJob, 'status' | 'confirmedEntryIds'>,
): boolean {
  return job.status === 'closed' && job.confirmedEntryIds.length > 0;
}

export function importPairAmountApproxNotice(
  pair: Pick<ReimburseImportPair, 'reasons' | 'invoiceFileIds' | 'paymentFileIds'>,
  files: ReadonlyArray<Pick<ReimburseImportJob['files'][number], 'id' | 'amountFen'>>,
): string | null {
  if (!pair.reasons.includes('amount-approx')) return null;
  const invoiceAmount = files.find(file => file.id === pair.invoiceFileIds[0])?.amountFen;
  const paymentAmount = files.find(file => file.id === pair.paymentFileIds[0])?.amountFen;
  if (invoiceAmount === null || invoiceAmount === undefined || paymentAmount === null || paymentAmount === undefined) {
    return '金额有细微差异，请核对';
  }
  return `金额相差 ${formatAmountFen(Math.abs(invoiceAmount - paymentAmount)).replace('¥', '')}，请核对`;
}

function PairFiles({ job, pair, onDeleteFile, canDelete }: {
  job: ReimburseImportJob;
  pair: ReimburseImportPair;
  onDeleteFile: (jobId: string, fileId: string) => void;
  canDelete: boolean;
}) {
  return <ul className="reimb-import-files">
    {pair.fileIds.map(fileId => {
      const file = job.files.find(item => item.id === fileId);
      if (!file) return null;
      return <li key={fileId}>
        <span><strong>{file.displayName}</strong><small>{file.role === 'invoice' ? '发票' : file.role === 'paymentShot' ? '付款截图' : file.role === 'inspection' ? '查验材料' : '未分类'} · {formatAmountFen(file.amountFen)}</small></span>
        {canDelete && file.status !== 'removed' && file.status !== 'mounted' && <button type="button" className="btn btn--sm btn--ghost" onClick={() => onDeleteFile(job.id, file.id)}><Trash2 size={14} />删除文件</button>}
      </li>;
    })}
  </ul>;
}

interface ReimburseImportJobsProps {
  jobs: ReimburseImportJob[];
  canWrite: boolean;
  finance?: boolean;
  onReview: (jobId: string, pairId: string) => void;
  onOpenEntry: (entryId: string) => void;
  onReparse: (jobId: string) => void;
  onDeleteFile: (jobId: string, fileId: string) => void;
  onDismiss: (jobId: string, pairId: string) => void;
  onClose: (jobId: string) => void;
  onPurge: (jobId: string) => void;
}

function ReimburseImportJobCard({ job, canWrite, onReview, onOpenEntry, onReparse, onDeleteFile, onDismiss, onClose, onPurge }: Omit<ReimburseImportJobsProps, 'jobs'> & { job: ReimburseImportJob }) {
  const matchedPairs = job.pairs.filter(pair => pair.status === 'matched');
  const pendingPairs = job.pairs.filter(pair => pair.status === 'pending');
  const confirmedPairs = job.pairs.filter(pair => pair.status === 'confirmed');
  return <article className="reimb-import-job" data-job-status={job.status}>
    <header><div><strong>导入作业 {job.id.slice(-8)}</strong><small>{job.createdAt.slice(0, 16).replace('T', ' ')} · {job.status === 'parsing' ? '解析中' : job.status === 'ready' ? '可审阅' : '已关闭'}</small></div>
      {canWrite && job.status !== 'parsing' && <div>
        <button type="button" className="btn btn--sm btn--secondary" onClick={() => onReparse(job.id)}>重新解析</button>
        {job.status !== 'closed' && <button type="button" className="btn btn--sm btn--ghost" onClick={() => onClose(job.id)}>关闭/归档</button>}
        {job.confirmedEntryIds.length === 0 && <button type="button" className="btn btn--sm btn--ghost" onClick={() => {
          if (window.confirm(`确定永久删除导入作业 ${job.id.slice(-8)}？该作业及其所有原件文件会一起删除，且无法恢复。`)) onPurge(job.id);
        }}><Trash2 size={14} />删除作业</button>}
      </div>}
    </header>
    {job.error && <p className="form-hint form-hint--warn" role="alert">{job.error === 'interrupted' ? '服务重启中断了识别，请重新解析。' : '本次导入未能完成，请重试。'}</p>}
    <div className="reimb-import-pools">
      <section className="reimb-import-pool" aria-label="待确认">
        <h3>待确认 <span>{matchedPairs.length}</span></h3>
        {matchedPairs.length === 0 ? <p className="reimb-import-pool__empty">暂无证据齐全的配对</p> : matchedPairs.map(pair => <div className="reimb-import-candidate" key={pair.id}>
          <div><strong>{formatAmountFen(pair.amountFen)}</strong><small>{pair.draft.summary ?? '待补充摘要'} · {importPairAmountApproxNotice(pair, job.files) ?? '高置信同价配对'}</small></div>
          <button type="button" className="btn btn--secondary btn--sm" disabled={!canWrite} onClick={() => onReview(job.id, pair.id)}>核对并建单<ChevronRight size={14} /></button>
        </div>)}
      </section>
      <section className="reimb-import-pool" aria-label="待定">
        <h3>待定 <span>{pendingPairs.length}</span></h3>
        {pendingPairs.length === 0 ? <p className="reimb-import-pool__empty">暂无待定文件</p> : pendingPairs.map(pair => <details className="reimb-import-candidate reimb-import-candidate--pending" key={pair.id}>
          <summary><span><strong>{REASON_LABEL[pair.reason ?? 'unsupported']}</strong><small>{formatAmountFen(pair.amountFen)} · {pair.fileIds.length} 个文件</small></span></summary>
          <PairFiles job={job} pair={pair} onDeleteFile={onDeleteFile} canDelete={canWrite && job.status !== 'parsing'} />
          <div className="reimb-import-candidate__actions">
            <button type="button" className="btn btn--secondary btn--sm" disabled={!canWrite} onClick={() => onReview(job.id, pair.id)}>手动建单</button>
            <button type="button" className="btn btn--ghost btn--sm" disabled={!canWrite} onClick={() => onDismiss(job.id, pair.id)}>忽略</button>
          </div>
        </details>)}
      </section>
      <section className="reimb-import-pool" aria-label="已建单">
        <h3>已建单 <span>{confirmedPairs.length}</span></h3>
        {confirmedPairs.length === 0 ? <p className="reimb-import-pool__empty">确认后会出现在这里</p> : confirmedPairs.map(pair => <div className="reimb-import-candidate" key={pair.id}>
          <div><strong>{formatAmountFen(pair.amountFen)}</strong><small>条目 {pair.confirmedEntryId}</small></div>
          {pair.confirmedEntryId && <button type="button" className="btn btn--secondary btn--sm" onClick={() => onOpenEntry(pair.confirmedEntryId!)}>查看条目</button>}
        </div>)}
      </section>
    </div>
    <details className="reimb-import-job__files">
      <summary>作业文件（{job.files.length}）</summary>
      <ul className="reimb-import-files">
        {job.files.map(file => <li key={file.id}>
          <span><strong>{file.displayName}</strong><small>{file.status === 'duplicate' ? '重复文件（未重复存盘）' : file.status === 'removed' ? `已删除 ${file.removedAt ?? ''}` : file.status === 'unreadable' ? '无法识别' : file.status === 'mounted' ? '已挂载' : file.status === 'uploading' ? '上传完成，待解析' : '已解析'} · {file.originalName}</small></span>
          {canWrite && job.status !== 'parsing' && job.status !== 'closed' && file.status !== 'removed' && file.status !== 'mounted' && <button type="button" className="btn btn--sm btn--ghost" onClick={() => onDeleteFile(job.id, file.id)}><Trash2 size={14} />删除文件</button>}
        </li>)}
      </ul>
    </details>
  </article>;
}

function ReimburseImportJobList({ jobs, ...props }: ReimburseImportJobsProps) {
  return <>{jobs.map(job => <ReimburseImportJobCard key={job.id} job={job} {...props} />)}</>;
}

export function ReimburseImportJobs({ jobs, finance = false, ...props }: ReimburseImportJobsProps) {
  const matched = jobs.flatMap(job => job.pairs.filter(pair => pair.status === 'matched')).length;
  const pending = jobs.flatMap(job => job.pairs.filter(pair => pair.status === 'pending')).length;
  const confirmed = jobs.flatMap(job => job.pairs.filter(pair => pair.status === 'confirmed')).length;
  const activeJobs = jobs.filter(job => !isArchivedReimburseImportJob(job));
  const archivedJobs = jobs.filter(isArchivedReimburseImportJob);
  const counts = [
    { label: '待确认', value: matched },
    { label: '待定', value: pending },
    { label: '已建单', value: confirmed },
  ].filter(item => item.value > 0);
  const archive = archivedJobs.length > 0 && <details className="reimb-import-jobs__archive">
    <summary>已归档（{archivedJobs.length}）</summary>
    <div className="reimb-import-jobs__list"><ReimburseImportJobList jobs={archivedJobs} {...props} /></div>
  </details>;
  if (finance && activeJobs.length === 0) {
    return <details className="reimb-import-jobs reimb-import-jobs--finance" aria-label="导入任务">
      <summary className="reimb-import-jobs__summary"><span><FileClock size={18} />导入任务</span><small>没有待处理作业</small></summary>
      {archive}
    </details>;
  }
  return <section className="reimb-import-jobs" aria-label="导入任务">
    <header className="reimb-import-jobs__head">
      <div><h2><FileClock size={18} />导入任务</h2><p>任务保存在服务器，关闭弹窗或刷新页面不会丢失。</p></div>
      <div className="reimb-import-jobs__counts" aria-label="导入任务统计">
        {counts.length > 0 ? counts.map(item => <span key={item.label}>{item.label} <strong>{item.value}</strong></span>) : <span>没有待处理</span>}
      </div>
    </header>
    {activeJobs.length === 0 ? <p className="reimb-import-jobs__empty">{archivedJobs.length > 0 ? '没有待处理的导入任务。' : '还没有导入任务。点击右上角「批量导入」开始。'}</p>
      : <div className="reimb-import-jobs__list"><ReimburseImportJobList jobs={activeJobs} {...props} /></div>}
    {archive}
  </section>;
}
