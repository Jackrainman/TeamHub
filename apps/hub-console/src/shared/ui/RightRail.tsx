import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '../../i18n';
import { EmptyState } from '../EmptyState';

export interface RightRailProps {
  title: string;
  open: boolean;
  onClose: () => void;
  children?: ReactNode;
}

export function RightRail({ title, open, onClose, children }: RightRailProps): JSX.Element {
  const { t } = useI18n();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  return (
    <aside
      id="console-right-rail"
      className="console-right-rail"
      role="complementary"
      aria-labelledby="console-right-rail-title"
      aria-hidden={!open}
      onKeyDown={event => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
          document.getElementById('console-rail-toggle')?.focus();
        }
      }}
    >
      <div className="console-right-rail__inner">
        <header className="console-right-rail__head">
          <h2 id="console-right-rail-title" className="console-right-rail__title">{title}</h2>
          <button
            type="button"
            className="icon-button console-right-rail__close"
            aria-label={t('rail.close')}
            title={t('rail.close')}
            onClick={onClose}
            ref={closeRef}
          ><X size={14} aria-hidden="true" /></button>
        </header>
        <div className="console-right-rail__body">
          {children ?? <EmptyState title={t('rail.empty.title')} desc={t('rail.empty.desc')} />}
        </div>
      </div>
    </aside>
  );
}
