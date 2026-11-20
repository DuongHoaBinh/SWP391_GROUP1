'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { Flag, Loader2, MapPin, Plane } from 'lucide-react';
import {
  searchAddressSuggestions,
  type AddressSuggestion,
  type GeocodedLocation,
} from '@/lib/geo-corridors';

export interface AddressAutocompleteInputProps {
  id: string;
  name?: string;
  value: string;
  onChangeText: (text: string) => void;
  onSelectSuggestion: (address: string, geo: GeocodedLocation) => void;
  onBlur?: () => void;
  placeholder?: string;
  icon?: 'origin' | 'destination';
  domesticOnly?: boolean;
  hasError?: boolean;
  language?: string;
}

export function AddressAutocompleteInput({
  id,
  name,
  value,
  onChangeText,
  onSelectSuggestion,
  onBlur,
  placeholder,
  icon = 'origin',
  domesticOnly = false,
  hasError = false,
  language = 'vi',
}: AddressAutocompleteInputProps) {
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const suppressNextFetchRef = useRef(false);

  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    if (suppressNextFetchRef.current) {
      suppressNextFetchRef.current = false;
      return;
    }

    const trimmed = (value || '').trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setIsLoading(false);
      return;
    }

    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIsLoading(true);
      const results = await searchAddressSuggestions(trimmed, {
        domesticOnly,
        limit: 6,
        signal: controller.signal,
      });
      if (!active) return;
      setSuggestions(results);
      setActiveIndex(results.length > 0 ? 0 : -1);
      setIsLoading(false);
    }, 250);

    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [value, domesticOnly]);

  useEffect(() => {
    const handleOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const handleSelect = (item: AddressSuggestion) => {
    suppressNextFetchRef.current = true;
    setIsOpen(false);
    setActiveIndex(-1);
    onSelectSuggestion(item.fullAddress, item.geo);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || suggestions.length === 0) {
      if (event.key === 'ArrowDown' && suggestions.length > 0) {
        setIsOpen(true);
        setActiveIndex(0);
      }
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((prev) => (prev + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
    } else if (event.key === 'Enter' && activeIndex >= 0 && suggestions[activeIndex]) {
      event.preventDefault();
      handleSelect(suggestions[activeIndex]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setIsOpen(false);
    }
  };

  const showDropdown = isOpen && (isLoading || suggestions.length > 0);
  const LeftIcon = icon === 'destination' ? Flag : MapPin;

  return (
    <div ref={containerRef} className="relative">
      <LeftIcon
        size={16}
        color="#5F6977"
        aria-hidden="true"
        style={{ position: 'absolute', top: '13px', left: '12px', pointerEvents: 'none' }}
      />
      <input
        id={id}
        name={name}
        type="text"
        value={value}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showDropdown}
        aria-controls={listboxId}
        aria-activedescendant={
          showDropdown && activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined
        }
        aria-invalid={hasError}
        placeholder={placeholder}
        onFocus={() => {
          if ((value || '').trim().length >= 2) {
            setIsOpen(true);
          }
        }}
        onBlur={() => {
          setTimeout(() => setIsOpen(false), 120);
          onBlur?.();
        }}
        onChange={(e) => {
          const nextVal = e.target.value;
          onChangeText(nextVal);
          setIsOpen(nextVal.trim().length >= 2);
        }}
        onKeyDown={handleKeyDown}
        className={`w-full pl-9 pr-9 py-2.5 rounded-lg border bg-white text-[#181A17] font-medium text-sm placeholder:text-[#8892A0] focus:outline-none focus:border-[#A67C2E] focus:ring-2 focus:ring-[#A67C2E]/20 transition-all ${
          hasError ? 'border-[#B33E3E]' : 'border-[#D8CEBE]'
        }`}
      />
      {isLoading && (
        <Loader2
          size={15}
          aria-hidden="true"
          className="animate-spin text-[#A67C2E]"
          style={{ position: 'absolute', top: '13px', right: '12px', pointerEvents: 'none' }}
        />
      )}

      {showDropdown && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-full mt-1.5 rounded-xl border border-[#D8CEBE] bg-white shadow-lg z-40 max-h-64 overflow-y-auto divide-y divide-[#F0EEE8] p-1"
        >
          {isLoading && suggestions.length === 0 ? (
            <li className="px-3 py-2.5 text-xs text-[#747D88] flex items-center gap-2">
              <Loader2 size={13} className="animate-spin text-[#A67C2E]" aria-hidden="true" />
              <span>{language === 'en' ? 'Searching addresses...' : 'Đang tìm gợi ý địa chỉ...'}</span>
            </li>
          ) : (
            suggestions.map((item, idx) => {
              const isHighlighted = idx === activeIndex;
              const ItemIcon = item.category === 'airport' ? Plane : MapPin;
              return (
                <li
                  key={item.id}
                  id={`${listboxId}-opt-${idx}`}
                  role="option"
                  aria-selected={isHighlighted}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelect(item);
                  }}
                  onMouseEnter={() => setActiveIndex(idx)}
                  className={`flex items-start gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                    isHighlighted ? 'bg-[#FAF8F4]' : 'hover:bg-[#FAF8F4]'
                  }`}
                >
                  <ItemIcon
                    size={14}
                    aria-hidden="true"
                    className={`mt-0.5 shrink-0 ${
                      item.category === 'airport' ? 'text-[#A67C2E]' : 'text-[#5F6977]'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-[#181A17] truncate">
                      {item.primaryLabel}
                    </div>
                    {item.secondaryLabel && (
                      <div className="text-[11px] text-[#747D88] truncate">
                        {item.secondaryLabel}
                      </div>
                    )}
                  </div>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
