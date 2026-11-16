import { describe, expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Input } from '../src/shared/ui/Input';

describe('Input', () => {
  test('uses baseline classes without a false invalid state', () => {
    const html = renderToStaticMarkup(<Input />);
    expect(html).toContain('class="ui-input ui-control"');
    expect(html).not.toContain('aria-invalid');
  });

  test('exposes invalid through aria only', () => {
    expect(renderToStaticMarkup(<Input invalid />)).toContain('aria-invalid="true"');
  });

  test('supports compact sizing and native disabled', () => {
    const html = renderToStaticMarkup(<Input controlSize="sm" disabled />);
    expect(html).toContain('ui-control--sm');
    expect(html).toContain('disabled=""');
  });
});
