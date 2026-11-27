import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';

export type InsurancePackage = 'basic' | 'standard' | 'premium';
export type DeclaredCurrency = 'VND' | 'USD';
export type Severity = 'M1' | 'M2' | 'M3' | 'M4';

export const INSURANCE_VERSION = 'equine-v2';
const MAX_CENTS = 999999999999999n;

export interface PayoutRule {
  packageCode: InsurancePackage;
  severity: Severity;
  payoutType: 'percent_of_value' | 'vet_cost_capped';
  percentBps: number | null;
  capVnd: number | null;
}

export const packages = [
  {
    code: 'basic',
    name: 'Cơ bản',
    feeBasisPoints: 0,
    minimumFeeVnd: 0,
    compensationBasisPoints: 10000,
    compensationCapVnd: 50000000,
    emergencyVetCovered: false,
    emergencyVetCapVnd: null,
  },
  {
    code: 'standard',
    name: 'Tiêu chuẩn',
    feeBasisPoints: 150,
    minimumFeeVnd: 1000000,
    compensationBasisPoints: 8000,
    compensationCapVnd: null,
    emergencyVetCovered: true,
    emergencyVetCapVnd: 20000000,
  },
  {
    code: 'premium',
    name: 'Toàn diện',
    feeBasisPoints: 300,
    minimumFeeVnd: 2000000,
    compensationBasisPoints: 10000,
    compensationCapVnd: null,
    emergencyVetCovered: true,
    emergencyVetCapVnd: null,
  },
] as const;

export const DEFAULT_PAYOUT_RULES_V2: PayoutRule[] = [
  // basic
  { packageCode: 'basic', severity: 'M1', payoutType: 'vet_cost_capped', percentBps: null, capVnd: 5000000 },
  { packageCode: 'basic', severity: 'M2', payoutType: 'vet_cost_capped', percentBps: null, capVnd: 10000000 },
  { packageCode: 'basic', severity: 'M3', payoutType: 'percent_of_value', percentBps: 2000, capVnd: 50000000 },
  { packageCode: 'basic', severity: 'M4', payoutType: 'percent_of_value', percentBps: 10000, capVnd: 50000000 },
  // standard
  { packageCode: 'standard', severity: 'M1', payoutType: 'vet_cost_capped', percentBps: 100, capVnd: null },
  { packageCode: 'standard', severity: 'M2', payoutType: 'percent_of_value', percentBps: 1500, capVnd: null },
  { packageCode: 'standard', severity: 'M3', payoutType: 'percent_of_value', percentBps: 5000, capVnd: null },
  { packageCode: 'standard', severity: 'M4', payoutType: 'percent_of_value', percentBps: 8000, capVnd: null },
  // premium
  { packageCode: 'premium', severity: 'M1', payoutType: 'vet_cost_capped', percentBps: 200, capVnd: null },
  { packageCode: 'premium', severity: 'M2', payoutType: 'percent_of_value', percentBps: 3000, capVnd: null },
  { packageCode: 'premium', severity: 'M3', payoutType: 'percent_of_value', percentBps: 8000, capVnd: null },
  { packageCode: 'premium', severity: 'M4', payoutType: 'percent_of_value', percentBps: 10000, capVnd: null },
];

export const SEVERITY_DEFINITIONS: Record<
  Severity,
  { nameVi: string; nameEn: string; definitionVi: string; requiredEvidenceVi: string }
> = {
  M1: {
    nameVi: 'Nhẹ',
    nameEn: 'Minor',
    definitionVi: 'Trầy xước, căng thẳng, mất nước nhẹ; hồi phục dưới 7 ngày; không ảnh hưởng thi đấu',
    requiredEvidenceVi: 'Ảnh bàn giao + nhật ký sinh hiệu',
  },
  M2: {
    nameVi: 'Trung bình',
    nameEn: 'Moderate',
    definitionVi: 'Chấn thương hoặc bệnh cần điều trị 7-30 ngày; tạm nghỉ thi đấu',
    requiredEvidenceVi: 'Giấy khám thú y + hóa đơn điều trị',
  },
  M3: {
    nameVi: 'Nặng',
    nameEn: 'Severe',
    definitionVi: 'Điều trị trên 30 ngày hoặc mất khả năng thi đấu vĩnh viễn (Loss of Use)',
    requiredEvidenceVi: 'Kết luận của bác sĩ thú y độc lập',
  },
  M4: {
    nameVi: 'Tử vong',
    nameEn: 'Catastrophic / Death',
    definitionVi:
      'Tử vong hoặc an tử nhân đạo theo chỉ định thú y trong lúc vận chuyển, hoặc trong 72 giờ sau bàn giao do nguyên nhân vận chuyển',
    requiredEvidenceVi: 'Biên bản + kết luận thú y',
  },
};

