import { useEffect, useReducer, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useI18n } from '../../../i18n';
import { TutorialOverlay } from './components/TutorialOverlay';
import { TutorialScene } from './components/TutorialScene';
import { initialTaskTutorialState, taskTutorialReducer } from './tutorial-machine';

export function WeekTaskTutorial({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [state, dispatch] = useReducer(taskTutorialReducer, undefined, initialTaskTutorialState);
  const closeRef = useRef(onClose);
  // 在子组件自动聚焦前记录入口；等 passive effect 再读时焦点已在教程内。
  const returnFocusRef = useRef<HTMLElement | null>(document.activeElement as HTMLElement | null);
  closeRef.current = onClose;

  useEffect(() => {
    const previousFocus = returnFocusRef.current;
    const appRoot = document.getElementById('root');
    const wasInert = appRoot?.inert ?? false;
    const previousOverflow = document.body.style.overflow;
    if (appRoot) appRoot.inert = true;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      closeRef.current();
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      if (appRoot) appRoot.inert = wasInert;
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  return createPortal(
    <section className="task-tutorial" role="dialog" aria-modal="true" aria-labelledby="task-tutorial-title">
      <header className="task-tutorial__header">
        <div>
          <h1 id="task-tutorial-title">{t('taskTutorial.title')}</h1>
          <p>{t('taskTutorial.subtitle')}</p>
        </div>
        <button type="button" className="icon-button" data-tutorial-control onClick={onClose}
          aria-label={t('taskTutorial.close')} title={t('taskTutorial.close')}>
          <X size={18} aria-hidden="true" />
        </button>
      </header>
      <div className="task-tutorial__body">
        <TutorialScene state={state} dispatch={dispatch} />
      </div>
      <TutorialOverlay phase={state.phase} dispatch={dispatch} />
    </section>,
    document.body,
  );
}
