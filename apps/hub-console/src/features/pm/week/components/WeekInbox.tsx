import { useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { useI18n } from '../../../../i18n';

export function WeekInbox({ disabled, pending, onSubmit }: {
  disabled: boolean;
  pending: boolean;
  onSubmit: (title: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');

  async function submit() {
    const value = title.trim();
    if (!value || disabled || pending) return;
    await onSubmit(value);
    setTitle('');
    // 连续录入不离开输入框；失败时保留原文，交由全局错误提示说明原因。
    input.current?.focus();
  }

  return (
    <section className="card week-inbox" aria-label={t('week.inbox.title')}>
      <Plus size={16} aria-hidden="true" />
      <input
        ref={input}
        value={title}
        disabled={disabled}
        onChange={event => setTitle(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            void submit();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            setTitle('');
            event.currentTarget.blur();
          }
        }}
        placeholder={t('week.inbox.placeholder')}
        aria-label={t('week.inbox.title')}
        aria-keyshortcuts="Control+Enter Meta+Enter"
      />
      <span className="week-inbox__hint">{t('week.inbox.hint')}</span>
      <button type="button" className="btn" disabled={!title.trim() || disabled || pending} onClick={() => void submit()}>
        {t('week.submit')}
      </button>
    </section>
  );
}
