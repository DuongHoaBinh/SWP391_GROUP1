'use client';

import { insuranceNames, vnd, type InsuredHorse } from '../insurance-policy';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export function CostSummary({ transportCost, insuranceFee, totalCost }: { transportCost: number | null; insuranceFee: number; totalCost?: number }) {
  const { t } = useLanguage();

  return (
    <dl aria-label={t('insurance.costSummaryAriaLabel', 'Tóm tắt chi phí')} className="space-y-2 rounded-xl border border-[#D8CEBE] bg-[#FAF8F4] p-4 text-sm text-[#181A17]">
      <div className="flex flex-wrap justify-between gap-2">
        <dt>{t('insurance.baseFreightLabel', 'Cước vận chuyển cơ bản')}</dt>
        <dd className="font-medium">
          {transportCost === null ? t('insurance.awaitingManagerQuote', 'Chờ Manager báo giá') : vnd(transportCost)}
        </dd>
      </div>
      <div className="flex flex-wrap justify-between gap-2">
        <dt>{t('insurance.insuranceFeeLabel', 'Phí bảo hiểm')}</dt>
        <dd className="font-medium">{vnd(insuranceFee)}</dd>
      </div>
      <div className="flex flex-wrap justify-between gap-2 border-t border-[#D8CEBE] pt-2 font-semibold">
        <dt>{t('insurance.totalOrderCostLabel', 'Tổng chi phí đơn hàng')}</dt>
        <dd className="text-[#A67C2E]">
          {transportCost === null ? t('insurance.awaitingBaseFreight', 'Chờ xác nhận cước cơ bản') : vnd(totalCost ?? transportCost + insuranceFee)}
        </dd>
      </div>
    </dl>
  );
}

export function InsuranceSummary({ horses, transportCost, insuranceFee, totalCost }: { horses: InsuredHorse[]; transportCost: number | null; insuranceFee: number; totalCost?: number }) {
  const { t, language } = useLanguage();

  const getPackageLabel = (pkg?: 'basic' | 'standard' | 'premium') => {
    const code = pkg ?? 'basic';
    if (language === 'en') {
      if (code === 'basic') return 'Basic Protection';
      if (code === 'standard') return 'Standard Coverage';
      return 'Premium Full Protection';
    }
    return insuranceNames[code];
  };

  return (
    <section aria-label={t('insurance.summaryAriaLabel', 'Bảo hiểm vận chuyển')} className="space-y-4 rounded-2xl border border-[#D8CEBE] bg-white p-5 shadow-sm">
      <h4 className="font-semibold text-[#181A17]">{t('insurance.declaredAndCoverageTitle', 'Giá trị khai báo & bảo hiểm')}</h4>
      <ul className="divide-y divide-[#E8E2D8]">
        {horses.map((h, index) => (
          <li key={h.horseId ?? index} className="space-y-1 py-3 text-sm text-[#181A17]">
            <p className="font-semibold text-[#181A17]">
              {h.name} · {h.quantity ?? 1} {t('common.horsesUnit', 'ngựa')} · {t('insurance.packagePrefix', 'Gói')} {getPackageLabel(h.insurancePackage)}
            </p>
            <p>
              {t('insurance.valuePerHorse', 'Giá trị / ngựa')}: {(h.declaredValue ?? 0).toLocaleString(language === 'en' ? 'en-US' : 'vi-VN')} {h.declaredCurrency ?? 'VND'}
              {h.declaredCurrency === 'USD'
                ? ` (${t('insurance.savedExchangeRate', 'tỷ giá đã lưu')}: ${vnd(h.exchangeRate ?? 0)}/USD; ${t('insurance.equivalentLabel', 'tương đương')} ${vnd(h.declaredValueVnd ?? 0)})`
                : ''}
            </p>
            <p>
              {t('insurance.feePrefix', 'Phí')}: {vnd(h.insuranceFee ?? 0)} / {t('common.horseUnit', 'ngựa')} × {h.quantity ?? 1} = {vnd((h.insuranceFee ?? 0) * (h.quantity ?? 1))}
            </p>
            <p className="text-[#5B6779]">
              {t('insurance.maxCompensationPrefix', 'Bồi thường tối đa / ngựa')}: {vnd(h.maxCompensation ?? 50000000)}
              {h.emergencyVetCovered
                ? t('insurance.vetEmergencyIncluded', ' + toàn bộ chi phí cấp cứu thú y trên đường.')
                : h.insurancePackage === 'standard'
                ? t('insurance.standardCapSuffix', ' (80% giá trị khai báo khi tổn thất/thương tích vĩnh viễn).')
                : t('insurance.basicCapSuffix', ' theo quy định vận tải chung.')}
            </p>
          </li>
        ))}
      </ul>
      <CostSummary transportCost={transportCost} insuranceFee={insuranceFee} totalCost={totalCost} />
    </section>
  );
}
