'use client';

import { type BookingType } from '../booking-policy';
import { Truck, Clock } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export function BookingChoice({
  value,
  onChange,
  horseCount,
  compact = false,
}: {
  value: BookingType;
  onChange: (value: BookingType) => void;
  horseCount: number;
  compact?: boolean;
}) {
  const { t, language } = useLanguage();

  return (
    <fieldset
      className={`rounded-2xl border border-[#D8CEBE] bg-white shadow-sm ${
        compact ? 'space-y-3 p-4' : 'space-y-4 p-5'
      }`}
    >
      <legend className="px-2 text-sm font-bold text-[#181A17]">
        {t('booking.choiceLegend', 'Hình thức đặt chỗ vận chuyển')}
      </legend>
      {!compact && (
        <p className="text-xs text-[#5F6977]">
          {t(
            'booking.choiceIntro',
            'Áp dụng linh hoạt cho cả đường bộ liên tỉnh và hàng không. Chọn hình thức phù hợp với nhu cầu của bạn.'
          )}
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {(['shared_stall', 'dedicated_charter'] as const).map((type) => {
          const isSelected = value === type;
          return (
            <label
              key={type}
              className={`flex cursor-pointer flex-col justify-between rounded-xl border p-3.5 transition-all ${
                isSelected
                  ? 'border-[#181A17] bg-[#FAF8F4] ring-1 ring-[#181A17]/15'
                  : 'border-[#E5DDD0] bg-white hover:border-[#C4B38E] hover:bg-[#FAF8F4]/60'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <input
                  type="radio"
                  name="bookingType"
                  value={type}
                  checked={isSelected}
                  onChange={() => onChange(type)}
                  className="mt-0.5 h-4 w-4 accent-[#181A17]"
                />
                <div className="flex-1">
                  <div className="text-sm font-bold text-[#181A17]">
                    {type === 'shared_stall'
                      ? t('booking.sharedOptionLabel', 'Ghép ô chuồng (Shared Stall)')
                      : t('booking.charterOptionLabel', 'Bao nguyên xe (Dedicated Charter)')}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-[#5F6977]">
                    {type === 'shared_stall'
                      ? t(
                          'booking.sharedOptionDesc',
                          'Tiết kiệm chi phí bằng cách ghép ô chuồng cùng các chủ ngựa khác trên cùng hành lang vận chuyển. Cước tính theo từng ô chuồng.'
                        )
                      : t(
                          'booking.charterOptionDesc',
                          'Xe thùng hoặc khoang bay chuyên dụng dành riêng 100% cho đoàn ngựa của bạn. Ưu tiên đi thẳng, chủ động lịch xuất phát.'
                        )}
                  </p>
                </div>
              </div>

              <div className="mt-2.5 border-t border-[#EFEAE0] pt-2 text-[11.5px] font-semibold text-[#8C6621]">
                {type === 'shared_stall'
                  ? horseCount > 0 && horseCount <= 2
                    ? t('booking.sharedRecommendedFit', 'Khuyên dùng cho 1–2 ngựa (Phù hợp với số lượng đang chọn)')
                    : t('booking.sharedRecommended', 'Khuyên dùng cho 1–2 ngựa')
                  : horseCount >= 3
                    ? t('booking.charterRecommendedFit', 'Thích hợp từ 3 ngựa trở lên hoặc cần đi thẳng (Gợi ý cho đoàn của bạn)')
                    : t('booking.charterRecommended', 'Thích hợp từ 3 ngựa trở lên hoặc cần đi thẳng')}
              </div>
            </label>
          );
        })}
      </div>

      {value === 'shared_stall' ? (
        <div className="flex items-start gap-2 rounded-xl border border-[#DFCA9A] bg-[#FAF8F4] px-3.5 py-2.5 text-xs text-[#5F6977]">
          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#A67C2E]" aria-hidden="true" />
          <span>
            {language === 'en' ? (
              <>
                <strong className="text-[#181A17]">Shared Stall Policy:</strong> Book at least{' '}
                <strong className="text-[#181A17]">3 days</strong> ahead (domestic) or{' '}
                <strong className="text-[#181A17]">5 days</strong> (international); consolidation locks at{' '}
                <strong className="text-[#181A17]">72h</strong> before departure. If shared quota is unmet, you may reschedule free of charge or upgrade to Dedicated Charter.
              </>
            ) : (
              <>
                <strong className="text-[#181A17]">Lưu ý Ghép ô chuồng:</strong> Đặt trước tối thiểu{' '}
                <strong className="text-[#181A17]">3 ngày</strong> (nội địa) /{' '}
                <strong className="text-[#181A17]">5 ngày</strong> (quốc tế), chốt sổ ghép chuyến trước{' '}
                <strong className="text-[#181A17]">72h</strong>. Nếu chưa đủ số lượng ghép, bạn được dời chuyến kế tiếp miễn phí hoặc nâng cấp Bao nguyên xe.
              </>
            )}
          </span>
        </div>
      ) : (
        <div className="flex items-start gap-2 rounded-xl border border-[#D8CEBE] bg-[#FAF8F4] px-3.5 py-2.5 text-xs text-[#5F6977]">
          <Truck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#A67C2E]" aria-hidden="true" />
          <span>
            {language === 'en' ? (
              <>
                <strong className="text-[#181A17]">Dedicated Charter:</strong> Private door-to-door express fleet with flexible booking from{' '}
                <strong className="text-[#181A17]">2 days</strong> ahead (domestic) or{' '}
                <strong className="text-[#181A17]">5 days</strong> (international) and custom departure scheduling.
              </>
            ) : (
              <>
                <strong className="text-[#181A17]">Bao nguyên xe:</strong> Xe chuyên dụng chạy thẳng riêng cho đoàn, đặt linh hoạt từ{' '}
                <strong className="text-[#181A17]">2 ngày</strong> trước khởi hành (nội địa) /{' '}
                <strong className="text-[#181A17]">5 ngày</strong> (quốc tế), chủ động giờ xuất phát.
              </>
            )}
          </span>
        </div>
      )}
    </fieldset>
  );
}
