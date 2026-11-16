import { describe, expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Button } from '../src/shared/ui/Button';

describe('Button', () => {
  test('renders variant and safe default type', () => {
    const html = renderToStaticMarkup(<Button variant="primary">保存</Button>);
    expect(html).toContain('class="btn btn--primary ui-btn"');
    expect(html).toContain('type="button"');
  });

  test('loading disables the button and exposes spinner state', () => {
    const html = renderToStaticMarkup(<Button loading>保存</Button>);
    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('ui-btn__spinner');
    expect(html).toContain('ui-btn__label--loading');
  });

  test('plain disabled does not claim loading', () => {
    const html = renderToStaticMarkup(<Button disabled>保存</Button>);
    expect(html).toContain('disabled=""');
    expect(html).not.toContain('aria-busy');
  });
});
