'use client';

import React from 'react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import type { HorseTemperament } from '@/lib/types';

interface HorseHandlingFieldsProps {
  temperament: HorseTemperament;
  onTemperamentChange: (value: HorseTemperament) => void;
}

/**
 * Tính khí của ngựa (điềm tĩnh / bình thường / khó tính).
 */
export const HorseHandlingFields: React.FC<HorseHandlingFieldsProps> = ({
  temperament,
  onTemperamentChange,
}) => {
  const { t } = useLanguage();
  const options: { key: HorseTemperament; label: string }[] = [
    { key: 'calm', label: t('horses.temperament.calm', 'Điềm tĩnh') },
    { key: 'normal', label: t('horses.temperament.normal', 'Bình thường') },
    { key: 'difficult', label: t('horses.temperament.difficult', 'Khó tính') },
  ];

  return (
    <div>
      <label className="block text-xs font-bold text-text-primary uppercase tracking-wide mb-1.5">
        {t('horses.temperament', 'Tính khí')}
      </label>
      <div className="grid grid-cols-3 gap-2 bg-surface-muted p-1.5 rounded-xl border border-border">
        {options.map((opt) => {
          const isSel = temperament === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              aria-pressed={isSel}
              onClick={() => onTemperamentChange(opt.key)}
              className={`py-2 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                isSel
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-text-secondary hover:text-text-primary hover:bg-white/70'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