export function insurancePolicy(customRules?: PayoutRule[]) {
  const raw = process.env.INSURANCE_USD_TO_VND?.trim();
  if (raw && (!/^\d+(\.\d{1,6})?$/.test(raw) || Number(raw) <= 0 || Number(raw) > 1000000)) {
    throw new ServiceUnavailableException('Tỷ giá khai báo bảo hiểm USD chưa được cấu hình hợp lệ');
  }
  return {
    version: INSURANCE_VERSION,
    currency: 'VND',
    usdToVnd: raw ? Number(raw) : null,
    packages: packages.map((p) => ({
      code: p.code,
      name: p.name,
      feeBasisPoints: p.feeBasisPoints,
      feePercent: p.feeBasisPoints / 100,
      minimumFeeVnd: p.minimumFeeVnd,
      compensationBasisPoints: p.compensationBasisPoints,
      compensationCapVnd: p.compensationCapVnd,
      emergencyVetCovered: p.emergencyVetCovered,
      emergencyVetCapVnd: p.emergencyVetCapVnd,
    })),
    payoutRules: customRules ?? DEFAULT_PAYOUT_RULES_V2,
    severities: SEVERITY_DEFINITIONS,
    claimWindowHours: Number(process.env.INSURANCE_CLAIM_WINDOW_HOURS || 72),
  };
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

export function calculateInsurance(
  input: {
    declaredValue?: number;
    declaredCurrency?: DeclaredCurrency;
    insurancePackage?: InsurancePackage;
  },
  savedRate?: string | number,
  policyVersion?: string,
) {
  const declaredValue = input.declaredValue ?? 0;
  const declaredCurrency = input.declaredCurrency ?? 'VND';
  const insurancePackage = input.insurancePackage ?? 'basic';
  const policy = packages.find((p) => p.code === insurancePackage);
  if (!policy || !['VND', 'USD'].includes(declaredCurrency)) {
    throw new BadRequestException('Gói bảo hiểm hoặc loại tiền không hợp lệ');
  }
  const sourceCents = cents(declaredValue);
  if (insurancePackage !== 'basic' && sourceCents <= 0n) {
    throw new BadRequestException('Gói Tiêu chuẩn/Toàn diện cần giá trị ngựa lớn hơn 0');
  }
  const rate = declaredCurrency === 'VND' ? 1 : savedRate ?? insurancePolicy().usdToVnd;
  if (!rate) {
    throw new BadRequestException('Chưa hỗ trợ khai báo USD. Vui lòng nhập giá trị bằng VNĐ hoặc liên hệ bộ phận vận chuyển');
  }
  const [whole, fraction = ''] = String(rate).split('.');
  const rateMicros = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'));
  const valueVndCents = (sourceCents * rateMicros + 500000n) / 1000000n;
  if (valueVndCents > MAX_CENTS) throw new BadRequestException('Giá trị quy đổi VNĐ vượt giới hạn lưu trữ');

  // equine-v1 compatibility for old orders
  const isV1 = policyVersion === 'equine-v1';
  let insuranceFee = 0;
  let maxCompensation = 0;

  if (isV1) {
    insuranceFee = Number((valueVndCents * BigInt(policy.feeBasisPoints) + 500000n) / 1000000n);
    maxCompensation = policy.compensationCapVnd ?? Number((valueVndCents * BigInt(policy.compensationBasisPoints) + 5000n) / 10000n) / 100;
  } else {
    // equine-v2: apply minimum fee per horse for paid packages
    const rawFee = Number((valueVndCents * BigInt(policy.feeBasisPoints) + 500000n) / 1000000n);
    if (insurancePackage === 'basic') {
      insuranceFee = 0;
      maxCompensation = 50000000;
    } else {
      insuranceFee = Math.max(rawFee, policy.minimumFeeVnd);
      const declaredVnd = Number(valueVndCents) / 100;
      if (declaredVnd <= insuranceFee) {
        throw new BadRequestException(
          `Giá trị khai báo (${declaredVnd.toLocaleString('vi-VN')} VND) phải lớn hơn mức phí bảo hiểm tối thiểu (${insuranceFee.toLocaleString('vi-VN')} VND) của gói ${policy.name}. Vui lòng tăng giá trị khai báo hoặc chọn gói Cơ bản.`,
        );
      }
      if (insurancePackage === 'standard') {
        maxCompensation = Math.round(declaredVnd * 0.8);
      } else {
        // premium
        maxCompensation = declaredVnd;
      }
    }
  }

  return {
    declaredValue,
    declaredCurrency,
    exchangeRate: Number(rate),
    declaredValueVnd: Number(valueVndCents) / 100,
    insurancePackage,
    insuranceFee,
    maxCompensation,
    emergencyVetCovered: policy.emergencyVetCovered,
    insurancePolicyVersion: isV1 ? 'equine-v1' : INSURANCE_VERSION,
  };
}

export function totalInsuranceFee(horses: Array<{ insuranceFee: number; quantity: number }>) {
  let total = 0n;
  for (const horse of horses) {
    if (!Number.isSafeInteger(horse.quantity) || horse.quantity < 1) {
      throw new BadRequestException('Số lượng ngựa phải là số nguyên dương');
    }
    total += BigInt(horse.insuranceFee) * BigInt(horse.quantity);
  }
  if (total * 100n > MAX_CENTS) throw new BadRequestException('Tổng phí bảo hiểm vượt giới hạn đơn hàng');
  return Number(total);
}

export function suggestPayout(input: {
  rule: PayoutRule;
  declaredValueVnd: number;
  vetCostVnd?: number | null;
}): { amount: number; explanation: string; maxAllowed: number } {
  const { rule, declaredValueVnd, vetCostVnd } = input;
  if (rule.payoutType === 'percent_of_value') {
    if (declaredValueVnd <= 0 && rule.packageCode === 'basic' && rule.capVnd != null) {
      const capAmount = Math.round((rule.capVnd * (rule.percentBps ?? 0)) / 10000);
      return {
        amount: capAmount,
        explanation: `Ngựa chưa khai báo giá trị (> 0 VND) — mức hỗ trợ tối đa gói Cơ bản đến ${capAmount.toLocaleString('vi-VN')} VND (cần chứng từ giá trị thực tế)`,
        maxAllowed: capAmount,
      };
    }
    const rawAmount = Math.round((declaredValueVnd * (rule.percentBps ?? 0)) / 10000);
    const amount = rule.capVnd != null ? Math.min(rawAmount, rule.capVnd) : rawAmount;
    const explanation =
      rule.capVnd != null
        ? `Đền ${(rule.percentBps ?? 0) / 100}% giá trị khai báo, tối đa ${rule.capVnd.toLocaleString('vi-VN')} VND`
        : `Đền ${(rule.percentBps ?? 0) / 100}% giá trị khai báo (${amount.toLocaleString('vi-VN')} VND)`;
    return { amount, explanation, maxAllowed: amount };
  } else {
    // vet_cost_capped
    const cap = rule.capVnd ?? Math.round((declaredValueVnd * (rule.percentBps ?? 0)) / 10000);
    if (vetCostVnd != null && vetCostVnd >= 0) {
      const amount = Math.min(vetCostVnd, cap);
      return {
        amount,
        explanation: `Chi phí thú y thực tế ${vetCostVnd.toLocaleString('vi-VN')} VND (trần tối đa ${cap.toLocaleString('vi-VN')} VND)`,
        maxAllowed: cap,
      };
    } else {
      return {
        amount: cap,
        explanation: `Chi phí thú y thực tế, tối đa ${cap.toLocaleString('vi-VN')} VND (cần hóa đơn thú y)`,
        maxAllowed: cap,
      };
    }
  }
}

export function payoutTable(input: {
  packageCode: InsurancePackage;
  declaredValueVnd: number;
  rules?: PayoutRule[];
}): Record<
  Severity,
  {
    amount: number | null;
    label: string;
    payoutType: 'percent_of_value' | 'vet_cost_capped';
    cap: number | null;
    explanation: string;
  }
> {
  const allRules = input.rules && input.rules.length ? input.rules : DEFAULT_PAYOUT_RULES_V2;
  const packageRules = allRules.filter((r) => r.packageCode === input.packageCode);

  const severities: Severity[] = ['M1', 'M2', 'M3', 'M4'];
  const result = {} as Record<
    Severity,
    {
      amount: number | null;
      label: string;
      payoutType: 'percent_of_value' | 'vet_cost_capped';
      cap: number | null;
      explanation: string;
    }
  >;

  for (const sev of severities) {
    const rule = packageRules.find((r) => r.severity === sev);
    if (!rule) {
      result[sev] = {
        amount: 0,
        label: 'Không áp dụng',
        payoutType: 'percent_of_value',
        cap: null,
        explanation: 'Không có quy tắc đền bù cho mức độ này',
      };
      continue;
    }

    const suggested = suggestPayout({
      rule,
      declaredValueVnd: input.declaredValueVnd,
      vetCostVnd: null,
    });

    let label = '';
    if (rule.payoutType === 'vet_cost_capped') {
      label = `Chi phí thú y thực tế, tối đa ${suggested.amount.toLocaleString('vi-VN')} đ`;
    } else {
      const pct = (rule.percentBps ?? 0) / 100;
      label = `${suggested.amount.toLocaleString('vi-VN')} đ (${pct}% giá trị${rule.capVnd != null ? ', trần ' + rule.capVnd.toLocaleString('vi-VN') + ' đ' : ''})`;
    }

    result[sev] = {
      amount: suggested.amount,
      label,
      payoutType: rule.payoutType,
      cap: suggested.maxAllowed,
      explanation: suggested.explanation,
    };
  }

  return result;
}
