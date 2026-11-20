'use client';

import { defaultInsurance, insuranceNames, previewInsurance, unchangedInsurance, vnd, type InsuranceInput, type InsurancePolicy, type InsuredHorse } from '../insurance-policy';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export function InsuranceSelection({ horses, values, onChange, policy, error, onRetry, savedPolicies }: {
  horses: Array<{ id: string; name: string; quantity?: number }>;
  values: Record<string, InsuranceInput>;
  onChange: (id: string, value: InsuranceInput) => void;
  policy: InsurancePolicy | null; error?: string; onRetry: () => void;
  savedPolicies?: Record<string, InsuredHorse>;
}) {
  const { t, language } = useLanguage();

  const getPackageLabel = (code: 'basic' | 'standard' | 'premium') => {
    if (language === 'en') {
      if (code === 'basic') return 'Basic Protection';
      if (code === 'standard') return 'Standard Coverage';
      return 'Premium Full Protection';
    }
    return insuranceNames[code];
  };

  return (
    <section aria-label={t('insurance.sectionAriaLabel', 'Giá trị và bảo hiểm vận chuyển')} className="mt-6 space-y-5 border-t border-[#D8CEBE] pt-5">
      <div>
        <h4 className="font-semibold text-[#181A17]">{t('insurance.heading', 'Giá trị & bảo hiểm vận chuyển')}</h4>
        <p className="mt-1 text-sm text-[#5B6779]">
          {t('insurance.subheading', 'Khai báo giá trị cho mỗi ngựa. Phí bảo hiểm được tính riêng cho từng ngựa rồi nhân với số lượng.')}
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-[#9E3B3B]">
          {error}{' '}
          <button type="button" className="min-h-10 underline cursor-pointer" onClick={onRetry}>
            {t('insurance.reloadPolicyBtn', 'Tải lại chính sách')}
          </button>
        </p>
      )}
      {horses.map(horse => {
        const value = values[horse.id] ?? defaultInsurance, saved = savedPolicies?.[horse.id];
        const preview = previewInsurance(value, policy, saved);
        const keepsPolicy = saved && unchangedInsurance(value, saved);
        const rate = keepsPolicy ? saved.exchangeRate : policy?.usdToVnd;
        return (
          <fieldset key={horse.id} className="space-y-3 rounded-xl border border-[#D8CEBE] bg-white p-4">
            <legend className="px-1 font-semibold text-[#181A17]">
              {horse.name} · {horse.quantity ?? 1} {t('common.horsesUnit', 'ngựa')}
            </legend>
            <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
              <label className="text-sm font-medium text-[#181A17]">
                {t('insurance.declaredValueLabel', 'Giá trị ước tính / ngựa')}
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
                  onChange={e => onChange(horse.id, { ...value, declaredValue: e.target.value })}
                  className="mt-1 min-h-11 w-full rounded-lg border border-[#D8CEBE] bg-white px-3 text-[#181A17] focus:border-[#181A17] focus:outline-none focus:ring-2 focus:ring-[#C4B38E]/30"
                />
              </label>
              <label className="text-sm font-medium text-[#181A17]">
                {t('insurance.currencyLabel', 'Loại tiền')}
                <select
                  value={value.declaredCurrency}
                  onChange={e => onChange(horse.id, { ...value, declaredCurrency: e.target.value as 'VND' | 'USD' })}
                  className="mt-1 min-h-11 w-full rounded-lg border border-[#D8CEBE] bg-white px-3 text-[#181A17] cursor-pointer"
                >
                  <option value="VND">VNĐ</option>
                  <option value="USD" disabled={!policy?.usdToVnd}>
                    USD{!policy?.usdToVnd ? ` (${t('insurance.noExchangeRate', 'chưa có tỷ giá')})` : ''}
                  </option>
                </select>
              </label>
            </div>
            {keepsPolicy && (
              <p className="text-xs text-[#5B6779]">
                {t('insurance.keepExistingNotice', 'Giữ nguyên phí và quyền lợi đã lưu nếu không thay đổi khai báo.')}
              </p>
            )}
            {value.declaredCurrency === 'USD' && rate && (
              <p className="text-xs text-[#5B6779]">
                {keepsPolicy ? t('insurance.savedRateLabel', 'Tỷ giá đã lưu') : t('insurance.currentRateLabel', 'Tỷ giá khai báo hiện tại')}: 1 USD = {vnd(rate)}.{' '}
                {t('insurance.rateLockedNote', 'Tỷ giá được lưu khi gửi yêu cầu.')}
              </p>
            )}
            <div role="radiogroup" aria-label={t('insurance.packageGroupAria', 'Gói bảo hiểm cho {name}', { name: horse.name })} className="divide-y divide-[#E8E2D8]">
              {(['basic', 'standard', 'premium'] as const).map(code => (
                <label key={code} className="flex min-h-14 cursor-pointer items-start gap-3 py-3">
                  <input
                    type="radio"
                    name={`insurance-${horse.id}`}
                    value={code}
                    checked={value.insurancePackage === code}
                    onChange={() => onChange(horse.id, { ...value, insurancePackage: code })}
                    className="mt-1 h-4 w-4 shrink-0 accent-[#181A17]"
                  />
                  <span className="text-sm text-[#181A17]">
                    <strong>{getPackageLabel(code)}</strong>
                    <span className="mt-1 block text-[#5B6779]">
                      {code === 'basic'
                        ? t('insurance.pkgBasicDesc', 'Phí 0 VNĐ, đã gồm trong cước. Bồi thường tối đa 50.000.000 VNĐ/ngựa theo quy định vận tải chung.')
                        : code === 'standard'
                        ? t('insurance.pkgStandardDesc', 'Phí 1,5% giá trị khai báo. Bồi thường tối đa 80% khi có tổn thất/thương tích vĩnh viễn.')
                        : t('insurance.pkgPremiumDesc', 'Phí 3% giá trị khai báo. Bồi thường 100% giá trị khai báo và toàn bộ chi phí cấp cứu thú y trên đường.')}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <p id={`insurance-help-${horse.id}`} role={preview.error ? 'alert' : undefined} className={`text-sm font-medium ${preview.error ? 'text-[#9E3B3B]' : 'text-[#181A17]'}`}>
              {preview.error || `${t('insurance.estimatedFeePrefix', 'Phí dự kiến')}: ${vnd(preview.fee)} / ${t('common.horseUnit', 'ngựa')} × ${horse.quantity ?? 1} = ${vnd(preview.fee * (horse.quantity ?? 1))}`}
            </p>
          </fieldset>
        );
      })}
    </section>
  );
}
