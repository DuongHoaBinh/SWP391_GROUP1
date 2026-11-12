export type InsurancePackage = 'basic' | 'standard' | 'premium';
export interface InsuranceInput { declaredValue: string; declaredCurrency: 'VND' | 'USD'; insurancePackage: InsurancePackage }
export interface InsurancePolicy { version: string; usdToVnd: number | null; packages: Array<{ code: InsurancePackage; name: string; feeBasisPoints: number; compensationBasisPoints: number; compensationCapVnd: number | null; emergencyVetCovered: boolean }> }
export interface InsuredHorse {
  horseId?: number; name: string; quantity?: number; declaredValue?: number; declaredCurrency?: 'VND' | 'USD';
  exchangeRate?: number; declaredValueVnd?: number; insurancePackage?: InsurancePackage; insuranceFee?: number;
  maxCompensation?: number; emergencyVetCovered?: boolean;
}
export const defaultInsurance: InsuranceInput = { declaredValue: '', declaredCurrency: 'VND', insurancePackage: 'basic' };
export const insuranceNames = { basic: 'Cơ bản', standard: 'Tiêu chuẩn', premium: 'Toàn diện' };
export const vnd = (amount: number) => `${amount.toLocaleString('vi-VN')} VNĐ`;

export function unchangedInsurance(input: InsuranceInput, horse: InsuredHorse) {
  return Number(input.declaredValue || 0) === (horse.declaredValue ?? 0) &&
    input.declaredCurrency === (horse.declaredCurrency ?? 'VND') && input.insurancePackage === (horse.insurancePackage ?? 'basic');
}

export function previewInsurance(input: InsuranceInput, policy: InsurancePolicy | null, savedHorse?: InsuredHorse) {
  if (savedHorse && unchangedInsurance(input, savedHorse)) return { fee: savedHorse.insuranceFee ?? 0, error: null };
  const value = input.declaredValue === '' ? 0 : Number(input.declaredValue);
  if (!Number.isFinite(value) || value < 0 || value > 9999999999999.99 || (input.declaredValue !== '' && !/^\d+(\.\d{1,2})?$/.test(input.declaredValue))) return { fee: 0, error: 'Giá trị phải là số không âm, tối đa hai chữ số thập phân.' };
  if (input.insurancePackage !== 'basic' && value <= 0) return { fee: 0, error: 'Vui lòng khai báo giá trị lớn hơn 0 cho gói này.' };
  const rate = input.declaredCurrency === 'USD' ? policy?.usdToVnd : 1;
  if (!rate) return { fee: 0, error: 'Chưa có tỷ giá USD. Vui lòng chọn VNĐ.' };
  const [whole, fraction = ''] = String(value).split('.');
  const sourceCents = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, '0'));
  const [rateWhole, rateFraction = ''] = String(rate).split('.');
  const rateMicros = BigInt(rateWhole) * BigInt(1000000) + BigInt(rateFraction.padEnd(6, '0'));
  // Use the same two-stage rounding as the server: converted cents, then whole-VND premium.
  const valueVndCents = (sourceCents * rateMicros + BigInt(500000)) / BigInt(1000000);
  if (valueVndCents > BigInt('999999999999999')) return { fee: 0, error: 'Giá trị sau quy đổi VNĐ vượt giới hạn đơn hàng.' };
  const plan = policy?.packages.find(p => p.code === input.insurancePackage);
  if (!plan && input.insurancePackage !== 'basic') return { fee: 0, error: 'Đang tải chính sách. Vui lòng thử lại trước khi tiếp tục.' };
  return { fee: Number((valueVndCents * BigInt(plan?.feeBasisPoints ?? 0) + BigInt(500000)) / BigInt(1000000)), error: null };
}
