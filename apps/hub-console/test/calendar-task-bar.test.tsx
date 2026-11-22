import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Task } from '@teamhub/hub-contracts';
import { LanguageProvider } from '../src/i18n';
import { TaskBar } from '../src/features/pm/calendar/TaskBar';

const task: Task = {
  id: 'task-1', groupId: 'grp-1', title: '拖拽样本', rawSummary: 'fixture', status: 'pending',
  ownerId: 'me', collaboratorIds: [], intrinsicComplexity: 'normal',
  createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z',
  plannedStart: '2026-11-16', plannedEnd: '2026-11-18',
};
const bar = { taskId: task.id, lane: 0, startCol: 0, endCol: 2, clippedStart: false, clippedEnd: false, spanDays: 3 };

function render(schedulable: boolean): string {
  return renderToStaticMarkup(<LanguageProvider>
    <TaskBar task={task} bar={bar} schedulable={schedulable} dragging={false} onOpen={() => undefined} onDragStart={() => undefined} />
  </LanguageProvider>);
}

describe('TaskBar scheduling affordance', () => {
  it('exposes the drag affordance only when the identity may write', () => {
    const enabled = render(true);
    expect(enabled).toContain('data-schedulable="true"');
    expect(enabled).toContain('拖拽改期');
    const disabled = render(false);
    expect(disabled).toContain('data-schedulable="false"');
    expect(disabled).not.toContain('拖拽改期');
  });
});
