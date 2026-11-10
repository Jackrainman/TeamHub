import { useLayoutEffect, useRef, useState, type CSSProperties, type Dispatch } from 'react';
import { useI18n } from '../../../../i18n';
import {
  TASK_TUTORIAL_TARGETS,
  taskTutorialProgress,
  type TaskTutorialAction,
  type TaskTutorialPhase,
} from '../tutorial-machine';

type Rect = { top: number; left: number; width: number; height: number };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

function enabledControls(root: ParentNode | null): HTMLElement[] {
  if (!root) return [];
  return [...root.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]')]
    .filter(element => element.getClientRects().length > 0);
}

export function TutorialOverlay({ phase, dispatch }: {
  phase: TaskTutorialPhase;
  dispatch: Dispatch<TaskTutorialAction>;
}) {
  const { t } = useI18n();
  const targetId = TASK_TUTORIAL_TARGETS[phase] ?? null;
  const [rect, setRect] = useState<Rect | null>(null);
  const [bubbleSize, setBubbleSize] = useState({ width: 360, height: 260 });
  const bubbleRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const target = targetId ? document.querySelector<HTMLElement>(`[data-tutorial-target="${targetId}"]`) : null;
    if (target) target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
    const measure = () => {
      const current = targetId ? document.querySelector<HTMLElement>(`[data-tutorial-target="${targetId}"]`) : null;
      const next = current?.getBoundingClientRect();
      setRect(next ? { top: next.top, left: next.left, width: next.width, height: next.height } : null);
    };
    measure();
    const frame = requestAnimationFrame(measure);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (target && observer) observer.observe(target);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [phase, targetId]);

  useLayoutEffect(() => {
    const bubble = bubbleRef.current;
    if (!bubble) return;
    const update = () => setBubbleSize({ width: bubble.offsetWidth, height: bubble.offsetHeight });
    update();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(bubble);
    return () => observer?.disconnect();
  }, [phase]);

  useLayoutEffect(() => {
    const target = targetId ? document.querySelector<HTMLElement>(`[data-tutorial-target="${targetId}"]`) : null;
    const first = enabledControls(target)[0] ?? enabledControls(bubbleRef.current)[0];
    first?.focus({ preventScroll: true });

    const allowed = () => [
      ...enabledControls(targetId ? document.querySelector(`[data-tutorial-target="${targetId}"]`) : null),
      ...enabledControls(document.querySelector('.task-tutorial')).filter(element => element.hasAttribute('data-tutorial-control')),
    ];
    const onFocus = (event: FocusEvent) => {
      const items = allowed();
      if (items.length && !items.includes(event.target as HTMLElement)) items[0].focus({ preventScroll: true });
    };
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = allowed();
      if (!items.length) return;
      const firstItem = items[0], lastItem = items.at(-1)!;
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey && (active === firstItem || !items.includes(active!))) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && (active === lastItem || !items.includes(active!))) {
        event.preventDefault();
        firstItem.focus();
      }
    };
    const onClick = (event: MouseEvent) => {
      const element = event.target as HTMLElement;
      if (element.closest('[data-tutorial-control]')) return;
      if (targetId && element.closest(`[data-tutorial-target="${targetId}"]`)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    document.addEventListener('focusin', onFocus);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('click', onClick, true);
    };
  }, [phase, targetId]);

  const mask = (style: CSSProperties) => <div className="task-tutorial__mask" data-tutorial-mask style={style} />;
  const right = rect ? rect.left + rect.width : 0;
  const bottom = rect ? rect.top + rect.height : 0;
  const width = Math.min(360, window.innerWidth - 32);
  const left = rect ? clamp(rect.left, 16, window.innerWidth - width - 16) : 16;
  const top = rect
    ? (bottom + 16 + bubbleSize.height <= window.innerHeight - 16
      ? bottom + 16
      : Math.max(16, rect.top - bubbleSize.height - 16))
    : 16;

  return <div className="task-tutorial__overlay" data-tutorial-overlay>
    {rect ? <>
      {mask({ top: 0, left: 0, width: '100%', height: Math.max(0, rect.top) })}
      {mask({ top: bottom, left: 0, width: '100%', height: Math.max(0, window.innerHeight - bottom) })}
      {mask({ top: rect.top, left: 0, width: Math.max(0, rect.left), height: rect.height })}
      {mask({ top: rect.top, left: right, width: Math.max(0, window.innerWidth - right), height: rect.height })}
      <div className="task-tutorial__spotlight" style={{ top: rect.top - 4, left: rect.left - 4, width: rect.width + 8, height: rect.height + 8 }} />
    </> : mask({ inset: 0 })}
    <div ref={bubbleRef} className={`card task-tutorial__coachmark${rect ? '' : ' task-tutorial__coachmark--center'}`}
      data-tutorial-coachmark style={rect ? { left, top, width } : undefined} role="region" aria-label={t('taskTutorial.title')}>
      <span className="task-tutorial__progress">{t('taskTutorial.progress', { current: taskTutorialProgress(phase), total: 9 })}</span>
      <h2>{t(`taskTutorial.${phase}.title`)}</h2>
      <p>{t(`taskTutorial.${phase}.body`)}</p>
      {phase === 'intro' ? <p className="task-tutorial__flow">{t('taskTutorial.flow')}</p> : null}
      <div className="task-tutorial__coachmark-actions">
        {phase === 'intro' ? <button type="button" data-tutorial-control className="btn btn--primary"
          onClick={() => dispatch({ type: 'next' })}>{t('taskTutorial.start')}</button> : null}
        {phase === 'review' ? <button type="button" data-tutorial-control className="btn btn--secondary"
          onClick={() => dispatch({ type: 'startReject' })}>{t('taskTutorial.rejectDemo')}</button> : null}
        {phase === 'finished' ? <button type="button" data-tutorial-control className="btn btn--primary"
          onClick={() => dispatch({ type: 'reset' })}>{t('taskTutorial.restart')}</button> : null}
      </div>
    </div>
  </div>;
}
