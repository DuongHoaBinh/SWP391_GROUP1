'use client';

import React from 'react';

/**
 * AmbientCanvas
 * Subtle warm parchment, champagne, and sapphire atmospheric depth layer.
 */
export const AmbientCanvas: React.FC = () => {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 0,
        overflow: 'hidden',
      }}
      aria-hidden="true"
    >
      {/* Orb 1: Subtle Sapphire Blue Depth (Top Right) */}
      <div
        style={{
          position: 'absolute',
          top: '-10%',
          right: '5%',
          width: '650px',
          height: '650px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(49, 93, 155, 0.11) 0%, rgba(49, 93, 155, 0.04) 50%, transparent 70%)',
          filter: 'blur(80px)',
          transform: 'translate3d(0, 0, 0)',
        }}
      />

      {/* Orb 2: Warm Champagne Gold Depth (Top Left) */}
      <div
        style={{
          position: 'absolute',
          top: '8%',
          left: '20%',
          width: '460px',
          height: '460px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(180, 154, 104, 0.12) 0%, transparent 65%)',
          filter: 'blur(75px)',
          transform: 'translate3d(0, 0, 0)',
        }}
      />

      {/* Orb 3: Soft Navy Slate Mist (Mid Left) */}
      <div
        style={{
          position: 'absolute',
          top: '32%',
          left: '10%',
          width: '540px',
          height: '540px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(23, 40, 63, 0.07) 0%, transparent 70%)',
          filter: 'blur(90px)',
          transform: 'translate3d(0, 0, 0)',
        }}
      />

      {/* Orb 4: Emerald & Warm Sage Tint (Bottom Right) */}
      <div
        style={{
          position: 'absolute',
          bottom: '5%',
          right: '14%',
          width: '500px',
          height: '500px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(40, 118, 83, 0.08) 0%, transparent 70%)',
          filter: 'blur(85px)',
          transform: 'translate3d(0, 0, 0)',
        }}
      />

      {/* Micro-dot grid texture for precision engineering clarity */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'radial-gradient(rgba(180, 154, 104, 0.24) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          opacity: 0.55,
        }}
      />
    </div>
  );
};
