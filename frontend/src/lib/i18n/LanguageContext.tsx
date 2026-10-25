'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Language, dictionaries } from './translations';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: (key: string, fallback?: string, params?: Record<string, string | number>) => string;
  translateStatus: (status?: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const STORAGE_KEY = 'equitransit_lang';

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>('vi'); // Default to Vietnamese for the team, or English based on storage

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Language | null;
      if (stored === 'en' || stored === 'vi') {
        setLanguageState(stored);
      } else {
        // Check browser language or default to 'vi'
        const browserLang = navigator.language.startsWith('vi') ? 'vi' : 'en';
        setLanguageState(browserLang);
      }
    } catch {
      // ignore
    }
  }, []);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
      document.cookie = `${STORAGE_KEY}=${lang}; path=/; max-age=31536000; SameSite=Lax`;
    } catch {
      // ignore
    }
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguageState((prev) => {
      const next: Language = prev === 'en' ? 'vi' : 'en';
      try {
        localStorage.setItem(STORAGE_KEY, next);
        document.cookie = `${STORAGE_KEY}=${next}; path=/; max-age=31536000; SameSite=Lax`;
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const t = useCallback(
    (key: string, fallback?: string, params?: Record<string, string | number>): string => {
      const dict = dictionaries[language] || dictionaries.en;
      let text = dict[key] || (dictionaries.en && dictionaries.en[key]) || fallback || key;

      if (params) {
        Object.entries(params).forEach(([paramKey, paramValue]) => {
          text = text.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(paramValue));
        });
      }

      return text;
    },
    [language]
  );

  const translateStatus = useCallback(
    (status?: string): string => {
      if (!status) return '';
      // Normalizes: "IN_TRANSIT", "in_transit", "In Transit" -> "inTransit"
      const normalizedKey = status
        .toLowerCase()
        .replace(/[_\s-]+(.)/g, (_, c) => c.toUpperCase());
      return t(`status.${normalizedKey}`, status);
    },
    [t]
  );

  return (
    <LanguageContext.Provider value={{ language, setLanguage, toggleLanguage, t, translateStatus }}>
      {children}
    </LanguageContext.Provider>
  );
};

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    return {
      language: 'vi' as Language,
      setLanguage: () => {},
      toggleLanguage: () => {},
      t: (key: string, fallback?: string, params?: Record<string, string | number>) => {
        let text = fallback || key;
        if (params) {
          Object.entries(params).forEach(([pk, pv]) => {
            text = text.replace(new RegExp(`\\{${pk}\\}`, 'g'), String(pv));
          });
        }
        return text;
      },
      translateStatus: (status?: string) => status || '',
    };
  }
  return context;
}

export const useTranslation = useLanguage;
