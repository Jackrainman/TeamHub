import { describe, expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Stack } from '../src/shared/ui/Stack';

describe('Stack', () => {
  test('defaults to a column with medium gap', () => {
    const html = renderToStaticMarkup(<Stack />);
    expect(html).toContain('ui-stack ui-stack--gap-3');
  });

  test('supports row direction', () => {
    expect(renderToStaticMarkup(<Stack direction="row" />)).toContain('ui-stack--row');
  });

  test('maps gap and justify, then appends custom class', () => {
    const html = renderToStaticMarkup(<Stack gap={5} justify="between" className="custom" />);
    expect(html).toContain('ui-stack--gap-5');
    expect(html).toContain('ui-stack--justify-between');
    expect(html).toContain('ui-stack--justify-between custom');
  });
});
