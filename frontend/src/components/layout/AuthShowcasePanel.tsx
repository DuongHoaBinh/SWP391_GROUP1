'use client';

import React from 'react';
import { Plane, ShieldCheck, CheckCircle2 } from 'lucide-react';

export function AuthShowcasePanel() {
  return (
    <div
      className="brand-showcase-panel"
      style={{
        flex: '1 1 50%',
        minHeight: '100vh',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '48px 56px',
        backgroundColor: '#0a0d14',
        overflow: 'hidden',
      }}
    >
      {/* Background Image with Layered Dark Gradients */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'url("https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=1800&auto=format&fit=crop")',
          backgroundSize: 'cover',
          backgroundPosition: 'center 35%',
          opacity: 0.28,
          filter: 'contrast(1.15) brightness(0.85)',
          pointerEvents: 'none',
        }}
      />
      {/* Dark Vignette & Gradient Overlays */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(135deg, rgba(8, 11, 18, 0.94) 0%, rgba(10, 14, 22, 0.8) 50%, rgba(7, 10, 15, 0.96) 100%)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(circle at 20% 30%, rgba(37, 99, 235, 0.12) 0%, transparent 60%)',
          pointerEvents: 'none',
        }}
      />

      {/* TOP HEADER: Brand Logo */}
      <div style={{ position: 'relative', zIndex: 10, display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div
          style={{
            width: '38px',
            height: '38px',
            borderRadius: '10px',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(37, 99, 235, 0.35)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            backgroundColor: '#0c1a2e',
            flexShrink: 0,
          }}
        >
          <img src="/logo.png" alt="RaceHorse Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
        <div>
          <div
            style={{
              fontSize: '19px',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              color: '#ffffff',
              lineHeight: 1.1,
            }}
          >
            RaceHorse
          </div>
          <div
            style={{
              fontSize: '9.5px',
              fontWeight: 700,
              letterSpacing: '0.18em',
              color: '#94a3b8',
              textTransform: 'uppercase',
              marginTop: '3px',
            }}
          >
            Logistics Management
          </div>
        </div>
      </div>

      {/* MIDDLE SECTION: Floating Trip Card & Hero Statement */}
      <div
        style={{
          position: 'relative',
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: '36px',
          margin: '40px 0',
        }}
      >
        {/* Floating Live Trip Card */}
        <div
          style={{
            maxWidth: '430px',
            width: '100%',
            backgroundColor: 'rgba(15, 20, 30, 0.78)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderRadius: '20px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            padding: '22px 24px',
            boxShadow: '0 20px 45px rgba(0, 0, 0, 0.45)',
          }}
        >
          {/* Card Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  color: '#94a3b8',
                  textTransform: 'uppercase',
                }}
              >
                Trip EQ-2418
              </div>
              <div
                style={{
                  fontSize: '14.5px',
                  fontWeight: 700,
                  color: '#ffffff',
                  marginTop: '3px',
                }}
              >
                3 thoroughbreds · Dubai World Cup
              </div>
            </div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: 'rgba(37, 99, 235, 0.22)',
                border: '1px solid rgba(59, 130, 246, 0.4)',
                borderRadius: '9999px',
                padding: '4px 10px',
                fontSize: '11.5px',
                fontWeight: 600,
                color: '#60a5fa',
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: '#3b82f6',
                  boxShadow: '0 0 8px #3b82f6',
                }}
              />
              In transit
            </div>
          </div>

          {/* Route Flight Milestones */}
          <div
            style={{
              margin: '22px 0 18px 0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              position: 'relative',
            }}
          >
            {/* LHR Node */}
            <div style={{ textAlign: 'left', minWidth: '48px' }}>
              <div
                style={{
                  width: '9px',
                  height: '9px',
                  borderRadius: '50%',
                  backgroundColor: '#64748b',
                  marginBottom: '8px',
                }}
              />
              <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#ffffff' }}>LHR</div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '1px' }}>06:40</div>
            </div>

            {/* Segment 1: Dashed Line with In-Flight Plane */}
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                margin: '0 12px',
                height: '1px',
                borderTop: '1px dashed #334155',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  backgroundColor: '#0f172a',
                  padding: '3px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Plane size={14} color="#94a3b8" style={{ transform: 'rotate(45deg)' }} />
              </div>
            </div>

            {/* LGG Node (Active) */}
            <div style={{ textAlign: 'center', minWidth: '48px' }}>
              <div
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  backgroundColor: '#3b82f6',
                  boxShadow: '0 0 0 4px rgba(59, 130, 246, 0.25)',
                  margin: '0 auto 8px auto',
                }}
              />
              <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#ffffff' }}>LGG</div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '1px' }}>10:15</div>
            </div>

            {/* Segment 2: Dotted Line */}
            <div
              style={{
                flex: 1,
                margin: '0 12px',
                height: '1px',
                borderTop: '1px dotted #334155',
              }}
            />

            {/* DXB Node */}
            <div style={{ textAlign: 'right', minWidth: '48px' }}>
              <div
                style={{
                  width: '9px',
                  height: '9px',
                  borderRadius: '50%',
                  border: '1.5px solid #64748b',
                  backgroundColor: 'transparent',
                  marginLeft: 'auto',
                  marginBottom: '8px',
                }}
              />
              <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#ffffff' }}>DXB</div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '1px' }}>21:05</div>
            </div>
          </div>

          {/* Card Footer: Health cert & ETA */}
          <div
            style={{
              paddingTop: '14px',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '11.5px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#34d399', fontWeight: 500 }}>
              <CheckCircle2 size={14} />
              Health certificates verified
            </div>
            <div style={{ color: '#94a3b8', fontWeight: 500 }}>ETA 21:05 GST</div>
          </div>
        </div>

        {/* Hero Title & Compliance Tag */}
        <div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: 'rgba(15, 23, 42, 0.8)',
              border: '1px solid rgba(148, 163, 184, 0.22)',
              borderRadius: '9999px',
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 500,
              color: '#cbd5e1',
              marginBottom: '18px',
            }}
          >
            <ShieldCheck size={14} color="#60a5fa" />
            IATA LAR & EU TRACES compliant workflows
          </div>

          <h1
            style={{
              fontSize: '44px',
              fontWeight: 800,
              color: '#ffffff',
              lineHeight: 1.15,
              letterSpacing: '-0.03em',
              marginBottom: '12px',
            }}
          >
            Cross-Border
            <br />
            Racehorse Transport
          </h1>

          <p
            style={{
              fontSize: '16px',
              fontWeight: 400,
              color: '#94a3b8',
              letterSpacing: '-0.01em',
            }}
          >
            Safe. Compliant. On Schedule.
          </p>
        </div>
      </div>

      {/* BOTTOM METRICS STATS BAR */}
      <div
        style={{
          position: 'relative',
          zIndex: 10,
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '24px',
          paddingTop: '28px',
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
        }}
      >
        <div>
          <div style={{ fontSize: '30px', fontWeight: 800, color: '#ffffff', lineHeight: 1.1 }}>38</div>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>Countries served</div>
        </div>
        <div>
          <div style={{ fontSize: '30px', fontWeight: 800, color: '#ffffff', lineHeight: 1.1 }}>4,820</div>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>Horses moved in 2026</div>
        </div>
        <div>
          <div style={{ fontSize: '30px', fontWeight: 800, color: '#ffffff', lineHeight: 1.1 }}>99.4%</div>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>On-time arrival</div>
        </div>
      </div>
    </div>
  );
}
