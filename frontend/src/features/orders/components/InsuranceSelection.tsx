'use client';

import { useState } from 'react';
import { CheckCircle2, Shield } from 'lucide-react';
import {
  defaultInsurance,
  insuranceNames,
  previewInsurance,
  unchangedInsurance,
  vnd,
  type InsuranceInput,
  type InsurancePackage,
  type InsurancePolicy,
  type InsuredHorse,
} from '../insurance-policy';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { InsuranceComparison } from './InsuranceComparison';

export function InsuranceSelection({
  horses,
  values,
  onChange,
  policy,
  error,
  onRetry,
  savedPolicies,
  isRoundTrip,
}: {
  horses: Array<{ id: string; name: string; quantity?: number }>;
  values: Record<string, InsuranceInput>;
  onChange: (id: string, value: InsuranceInput) => void;
  policy: InsurancePolicy | null;
  error?: string;
  onRetry: () => void;
  savedPolicies?: Record<string, InsuredHorse>;
  isRoundTrip?: boolean;
}) {
  const { t, language } = useLanguage();
  const isEn = language === 'en';
  const [compareHorseId, setCompareHorseId] = useState<string | null>(null);

  const getPackageLabel = (code: InsurancePackage) => {
    if (isEn) {
      if (code === 'basic') return 'Basic';
      if (code === 'standard') return 'Standard';
      return 'Premium';
    }
    return insuranceNames[code];
  };

  const getPackageShortSummary = (code: InsurancePackage) => {
    if (isEn) {
      if (code === 'basic') return 'Cap 50M · No emergency vet';
      if (code === 'standard') return '1.5% · Up to 80% · Vet ≤ 20M';
      return '3% · 100% value · Full vet care';
    }
    if (code === 'basic') return 'Trần 50tr · Không thú y khẩn cấp';
    if (code === 'standard') return '1,5% · Đền đến 80% · Thú y ≤ 20tr';
    return '3% · Đền 100% · Toàn bộ thú y';
  };

  const computePackageFee = (
    declaredValueStr: string,
    pkg: InsurancePackage,
    saved?: InsuredHorse,
  ) => {
    const oneWay = previewInsurance(
      { declaredValue: declaredValueStr, declaredCurrency: 'VND', insurancePackage: pkg },
      policy,
      saved,
    ).fee;
    return isRoundTrip ? oneWay + Math.round(oneWay * 0.9) : oneWay;
  };

  const activeCompareHorse = compareHorseId
    ? horses.find((h) => h.id === compareHorseId) ?? null
    : null;
  const activeCompareValue = activeCompareHorse
    ? values[activeCompareHorse.id] ?? defaultInsurance
    : defaultInsurance;

  return (
    <section
      aria-label={t('insurance.sectionAriaLabel', 'Giá trị và bảo hiểm vận chuyển')}
      className="mt-6 space-y-4 border-t border-[#D8CEBE] pt-5"
    >
      <div>
        <h4 className="font-semibold text-[#181A17] m-0">
          {t('insurance.heading', 'Giá trị & bảo hiểm vận chuyển')}
        </h4>
      </div>

      {error && (
        <p role="alert" className="text-sm text-[#9E3B3B] m-0">
          {error}{' '}
          <button type="button" className="min-h-9 underline cursor-pointer" onClick={onRetry}>
            {t('insurance.reloadPolicyBtn', 'Tải lại chính sách')}
          </button>
        </p>
      )}

      {horses.map((horse) => {
        const value = values[horse.id] ?? defaultInsurance;
        const saved = savedPolicies?.[horse.id];
        const preview = previewInsurance(value, policy, saved);
        const keepsPolicy = saved && unchangedInsurance(value, saved);
        const rate = keepsPolicy ? saved.exchangeRate : policy?.usdToVnd;
        const effectiveFee = isRoundTrip ? preview.fee + Math.round(preview.fee * 0.9) : preview.fee;
        const qty = horse.quantity ?? 1;

        return (
          <fieldset
            key={horse.id}
            className="space-y-3 rounded-xl border border-[#D8CEBE] bg-[#FAF8F4]/50 p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <legend className="p-0 font-bold text-sm text-[#181A17]">
                {horse.name} · {qty} {t('common.horsesUnit', 'ngựa')}
              </legend>
              <button
                type="button"
                onClick={() => setCompareHorseId(horse.id)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#DFCA9A] bg-white hover:bg-[#FAF8F4] px-2.5 py-1 text-xs font-bold text-[#8C6621] transition-colors cursor-pointer"
              >
                <Shield className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{isEn ? 'Package benefits' : 'Quyền lợi các gói'}</span>
              </button>
            </div>

            <div>
              <label className="text-xs font-semibold text-[#181A17] block">
                {t('insurance.declaredValueLabel', 'Giá trị ước tính / ngựa')} (VNĐ)
                <input
                  type="number"
                  min="0"
                  max="9999999999999.99"
                  step="0.01"
                  inputMode="decimal"
                  value={value.declaredValue}
                  aria-invalid={Boolean(preview.error)}
                  aria-describedby={`insurance-help-${horse.id}`}
                  placeholder={t('insurance.declaredValuePlaceholder', 'Ví dụ: 100000000')}
                  onChange={(e) =>
                    onChange(horse.id, {
                      ...value,
                      declaredCurrency: 'VND',
                      declaredValue: e.target.value,
                    })
                  }
                  className="mt-1 min-h-10 w-full rounded-lg border border-[#D8CEBE] bg-white px-3 text-sm font-medium text-[#181A17] focus:border-[#A67C2E] focus:outline-none focus:ring-2 focus:ring-[#A67C2E]/20"
                />
              </label>
            </div>

            {keepsPolicy && (
              <p className="text-xs text-[#5B6779] m-0">
                {t(
                  'insurance.keepExistingNotice',
                  'Giữ nguyên phí và quyền lợi đã lưu nếu không thay đổi khai báo.',
                )}
              </p>
            )}
            {value.declaredCurrency === 'USD' && rate && (
              <p className="text-xs text-[#5B6779] m-0">
                {keepsPolicy
                  ? t('insurance.savedRateLabel', 'Tỷ giá đã lưu')
                  : t('insurance.currentRateLabel', 'Tỷ giá khai báo hiện tại')}
                : 1 USD = {vnd(rate)}.{' '}
                {t('insurance.rateLockedNote', 'Tỷ giá được lưu khi gửi yêu cầu.')}
              </p>
            )}

            {/* 3 Compact Horizontal Package Cards */}
            <div
              role="radiogroup"
              aria-label={t('insurance.packageGroupAria', 'Gói bảo hiểm cho {name}', { name: horse.name })}
              className="grid grid-cols-1 sm:grid-cols-3 gap-2.5"
            >
              {(['basic', 'standard', 'premium'] as const).map((code) => {
                const isSelected = value.insurancePackage === code;
                const pkgFee = computePackageFee(value.declaredValue, code, saved);
                return (
                  <label
                    key={code}
                    className={`relative flex flex-col justify-between gap-1.5 rounded-xl border p-3 cursor-pointer transition-all ${
                      isSelected
                        ? 'border-[#181A17] bg-white ring-1 ring-[#181A17] shadow-xs'
                        : 'border-[#D8CEBE] bg-white/75 hover:border-[#A67C2E] hover:bg-white'
                    }`}
                  >
                    <input
                      type="radio"
                      name={`insurance-${horse.id}`}
                      value={code}
                      checked={isSelected}
                      onChange={() => onChange(horse.id, { ...value, insurancePackage: code })}
                      className="sr-only"
                    />
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="text-xs font-extrabold text-[#181A17]">
                        {isEn ? getPackageLabel(code) : `Gói ${getPackageLabel(code)}`}
                      </span>
                      {isSelected ? (
                        <CheckCircle2 className="h-4 w-4 text-[#A67C2E] shrink-0" aria-hidden="true" />
                      ) : (
                        <span className="h-3.5 w-3.5 rounded-full border border-[#C7BFA9] shrink-0" aria-hidden="true" />
                      )}
                    </div>
                    <div className="text-sm font-black font-mono text-[#8C6621]">
                      {pkgFee > 0 ? vnd(pkgFee) : isEn ? '0 VND' : '0 VNĐ'}
                      {isRoundTrip && pkgFee > 0 && (
                        <span className="ml-1 font-sans text-[10px] font-semibold text-[#5F6977]">
                          (-10%)
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-[#5F6977] leading-snug">
                      {getPackageShortSummary(code)}
                    </div>
                  </label>
                );
              })}
            </div>

            <p
              id={`insurance-help-${horse.id}`}
              role={preview.error ? 'alert' : undefined}
              className={`text-xs font-semibold m-0 ${preview.error ? 'text-[#9E3B3B]' : 'text-[#181A17]'}`}
            >
              {preview.error ||
                `${t('insurance.estimatedFeePrefix', 'Phí dự kiến')}: ${vnd(effectiveFee)} / ${t('common.horseUnit', 'ngựa')} × ${qty} = ${vnd(effectiveFee * qty)}`}
            </p>
          </fieldset>
        );
      })}

      {/* 2-Tab Comparison Popup Modal */}
      {activeCompareHorse && (
        <InsuranceComparison
          isOpen={Boolean(activeCompareHorse)}
          onClose={() => setCompareHorseId(null)}
          horseName={activeCompareHorse.name}
          declaredValueVnd={Number(activeCompareValue.declaredValue || 0)}
          selectedPackage={activeCompareValue.insurancePackage}
          onSelectPackage={(pkg) =>
            onChange(activeCompareHorse.id, { ...activeCompareValue, insurancePackage: pkg })
          }
          isRoundTrip={isRoundTrip}
          policy={policy}
        />
      )}
    </section>
  );
}
