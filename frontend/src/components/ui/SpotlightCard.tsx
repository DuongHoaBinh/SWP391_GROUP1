'use client';

import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface SpotlightCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  spotlightColor?: string;
  spotlightSize?: number;
  borderColor?: string;
  withBorderGlow?: boolean;
}

export function SpotlightCard({
  children,
  className = '',
  spotlightColor = 'rgba(180, 154, 104, 0.08)',
  spotlightSize = 300,
  borderColor = 'rgba(216, 206, 190, 0.9)',
  withBorderGlow = false,
  style = {},
  onMouseMove,
  onMouseEnter,
  onMouseLeave,
  ...props
}: SpotlightCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const coordsRef = useRef<{ x: string; y: string }>({ x: '50%', y: '50%' });
  const [isHovered, setIsHovered] = useState(false);
  const [disableSpotlight, setDisableSpotlight] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const coarse = window.matchMedia?.('(pointer: coarse)').matches;
    if (reduced || coarse) setDisableSpotlight(true);
  }, []);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    onMouseMove?.(e);
    if (disableSpotlight) return;
    const node = cardRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const x = `${e.clientX - rect.left}px`;
    const y = `${e.clientY - rect.top}px`;
    coordsRef.current = { x, y };
    node.style.setProperty('--mouse-x', x);
    node.style.setProperty('--mouse-y', y);
  };

  return (
    <div
      ref={cardRef}
      {...props}
      onMouseMove={handleMouseMove}
      onMouseEnter={(e) => {
        onMouseEnter?.(e);
        if (!disableSpotlight) setIsHovered(true);
      }}
      onMouseLeave={(e) => {
        onMouseLeave?.(e);
        setIsHovered(false);
      }}
      className={cn('relative overflow-hidden transition-all duration-300', className)}
      style={{
        ['--mouse-x' as string]: coordsRef.current.x,
        ['--mouse-y' as string]: coordsRef.current.y,
        ...style,
      }}
    >
      {!disableSpotlight && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 transition-opacity duration-300"
          style={{
            opacity: isHovered ? 1 : 0,
            background: `radial-gradient(circle ${spotlightSize}px at var(--mouse-x) var(--mouse-y), ${spotlightColor}, transparent 80%)`,
          }}
        />
      )}

      {!disableSpotlight && withBorderGlow && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[inherit] transition-opacity duration-300"
          style={{
            opacity: isHovered ? 1 : 0,
            border: '1px solid transparent',
            maskImage: `radial-gradient(circle ${spotlightSize * 0.85}px at var(--mouse-x) var(--mouse-y), black, transparent)`,
            WebkitMaskImage: `radial-gradient(circle ${spotlightSize * 0.85}px at var(--mouse-x) var(--mouse-y), black, transparent)`,
            boxShadow: `inset 0 0 0 1px ${borderColor}`,
          }}
        />
      )}

      <div className="relative h-full w-full">{children}</div>
    </div>
  );
}
