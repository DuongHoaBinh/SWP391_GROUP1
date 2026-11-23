export type InsurancePackage = 'basic' | 'standard' | 'premium';
export type DeclaredCurrency = 'VND' | 'USD';
export type Severity = 'M1' | 'M2' | 'M3' | 'M4';

export interface InsuranceInput {
  declaredValue: string;
  declaredCurrency: 'VND' | 'USD';
  insurancePackage: InsurancePackage;
}

export interface PayoutRule {
  packageCode: InsurancePackage;
  severity: Severity;
  payoutType: 'percent_of_value' | 'vet_cost_capped';
  percentBps: number | null;
  capVnd: number | null;
}

export interface InsurancePackageItem {
  code: InsurancePackage;
  name: string;
  feeBasisPoints: number;
  feePercent: number;
  minimumFeeVnd: number;
  compensationBasisPoints: number;
  compensationCapVnd: number | null;
  emergencyVetCovered: boolean;
  emergencyVetCapVnd?: number | null;
}

export interface InsurancePolicy {
  version: string;
  currency?: string;
  usdToVnd: number | null;
  packages: InsurancePackageItem[];
  payoutRules?: PayoutRule[];
  severities?: Record<Severity, { nameVi: string; nameEn: string; definitionVi: string; requiredEvidenceVi: string }>;
  claimWindowHours?: number;
}

export interface InsuredHorse {
  horseId?: number;
  name: string;
  quantity?: number;
  declaredValue?: number;
  declaredCurrency?: 'VND' | 'USD';
  exchangeRate?: number;
  declaredValueVnd?: number;
  insurancePackage?: InsurancePackage;
  insuranceFee?: number;
  maxCompensation?: number;
  emergencyVetCovered?: boolean;
}

export const defaultInsurance: InsuranceInput = {
  declaredValue: '',
  declaredCurrency: 'VND',
  insurancePackage: 'basic',
};

export const insuranceNames = {
  basic: 'Cơ bản',
  standard: 'Tiêu chuẩn',
  premium: 'Toàn diện',
};

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

export const vnd = (amount: number) => `${amount.toLocaleString('vi-VN')} VNĐ`;

export function unchangedInsurance(input: InsuranceInput, horse: InsuredHorse) {
  return (
    Number(input.declaredValue || 0) === (horse.declaredValue ?? 0) &&
    input.declaredCurrency === (horse.declaredCurrency ?? 'VND') &&
    input.insurancePackage === (horse.insurancePackage ?? 'basic')
  );
}

export function previewInsurance(
  input: InsuranceInput,
  policy: InsurancePolicy | null,
  savedHorse?: InsuredHorse,
) {
  if (savedHorse && unchangedInsurance(input, savedHorse)) {
    return { fee: savedHorse.insuranceFee ?? 0, error: null };
  }
  const value = input.declaredValue === '' ? 0 : Number(input.declaredValue);
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    value > 9999999999999.99 ||
    (input.declaredValue !== '' && !/^\d+(\.\d{1,2})?$/.test(input.declaredValue))
  ) {
    return { fee: 0, error: 'Giá trị phải là số không âm, tối đa hai chữ số thập phân.' };
  }
  if (input.insurancePackage !== 'basic' && value <= 0) {
    return { fee: 0, error: 'Vui lòng khai báo giá trị lớn hơn 0 cho gói này.' };
  }
  const rate = input.declaredCurrency === 'USD' ? policy?.usdToVnd : 1;
  if (!rate) return { fee: 0, error: 'Chưa có tỷ giá USD. Vui lòng chọn VNĐ.' };

  const [whole, fraction = ''] = String(value).split('.');
  const sourceCents = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, '0'));
  const [rateWhole, rateFraction = ''] = String(rate).split('.');
  const rateMicros = BigInt(rateWhole) * BigInt(1000000) + BigInt(rateFraction.padEnd(6, '0'));

  const valueVndCents = (sourceCents * rateMicros + BigInt(500000)) / BigInt(1000000);
  if (valueVndCents > BigInt('999999999999999')) {
    return { fee: 0, error: 'Giá trị sau quy đổi VNĐ vượt giới hạn đơn hàng.' };
  }

  if (input.insurancePackage === 'basic') {
    return { fee: 0, error: null };
  }

  const plan = policy?.packages.find((p) => p.code === input.insurancePackage);
  const minFee = plan?.minimumFeeVnd ?? (input.insurancePackage === 'standard' ? 1000000 : 2000000);
  const feeBps = plan?.feeBasisPoints ?? (input.insurancePackage === 'standard' ? 150 : 300);

  const rawFee = Number((valueVndCents * BigInt(feeBps) + BigInt(500000)) / BigInt(1000000));
  const fee = Math.max(rawFee, minFee);

  return { fee, error: null };
}

export function suggestPayout(input: {
  rule: PayoutRule;
  declaredValueVnd: number;
  vetCostVnd?: number | null;
}): { amount: number; explanation: string; maxAllowed: number } {
  const { rule, declaredValueVnd, vetCostVnd } = input;
  if (rule.payoutType === 'percent_of_value') {
    const rawAmount = Math.round((declaredValueVnd * (rule.percentBps ?? 0)) / 10000);
    const amount = rule.capVnd != null ? Math.min(rawAmount, rule.capVnd) : rawAmount;
    const explanation =
      rule.capVnd != null
        ? `Đền ${(rule.percentBps ?? 0) / 100}% giá trị khai báo, tối đa ${rule.capVnd.toLocaleString('vi-VN')} VND`
        : `Đền ${(rule.percentBps ?? 0) / 100}% giá trị khai báo (${amount.toLocaleString('vi-VN')} VND)`;
    return { amount, explanation, maxAllowed: amount };
  } else {
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
