import { describe, expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Toolbar } from '../src/shared/ui/Toolbar';

describe('Toolbar', () => {
  test('defaults to wrapping', () => {
    const html = renderToStaticMarkup(<Toolbar />);
    expect(html).toContain('class="ui-toolbar"');
    expect(html).not.toContain('--nowrap');
  });

  test('supports end alignment', () => {
    expect(renderToStaticMarkup(<Toolbar align="end" />)).toContain('ui-toolbar--end');
  });

  test('supports nowrap', () => {
    expect(renderToStaticMarkup(<Toolbar wrap={false} />)).toContain('ui-toolbar--nowrap');
  });
});
