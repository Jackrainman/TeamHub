import { useCallback, useMemo, useState, type FormEvent } from 'react';

export interface FieldConfig<T> {
  initial: T;
  sticky?: boolean;
  validate?: (value: T, all: Record<string, unknown>) => string | null;
}

export type FieldsConfig<F> = {
  [K in keyof F]: FieldConfig<F[K]>;
};

export interface UseFormOptions<F> {
  fields: FieldsConfig<F>;
  valid: (values: F) => boolean;
}

export interface UseFormReturn<F> {
  values: F;
  set: <K extends keyof F>(key: K, value: F[K]) => void;
  patch: (partial: Partial<F>) => void;
  valid: boolean;
  dirty: boolean;
  errors: Partial<Record<keyof F, string | null>>;
  touch: (key: keyof F) => void;
  touchAll: () => void;
  resetAfterSubmit: () => void;
  resetAll: () => void;
  handleSubmit: (onValid: (values: F) => void) => (e: FormEvent) => void;
}

function deriveInitials<F>(fields: FieldsConfig<F>): F {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(fields)) {
    out[key] = (fields as Record<string, FieldConfig<unknown>>)[key].initial;
  }
  return out as F;
}

export function useForm<F extends object>(
  opts: UseFormOptions<F>,
): UseFormReturn<F> {
  const { fields, valid: validFn } = opts;

  const initials = useMemo(() => deriveInitials(fields), [fields]);

  const [values, setValues] = useState<F>(initials);
  const [touched, setTouched] = useState<Set<keyof F>>(() => new Set());

  const set = useCallback(<K extends keyof F>(key: K, value: F[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const patch = useCallback((partial: Partial<F>) => {
    setValues((prev) => ({ ...prev, ...partial }));
  }, []);

  const valid = useMemo(() => validFn(values), [validFn, values]);

  const dirty = useMemo(() => {
    const keys = Object.keys(fields) as (keyof F)[];
    for (const key of keys) {
      if (values[key] !== initials[key]) return true;
    }
    return false;
  }, [values, initials, fields]);

  const errors = useMemo(() => {
    const out: Partial<Record<keyof F, string | null>> = {};
    const keys = Object.keys(fields) as (keyof F)[];
    for (const key of keys) {
      const cfg = (fields as Record<string, FieldConfig<unknown>>)[key as string];
      if (cfg.validate && touched.has(key)) {
        out[key] = cfg.validate(values[key], values as Record<string, unknown>);
      }
    }
    return out;
  }, [fields, values, touched]);

  const touch = useCallback((key: keyof F) => {
    setTouched((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);

  const touchAll = useCallback(() => {
    setTouched(() => new Set(Object.keys(fields) as (keyof F)[]));
  }, [fields]);

  const resetAfterSubmit = useCallback(() => {
    setValues((prev) => {
      const next = { ...prev };
      const keys = Object.keys(fields) as (keyof F)[];
      for (const key of keys) {
        const cfg = (fields as Record<string, FieldConfig<unknown>>)[key as string];
        if (!cfg.sticky) (next as Record<string, unknown>)[key as string] = cfg.initial;
      }
      return next;
    });
    setTouched(() => new Set());
  }, [fields]);

  const resetAll = useCallback(() => {
    setValues(initials);
    setTouched(() => new Set());
  }, [initials]);

  const handleSubmit = useCallback(
    (onValid: (values: F) => void) => (e: FormEvent) => {
      e.preventDefault();
      if (!validFn(values)) {
        setTouched(() => new Set(Object.keys(fields) as (keyof F)[]));
        return;
      }
      onValid(values);
    },
    [validFn, values, fields],
  );

  return { values, set, patch, valid, dirty, errors, touch, touchAll, resetAfterSubmit, resetAll, handleSubmit };
}
