import { describe, expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Card } from '../src/shared/ui/Card';

describe('Card', () => {
  test('defaults to the shared card skin', () => {
    expect(renderToStaticMarkup(<Card />)).toContain('class="card"');
  });

  test('supports muted variant', () => {
    expect(renderToStaticMarkup(<Card variant="muted" />)).toContain('ui-card--muted');
  });

  test('combines interactive variant and padding', () => {
    const html = renderToStaticMarkup(<Card variant="interactive" padding="md" />);
    expect(html).toContain('card--interactive');
    expect(html).toContain('ui-card--pad-md');
  });
});
