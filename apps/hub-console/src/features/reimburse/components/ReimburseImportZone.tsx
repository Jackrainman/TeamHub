import { useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import { FileUp } from 'lucide-react';
import { useI18n } from '../../../i18n';

const INVOICE_ACCEPT = '.pdf,.xml,.ofd,.zip';

/**
 * 发票导入区（REIMBURSE-PROC 阶段 4）：点击选文件（隐藏 input）/ 拖拽 onDrop / 粘贴 onPaste
 * 三入口，原生事件不引拖拽库；多文件照 KbStep 先例（Array.from + multiple）。
 * 文件只交给 onFiles 在浏览器本地解析——**本体永不上传**。
 */
export function ReimburseImportZone({
  onFiles,
  busy,
}: {
  onFiles: (files: File[]) => void;
  busy: boolean;
}) {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) {
      onFiles(files);
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    const files = Array.from(event.clipboardData.files);
    if (files.length > 0) {
      event.preventDefault();
      onFiles(files);
    }
  }

  return (
    <div
      className={dragOver ? 'reimb-import reimb-import--dragover' : 'reimb-import'}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onPaste={handlePaste}
      // 粘贴事件要落在本区：让 div 可聚焦，用户点一下即可 Ctrl+V 发票文件。
      tabIndex={0}
      role="group"
      aria-label={t('reimb.import.title')}
    >
      <p className="reimb-import__title">
        <FileUp size={15} strokeWidth={1.5} aria-hidden />
        {t('reimb.import.title')}
      </p>
      <p className="reimb-import__hint">{t('reimb.import.hint')}</p>
      <div>
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
        >
          {busy ? t('reimb.import.parsing') : t('reimb.import.pick')}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={INVOICE_ACCEPT}
          style={{ display: 'none' }}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length > 0) {
              onFiles(files);
            }
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
