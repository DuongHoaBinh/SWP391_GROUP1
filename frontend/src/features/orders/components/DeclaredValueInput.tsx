'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { formatDeclaredValue, normalizeDeclaredValuePaste, parseDeclaredValueEntry } from '../declared-value-input';

const useInputLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function DeclaredValueInput({ value, onChange, invalid, describedBy }: {
  value: string; onChange: (value: string) => void; invalid: boolean; describedBy: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);
  const display = formatDeclaredValue(value);
  useInputLayoutEffect(() => {
    if (caret.current == null || !input.current) return;
    let position = 0, remaining = caret.current;
    while (position < input.current.value.length && remaining > 0) {
      if (input.current.value[position] !== '.') remaining--;
      position++;
    }
    input.current.setSelectionRange(position, position);
    caret.current = null;
  });

  const change = (entry: string, position: number) => {
    const parsed = parseDeclaredValueEntry(entry);
    if (parsed == null) return;
    caret.current = entry.slice(0, position).replace(/\./g, '').length;
    onChange(parsed);
  };
  return <input ref={input} type="text" inputMode="decimal" autoComplete="off" value={display}
    aria-invalid={invalid} aria-describedby={describedBy} placeholder="Ví dụ: 1.000.000"
    onChange={event => change(event.target.value, event.target.selectionStart ?? event.target.value.length)}
    onBlur={() => { if (value.endsWith('.')) onChange(value.slice(0, -1)); }}
    onPaste={event => {
      event.preventDefault();
      const pasted = normalizeDeclaredValuePaste(event.clipboardData.getData('text'));
      if (pasted == null) return;
      const start = event.currentTarget.selectionStart ?? display.length;
      const end = event.currentTarget.selectionEnd ?? start;
      change(display.slice(0, start) + pasted + display.slice(end), start + pasted.length);
    }}
    className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 tabular-nums focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200" />;
}
