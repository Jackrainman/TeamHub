export const FINANCE_LAYOUT_STORAGE_KEY = 'teamhub.reimburse.financeLayout';

export type FinanceLayout = 'a' | 'b' | 'c';

export function normalizeFinanceLayout(value: string | null): FinanceLayout {
  return value === 'a' || value === 'c' || value === 'b' ? value : 'b';
}

export function readFinanceLayout(storage: Pick<Storage, 'getItem'> | null): FinanceLayout {
  try {
    return normalizeFinanceLayout(storage?.getItem(FINANCE_LAYOUT_STORAGE_KEY) ?? null);
  } catch {
    return 'b';
  }
}

export function writeFinanceLayout(storage: Pick<Storage, 'setItem'> | null, layout: FinanceLayout): void {
  try {
    storage?.setItem(FINANCE_LAYOUT_STORAGE_KEY, layout);
  } catch {
    // 禁用存储时仍保留当前会话内的排版选择。
  }
}
