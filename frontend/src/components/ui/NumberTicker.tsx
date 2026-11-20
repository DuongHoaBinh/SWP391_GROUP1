'use client';

import React, { useEffect, useState } from 'react';

interface NumberTickerProps {
  value: number | string;
  duration?: number;
  padZero?: boolean;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

export function NumberTicker({
  value,
  duration = 650,
  padZero = false,
  decimals = 0,
  prefix = '',
  suffix = '',
  className = '',
}: NumberTickerProps) {
  const numericTarget = typeof value === 'number' ? value : parseFloat(value) || 0;
  const [displayValue, setDisplayValue] = useState<number>(0);

  useEffect(() => {
    let startTime: number | null = null;
    let animationFrameId: number;

    const startValue = 0;
    const change = numericTarget - startValue;

    const animate = (currentTime: number) => {
      if (!startTime) startTime = currentTime;
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      const easeOut = 1 - Math.pow(1 - progress, 3);
      const current = startValue + change * easeOut;

      setDisplayValue(current);

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(animate);
      } else {
        setDisplayValue(numericTarget);
      }
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [numericTarget, duration]);

  const formatted =
    decimals > 0
      ? displayValue.toFixed(decimals)
      : Math.round(displayValue).toString();

  const finalString =
    padZero && !decimals && parseInt(formatted, 10) < 10
      ? formatted.padStart(2, '0')
      : formatted;

  return (
    <span className={`inline-block font-mono tabular-nums tracking-tight ${className}`}>
      {prefix}
      {finalString}
      {suffix}
    </span>
  );
}
