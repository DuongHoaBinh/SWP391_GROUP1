'use client';

import React from 'react';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export function AuthShowcasePanel() {
  const { language } = useLanguage();
  const isEn = language === 'en';

  return (
    <div
      className="brand-showcase-panel p-10 xl:p-14"
      style={{
        flex: '1 1 50%',
        minHeight: '100dvh',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backgroundColor: '#181A17',
        overflow: 'hidden',
      }}
    >
      {/* Enterprise Luxury Layered Radial Accent */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(circle at 18% 22%, rgba(180, 154, 104, 0.14) 0%, transparent 48%), radial-gradient(circle at 82% 76%, rgba(166, 124, 46, 0.10) 0%, transparent 52%), linear-gradient(145deg, #1E201C 0%, #181A17 55%, #121411 100%)',
          pointerEvents: 'none',
        }}
      />

      {/* Watermark racehorse background (faded into the dark brand surface) */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            "url('https://images.unsplash.com/photo-1553284965-83fd3e82fa5a?auto=format&fit=crop&w=1400&q=80')",
          backgroundSize: 'cover',
          backgroundPosition: 'center 40%',
          backgroundRepeat: 'no-repeat',
          opacity: 0.22,
          filter: 'grayscale(0.55) contrast(1.05)',
          pointerEvents: 'none',
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(180deg, rgba(24,26,23,0.78) 0%, rgba(24,26,23,0.42) 38%, rgba(24,26,23,0.62) 72%, rgba(18,20,17,0.94) 100%), linear-gradient(90deg, rgba(24,26,23,0.82) 0%, rgba(24,26,23,0.18) 100%)',
          pointerEvents: 'none',
        }}
      />

      {/* TOP HEADER: Brand Logo */}
      <div style={{ position: 'relative', zIndex: 10, display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '11px',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
            border: '1px solid rgba(180, 154, 104, 0.45)',
            backgroundColor: '#242722',
            flexShrink: 0,
          }}
        >
          <img src="/logo.png" alt="EquiTransit" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
        <div>
          <div
            style={{
              fontSize: '19px',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              color: '#F7F7F4',
              lineHeight: 1.1,
            }}
          >
            EquiTransit
          </div>
          <div
            style={{
              fontSize: '9.5px',
              fontWeight: 700,
              letterSpacing: '0.18em',
              color: '#B49A68',
              textTransform: 'uppercase',
              marginTop: '3px',
            }}
          >
            {isEn ? 'International Equine Logistics' : 'Quản Trị Vận Tải Quốc Tế'}
          </div>
        </div>
      </div>

      {/* MIDDLE SECTION: Value Statement & Authentic Platform Capabilities */}
      <div
        style={{
          position: 'relative',
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: '28px',
          margin: '28px 0',
          maxWidth: '500px',
        }}
      >
        <div>
          <h2
            style={{
              fontSize: '36px',
              fontWeight: 800,
              color: '#F7F7F4',
              lineHeight: 1.15,
              letterSpacing: '-0.03em',
              marginBottom: '12px',
            }}
          >
            {isEn ? (
              <>
                Cross-Border Equine
                <br />
                Transport Logistics
              </>
            ) : (
              <>
                Vận Chuyển Ngựa Đua
                <br />
                Xuyên Quốc Gia
              </>
            )}
          </h2>

          <p
            style={{
              fontSize: '15px',
              fontWeight: 400,
              color: '#94A3B8',
              lineHeight: 1.55,
              letterSpacing: '-0.01em',
            }}
          >
            {isEn
              ? 'Unified operational workspace for transport booking, quarantine clearance, route dispatch, and live transit supervision.'
              : 'Không gian điều hành thống nhất cho đặt chuyến, kiểm duyệt hồ sơ pháp lý, lập tuyến và giám sát hành trình.'}
          </p>
        </div>
      </div>

      {/* BOTTOM ROLE COVERAGE BAR */}
      <div
        style={{
          position: 'relative',
          zIndex: 10,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          paddingTop: '20px',
          borderTop: '1px solid #2C2F2A',
        }}
      >
        <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 500 }}>
          {isEn
            ? 'Owners · Managers · Specialists · Coordinators · Drivers'
            : 'Chủ ngựa · Quản lý · Chuyên viên · Điều phối · Tài xế'}
        </div>
        <div
          style={{
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: '#B49A68',
          }}
        >
          EquiTransit Portal
        </div>
      </div>
    </div>
  );
}
