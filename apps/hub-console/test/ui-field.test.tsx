import { describe, expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Field } from '../src/shared/ui/Field';

describe('Field', () => {
  test('keeps the established label markup', () => {
    const html = renderToStaticMarkup(<Field label="名称"><input /></Field>);
    expect(html).toContain('<label class="kb-field"><span>名称</span><input');
  });

  test('marks required labels', () => {
    const html = renderToStaticMarkup(<Field label="名称" required><input /></Field>);
    expect(html).toContain('kb-field__req');
  });

  test('renders error after hint', () => {
    const html = renderToStaticMarkup(<Field label="名称" hint="格式说明" error="请修正"><input /></Field>);
    expect(html).toContain('form-hint form-hint--warn');
    expect(html).toContain('kb-field__hint');
    expect(html.indexOf('kb-field__hint')).toBeLessThan(html.indexOf('form-hint form-hint--warn'));
  });
});
