/**
 * Step 7 Prepaid & Refund Pure Policies (Frontend)
 */

export function addBusinessDays(startDate: Date, businessDays: number): Date {
  const result = new Date(startDate);
  let added = 0;
  while (added < businessDays) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    // 0 = Sunday, 6 = Saturday
    if (day !== 0 && day !== 6) {
      added++;
    }
  }
  return result;
}

const DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];

function readThreeDigits(number: number, isHead: boolean): string {
  const h = Math.floor(number / 100);
  const t = Math.floor((number % 100) / 10);
  const o = number % 10;
  const result: string[] = [];

  if (h > 0 || !isHead) {
    result.push(`${DIGITS[h]} trăm`);
  }

  if (t > 1) {
    result.push(`${DIGITS[t]} mươi`);
    if (o === 1) result.push('mốt');
    else if (o === 5) result.push('lăm');
    else if (o > 0) result.push(DIGITS[o]);
  } else if (t === 1) {
    result.push('mười');
    if (o === 5) result.push('lăm');
    else if (o > 0) result.push(DIGITS[o]);
  } else if (t === 0) {
    if (h > 0 || !isHead) {
      if (o > 0) {
        result.push(`lẻ ${DIGITS[o]}`);
      }
    } else if (o > 0) {
      result.push(DIGITS[o]);
    }
  }

  return result.join(' ');
}

export function numberToVietnameseWords(amount: number | bigint): string {
  const n = typeof amount === 'bigint' ? Number(amount) : Math.round(Number(amount || 0));
  if (!Number.isFinite(n) || n === 0) {
    return 'Không đồng chẵn';
  }
  if (n < 0) {
    return `Âm ${numberToVietnameseWords(-n).toLowerCase()}`;
  }

  const scales = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ'];
  const groups: number[] = [];
  let temp = n;
  while (temp > 0) {
    groups.push(temp % 1000);
    temp = Math.floor(temp / 1000);
  }

  const words: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const grp = groups[i];
    if (grp > 0) {
      const isHead = i === groups.length - 1;
      const grpWords = readThreeDigits(grp, isHead);
      const scale = scales[i];
      if (scale) {
        words.push(`${grpWords} ${scale}`);
      } else {
        words.push(grpWords);
      }
    }
  }

  const raw = words.join(' ').trim().replace(/\s+/g, ' ');
  const capitalized = raw.charAt(0).toUpperCase() + raw.slice(1);
  return `${capitalized} đồng chẵn`;
}

export function formatVietnamDateTime(isoString?: string | null): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (!Number.isFinite(d.getTime())) return '—';
    return d.toLocaleString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }) + ' (UTC+7)';
  } catch {
    return '—';
  }
}
