import { describe, expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Checkbox } from '../src/shared/ui/Checkbox';

describe('Checkbox', () => {
  test('renders an unchecked native checkbox', () => {
    const html = renderToStaticMarkup(<Checkbox label="启用" />);
    expect(html).toContain('type="checkbox"');
    expect(html).not.toContain('checked');
  });

  test('passes checked through', () => {
    expect(renderToStaticMarkup(<Checkbox label="启用" checked readOnly />)).toContain('checked=""');
  });

  test('reflects disabled on input and wrapper', () => {
    const html = renderToStaticMarkup(<Checkbox label="启用" disabled />);
    expect(html).toContain('disabled=""');
    expect(html).toContain('data-disabled="true"');
  });
});
