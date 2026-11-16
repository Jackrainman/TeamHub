import { describe, expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Select } from '../src/shared/ui/Select';

describe('Select', () => {
  test('uses baseline classes without a false invalid state', () => {
    const html = renderToStaticMarkup(<Select />);
    expect(html).toContain('class="ui-select ui-control"');
    expect(html).not.toContain('aria-invalid');
  });

  test('exposes invalid through aria only', () => {
    expect(renderToStaticMarkup(<Select invalid />)).toContain('aria-invalid="true"');
  });

  test('passes disabled and options through in order', () => {
    const html = renderToStaticMarkup(<Select disabled><option value="a">甲</option><option value="b">乙</option></Select>);
    expect(html).toContain('disabled=""');
    expect(html.indexOf('value="a"')).toBeLessThan(html.indexOf('value="b"'));
  });
});
