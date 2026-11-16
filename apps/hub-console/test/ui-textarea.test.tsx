import { describe, expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Textarea } from '../src/shared/ui/Textarea';

describe('Textarea', () => {
  test('uses baseline classes', () => {
    expect(renderToStaticMarkup(<Textarea />)).toContain('class="ui-textarea ui-control"');
  });

  test('exposes invalid through aria only', () => {
    expect(renderToStaticMarkup(<Textarea invalid />)).toContain('aria-invalid="true"');
  });

  test('supports compact sizing and native rows', () => {
    const html = renderToStaticMarkup(<Textarea controlSize="sm" rows={4} />);
    expect(html).toContain('ui-control--sm');
    expect(html).toContain('rows="4"');
  });
});
