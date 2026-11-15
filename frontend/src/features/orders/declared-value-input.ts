export function formatDeclaredValue(value: string) {
  if (!value) return '';
  const [whole, fraction] = value.split('.');
  const grouped = whole.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return fraction === undefined ? grouped : `${grouped || '0'},${fraction}`;
}

// Vietnamese entry: dots group thousands; comma separates the optional cents.
// Keep a plain decimal string for insurance calculations and API payloads.
export function parseDeclaredValueEntry(display: string): string | null {
  const plain = display.replace(/\./g, '').replace(',', '.');
  if (!/^\d*(?:\.\d{0,2})?$/.test(plain)) return null;
  return plain.startsWith('.') ? `0${plain}` : plain.replace(/^0+(?=\d)/, '');
}

export function normalizeDeclaredValuePaste(text: string): string | null {
  const input = text.trim().replace(/[\s\u00a0]/g, '');
  if (/^\d+\.\d{1,2}$/.test(input)) return input.replace('.', ',');
  if (/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(input)) return input.replace(/,/g, '').replace('.', ',');
  if (/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{0,2})?$/.test(input)) return input;
  return null;
}
