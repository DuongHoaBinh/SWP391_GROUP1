import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';

export type InsurancePackage = 'basic' | 'standard' | 'premium';
export type DeclaredCurrency = 'VND' | 'USD';
export const INSURANCE_VERSION = 'equine-v1';
const MAX_CENTS = 999999999999999n;
const packages = [
  { code: 'basic', name: 'Cơ bản', feeBasisPoints: 0, compensationBasisPoints: 0, compensationCapVnd: 50000000, emergencyVetCovered: false },
  { code: 'standard', name: 'Tiêu chuẩn', feeBasisPoints: 150, compensationBasisPoints: 8000, compensationCapVnd: null, emergencyVetCovered: false },
  { code: 'premium', name: 'Toàn diện', feeBasisPoints: 300, compensationBasisPoints: 10000, compensationCapVnd: null, emergencyVetCovered: true },
] as const;

export function insurancePolicy() {
  const raw = process.env.INSURANCE_USD_TO_VND?.trim();
  if (raw && (!/^\d+(\.\d{1,6})?$/.test(raw) || Number(raw) <= 0 || Number(raw) > 1000000)) {
    throw new ServiceUnavailableException('Tỷ giá khai báo bảo hiểm USD chưa được cấu hình hợp lệ');
  }
  return { version: INSURANCE_VERSION, currency: 'VND', usdToVnd: raw ? Number(raw) : null, packages };
}

function cents(value: number) {
  if (!Number.isFinite(value) || value < 0 || !/^\d+(\.\d{1,2})?$/.test(String(value))) {
    throw new BadRequestException('Giá trị ngựa phải là số không âm, tối đa hai chữ số thập phân');
  }
  const [whole, fraction = ''] = String(value).split('.');
  const result = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (result > MAX_CENTS) throw new BadRequestException('Giá trị khai báo vượt giới hạn lưu trữ');
  return result;
}

export function calculateInsurance(input: { declaredValue?: number; declaredCurrency?: DeclaredCurrency; insurancePackage?: InsurancePackage }, savedRate?: string | number) {
  const declaredValue = input.declaredValue ?? 0;
  const declaredCurrency = input.declaredCurrency ?? 'VND';
  const insurancePackage = input.insurancePackage ?? 'basic';
  const policy = packages.find(p => p.code === insurancePackage);
  if (!policy || !['VND', 'USD'].includes(declaredCurrency)) throw new BadRequestException('Gói bảo hiểm hoặc loại tiền không hợp lệ');
  const sourceCents = cents(declaredValue);
  if (insurancePackage !== 'basic' && sourceCents <= 0n) throw new BadRequestException('Gói Tiêu chuẩn/Toàn diện cần giá trị ngựa lớn hơn 0');
  const rate = declaredCurrency === 'VND' ? 1 : savedRate ?? insurancePolicy().usdToVnd;
  if (!rate) throw new BadRequestException('Chưa hỗ trợ khai báo USD. Vui lòng nhập giá trị bằng VNĐ hoặc liên hệ bộ phận vận chuyển');
  const [whole, fraction = ''] = String(rate).split('.');
  const rateMicros = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'));
  const valueVndCents = (sourceCents * rateMicros + 500000n) / 1000000n;
  if (valueVndCents > MAX_CENTS) throw new BadRequestException('Giá trị quy đổi VNĐ vượt giới hạn lưu trữ');
  // Round the per-horse premium once to whole VND, then multiply by quantity at order level.
  const insuranceFee = Number((valueVndCents * BigInt(policy.feeBasisPoints) + 500000n) / 1000000n);
  const maxCompensation = policy.compensationCapVnd ?? Number((valueVndCents * BigInt(policy.compensationBasisPoints) + 5000n) / 10000n) / 100;
  return { declaredValue, declaredCurrency, exchangeRate: Number(rate), declaredValueVnd: Number(valueVndCents) / 100,
    insurancePackage, insuranceFee, maxCompensation, emergencyVetCovered: policy.emergencyVetCovered, insurancePolicyVersion: INSURANCE_VERSION };
}

export function totalInsuranceFee(horses: Array<{ insuranceFee: number; quantity: number }>) {
  let total = 0n;
  for (const horse of horses) {
    if (!Number.isSafeInteger(horse.quantity) || horse.quantity < 1) throw new BadRequestException('Số lượng ngựa phải là số nguyên dương');
    total += BigInt(horse.insuranceFee) * BigInt(horse.quantity);
  }
  if (total * 100n > MAX_CENTS) throw new BadRequestException('Tổng phí bảo hiểm vượt giới hạn đơn hàng');
  return Number(total);
}
