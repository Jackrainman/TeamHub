import { describe, expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { EmptyState } from '../src/shared/ui/EmptyState';

describe('EmptyState', () => {
  test('renders the established title markup', () => {
    const html = renderToStaticMarkup(<EmptyState title="暂无内容" />);
    expect(html).toContain('empty-state__title');
    expect(html).toContain('暂无内容');
  });

  test('renders optional description', () => {
    expect(renderToStaticMarkup(<EmptyState title="暂无内容" desc="稍后再看" />)).toContain('empty-state__desc');
  });

  test('wraps optional action', () => {
    const html = renderToStaticMarkup(<EmptyState title="暂无内容" action={<button>新建</button>} />);
    expect(html).toContain('empty-state__action');
  });
});
