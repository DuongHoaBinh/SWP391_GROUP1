'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ChevronRight,
  Edit3,
  Trash2,
  CheckCircle2,
  MoreVertical,
  Check,
  Clock,
  AlertTriangle,
  Upload,
  Download,
  X,
  FileText,
  UserCheck,
  Camera,
  Loader2,
} from 'lucide-react';
import { useCustomerStore } from '@/lib/customer-store';
import { HorseDocument } from '@/lib/types';
import { DocumentUploadModal } from '@/features/documents/components/DocumentUploadModal';
import { EditHorseModal } from '@/components/horses/EditHorseModal';
import { DeleteHorseModal } from '@/components/horses/DeleteHorseModal';

export default function HorseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const horseId = params?.id as string;

  const { getHorseById, uploadDocumentForHorse, uploadDocumentForRequest, uploadHorseAvatar } = useCustomerStore();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  const horse = getHorseById(horseId) || getHorseById('hrs-001') || {
    id: 'hrs-001',
    code: 'HOR-2026-001',
    name: 'Thunder',
    breed: 'Thoroughbred',
    age: 6,
    gender: 'Male (Stallion)',
    dob: '12 May 2020',
    color: 'Bay',
    weight: '520 kg',
    microchipNumber: '985141000123456',
    passportNumber: 'HP-2026-001',
    ownerName: 'John Doe',
    medicalStatus: 'Healthy',
    vaccinationStatus: 'Up to date',
    quarantineStatus: 'Pending',
    lastExamDate: '20 Sep 2026',
    veterinarian: 'Dr. Nguyen',
    specialRequirements: 'Temperature-controlled transportation recommended.',
  };

  const [previewDoc, setPreviewDoc] = useState<HorseDocument | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);

  const hasMissingDoc = horse.documents?.some((d) => d.status === 'Missing');

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsUploadingAvatar(true);
      await uploadHorseAvatar(horse.id, file);
      setFeedbackSuccess('Cập nhật ảnh đại diện con ngựa thành công!');
      setTimeout(() => setFeedbackSuccess(null), 4000);
    } catch (err: any) {
      alert(err?.message || 'Không thể tải lên ảnh đại diện.');
    } finally {
      setIsUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleUploadSuccess = (uploadedDoc: any) => {
    uploadDocumentForHorse(horse.id, uploadedDoc.title);
    uploadDocumentForRequest('TR-2026-001', uploadedDoc.title);
    setIsUploadOpen(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Header & Breadcrumbs */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          {/* Breadcrumbs */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              color: 'var(--text-muted)',
              marginBottom: '4px',
            }}
          >
            <Link href="/customer" style={{ color: 'var(--text-muted)' }}>
              Dashboard
            </Link>
            <ChevronRight size={12} />
            <Link href="/customer/horses" style={{ color: 'var(--text-muted)' }}>
              My Horses
            </Link>
            <ChevronRight size={12} />
            <span style={{ color: 'var(--text-heading)', fontWeight: 600 }}>{horse.name}</span>
          </div>

          <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-heading)', margin: 0 }}>
            {horse.name}
          </h2>
        </div>

        {/* Header Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => router.push(`/customer/requests/new?horseId=${horse.id}`)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '9px 16px',
              borderRadius: '8px',
              backgroundColor: 'var(--primary)',
              color: '#ffffff',
              fontSize: '13.5px',
              fontWeight: 600,
              border: 'none',
              boxShadow: 'var(--shadow-sm)',
              cursor: 'pointer',
            }}
          >
            Ship This Horse
          </button>
          <button
            onClick={() => setIsEditModalOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '9px 16px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              backgroundColor: '#ffffff',
              fontSize: '13.5px',
              fontWeight: 600,
              color: 'var(--text-body)',
              boxShadow: 'var(--shadow-sm)',
              cursor: 'pointer',
            }}
          >
            <Edit3 size={15} />
            <span>Edit Horse</span>
          </button>
          <button
            onClick={() => setIsDeleteModalOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '9px 16px',
              borderRadius: '8px',
              border: '1px solid #fecaca',
              backgroundColor: '#fff5f5',
              fontSize: '13.5px',
              fontWeight: 600,
              color: '#dc2626',
              boxShadow: 'var(--shadow-sm)',
              cursor: 'pointer',
            }}
          >
            <Trash2 size={15} />
            <span>Delete Horse</span>
          </button>
        </div>
      </div>

      {feedbackSuccess && (
        <div
          style={{
            padding: '12px 18px',
            borderRadius: '10px',
            backgroundColor: '#ecfdf5',
            border: '1px solid #a7f3d0',
            color: '#065f46',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '14px',
            fontWeight: 600,
          }}
        >
          <CheckCircle2 size={18} color="#059669" />
          <span>{feedbackSuccess}</span>
        </div>
      )}

      {/* HORSE PROFILE HERO CARD */}
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          border: '1px solid var(--border-card)',
          padding: '28px',
          boxShadow: 'var(--shadow-sm)',
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: '28px',
          flexWrap: 'wrap',
        }}
      >
        {/* Avatar with click-to-upload & Camera Overlay */}
        <div style={{ position: 'relative' }}>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleAvatarChange}
            accept="image/png,image/jpeg,image/webp,image/gif"
            style={{ display: 'none' }}
          />
          <div
            onClick={() => !isUploadingAvatar && fileInputRef.current?.click()}
            title="Nhấn để đổi ảnh đại diện cho ngựa"
            style={{
              width: '130px',
              height: '130px',
              borderRadius: '50%',
              overflow: 'hidden',
              border: '4px solid #f8fafc',
              boxShadow: '0 0 0 1px #e2e8f0',
              flexShrink: 0,
              backgroundColor: '#eff6ff',
              cursor: isUploadingAvatar ? 'wait' : 'pointer',
              position: 'relative',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            }}
          >
            {horse.photoUrl ? (
              <img
                src={horse.photoUrl}
                alt={horse.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--primary)',
                }}
              >
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 17v-1c0-4-3-7-7-7H9l-2-3H3l1 5-2 3v3h10" />
                  <circle cx="8" cy="7" r="1" />
                </svg>
              </div>
            )}

            {/* Hover / Loading Overlay */}
            {isUploadingAvatar ? (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  backgroundColor: 'rgba(15, 23, 42, 0.65)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                  gap: '6px',
                }}
              >
                <Loader2 size={24} className="animate-spin" />
                <span style={{ fontSize: '11px', fontWeight: 600 }}>Uploading...</span>
              </div>
            ) : (
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  backgroundColor: 'rgba(15, 23, 42, 0.6)',
                  padding: '4px 0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  color: '#ffffff',
                  fontSize: '11px',
                  fontWeight: 600,
                  transition: 'opacity 0.2s ease',
                }}
              >
                <Camera size={13} />
                <span>Đổi ảnh</span>
              </div>
            )}
          </div>

          {/* Quick Camera Badge at bottom-right */}
          <button
            type="button"
            onClick={() => !isUploadingAvatar && fileInputRef.current?.click()}
            title="Đổi ảnh đại diện"
            style={{
              position: 'absolute',
              bottom: '4px',
              right: '4px',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              backgroundColor: '#2563eb',
              color: '#ffffff',
              border: '2px solid #ffffff',
              boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              zIndex: 2,
            }}
          >
            <Camera size={15} />
          </button>
        </div>

        {/* Details & Quick Stats */}
        <div style={{ flex: 1, minWidth: '280px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h3 style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text-heading)', margin: 0 }}>
                  {horse.name}
                </h3>
                <span
                  style={{
                    padding: '3px 10px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    backgroundColor: '#dcfce7',
                    color: '#15803d',
                    border: '1px solid #bbf7d0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#16a34a' }} />
                  {horse.medicalStatus || 'Healthy'}
                </span>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                ID: {horse.code || 'HOR-2026-001'}
              </p>
            </div>

            <button
              onClick={() => {
                const el = document.getElementById('medical-history-section');
                el?.scrollIntoView({ behavior: 'smooth' });
              }}
              style={{
                padding: '9px 18px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                backgroundColor: '#ffffff',
                color: 'var(--primary)',
                fontWeight: 600,
                fontSize: '13.5px',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              View Medical History
            </button>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '16px',
              marginTop: '24px',
              paddingTop: '16px',
              borderTop: '1px solid var(--border-light)',
            }}
          >
            <div>
              <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8' }}>
                Breed
              </span>
              <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)', margin: '2px 0 0 0' }}>
                {horse.breed}
              </p>
            </div>
            <div>
              <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8' }}>
                Gender
              </span>
              <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)', margin: '2px 0 0 0' }}>
                {horse.gender.includes('Male') ? 'Male' : horse.gender}
              </p>
            </div>
            <div>
              <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8' }}>
                Age
              </span>
              <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)', margin: '2px 0 0 0' }}>
                {horse.age} years
              </p>
            </div>
            <div>
              <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8' }}>
                Owner
              </span>
              <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)', margin: '2px 0 0 0' }}>
                {horse.ownerName}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 2-COLUMN GRID (Info & Medical) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* Card 1: Horse Information */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            border: '1px solid var(--border-card)',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div
            style={{
              padding: '16px 24px',
              borderBottom: '1px solid var(--border-light)',
              backgroundColor: '#f8fafc',
            }}
          >
            <h4 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>
              Horse Information
            </h4>
          </div>
          <div style={{ padding: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Horse ID</span>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)', marginTop: '2px' }}>
                {horse.code || 'HOR-2026-001'}
              </div>
            </div>
            <div>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Breed</span>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)', marginTop: '2px' }}>
                {horse.breed}
              </div>
            </div>
            <div>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Gender</span>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)', marginTop: '2px' }}>
                {horse.gender}
              </div>
            </div>
            <div>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Date of Birth</span>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)', marginTop: '2px' }}>
                {horse.dob || '12 May 2020'}
              </div>
            </div>
            <div>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Color</span>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)', marginTop: '2px' }}>
                {horse.color || 'Bay'}
              </div>
            </div>
            <div>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Weight</span>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)', marginTop: '2px' }}>
                {horse.weight || '520 kg'}
              </div>
            </div>
            <div>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Microchip ID</span>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)', fontFamily: 'monospace', marginTop: '2px' }}>
                {horse.microchipNumber}
              </div>
            </div>
            <div>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Passport Number</span>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)', fontFamily: 'monospace', marginTop: '2px' }}>
                {horse.passportNumber}
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Medical Information */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            border: '1px solid var(--border-card)',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-sm)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              padding: '16px 24px',
              borderBottom: '1px solid var(--border-light)',
              backgroundColor: '#f8fafc',
            }}
          >
            <h4 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>
              Medical Information
            </h4>
          </div>
          <div style={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', borderBottom: '1px solid var(--border-light)', paddingBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13.5px', color: 'var(--text-body)' }}>Medical Status</span>
                <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, backgroundColor: '#dcfce7', color: '#15803d' }}>
                  {horse.medicalStatus || 'Healthy'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13.5px', color: 'var(--text-body)' }}>Vaccination Status</span>
                <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, backgroundColor: '#dcfce7', color: '#15803d' }}>
                  {horse.vaccinationStatus || 'Up to date'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13.5px', color: 'var(--text-body)' }}>Quarantine Status</span>
                <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, backgroundColor: '#fef3c7', color: '#b45309' }}>
                  {horse.quarantineStatus || 'Pending'}
                </span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Last Medical Exam</span>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)', marginTop: '2px' }}>
                  {horse.lastExamDate || '20 Sep 2026'}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Veterinarian</span>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)', marginTop: '2px' }}>
                  {horse.veterinarian || 'Dr. Nguyen'}
                </div>
              </div>
            </div>

            <div style={{ backgroundColor: '#eff6ff', border: '1px solid #dbeafe', borderRadius: '10px', padding: '14px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>
                Special Medical Requirements
              </div>
              <div style={{ fontSize: '13.5px', color: '#1e3a8a', fontWeight: 500, marginTop: '4px' }}>
                "{horse.specialRequirements || 'Temperature-controlled transportation recommended.'}"
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* DOCUMENTS TABLE & MISSING WARNING */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Warning Banner (Shown only if documents are missing) */}
        {hasMissingDoc && (
          <div
            style={{
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '14px',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <AlertTriangle size={22} color="#dc2626" />
              <div>
                <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#dc2626', margin: 0 }}>
                  Required document is missing.
                </h4>
                <p style={{ fontSize: '12.5px', color: '#991b1b', margin: '2px 0 0 0' }}>
                  Please upload the required document before the transport request can proceed.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => router.push('/customer/requests/tr-001')}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#ffffff',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--text-body)',
                }}
              >
                Back to Request
              </button>
              <button
                onClick={() => setIsUploadOpen(true)}
                style={{
                  padding: '8px 18px',
                  borderRadius: '8px',
                  backgroundColor: '#dc2626',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  border: 'none',
                }}
              >
                <Upload size={14} /> Upload Document
              </button>
            </div>
          </div>
        )}

        {/* Documents Table */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            border: '1px solid var(--border-card)',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-light)', backgroundColor: '#f8fafc' }}>
            <h4 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>
              Medical & Transport Documents
            </h4>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
                <th style={{ padding: '12px 20px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Document</th>
                <th style={{ padding: '12px 20px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Type</th>
                <th style={{ padding: '12px 20px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Uploaded Date</th>
                <th style={{ padding: '12px 20px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Expiry Date</th>
                <th style={{ padding: '12px 20px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Status</th>
                <th style={{ padding: '12px 20px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {horse.documents?.map((doc) => (
                <tr
                  key={doc.id}
                  style={{
                    borderBottom: '1px solid var(--border-light)',
                    backgroundColor: doc.status === 'Missing' ? '#fff5f5' : 'transparent',
                  }}
                >
                  <td style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <FileText size={18} color={doc.status === 'Missing' ? '#dc2626' : '#64748b'} />
                      <span style={{ fontWeight: 600, color: doc.status === 'Missing' ? '#dc2626' : 'var(--text-heading)' }}>
                        {doc.title}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: '16px 20px', color: 'var(--text-body)' }}>{doc.type}</td>
                  <td style={{ padding: '16px 20px', color: doc.uploadedDate ? 'var(--text-body)' : '#94a3b8' }}>
                    {doc.uploadedDate || '—'}
                  </td>
                  <td style={{ padding: '16px 20px', color: doc.expiryDate ? 'var(--text-body)' : '#94a3b8' }}>
                    {doc.expiryDate || '—'}
                  </td>
                  <td style={{ padding: '16px 20px' }}>
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 700,
                        backgroundColor:
                          doc.status === 'Approved'
                            ? '#dcfce7'
                            : doc.status === 'Under Review'
                            ? '#eff6ff'
                            : '#fee2e2',
                        color:
                          doc.status === 'Approved'
                            ? '#15803d'
                            : doc.status === 'Under Review'
                            ? '#1d4ed8'
                            : '#b91c1c',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      {doc.status === 'Approved' && <Check size={12} strokeWidth={3} />}
                      {doc.status === 'Under Review' && <Clock size={12} />}
                      {doc.status}
                    </span>
                  </td>
                  <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                    {doc.status === 'Missing' ? (
                      <button
                        onClick={() => setIsUploadOpen(true)}
                        style={{
                          color: '#dc2626',
                          fontWeight: 700,
                          fontSize: '13px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <Upload size={13} /> Upload
                      </button>
                    ) : (
                      <button
                        onClick={() => setPreviewDoc(doc)}
                        style={{
                          color: 'var(--primary)',
                          fontWeight: 600,
                          fontSize: '13px',
                        }}
                      >
                        View
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MEDICAL HISTORY TIMELINE */}
      <div
        id="medical-history-section"
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          border: '1px solid var(--border-card)',
          padding: '24px',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <h4 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-heading)', margin: '0 0 20px 0' }}>
          Medical History
        </h4>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', position: 'relative', paddingLeft: '24px' }}>
          {/* Vertical Track Line */}
          <div
            style={{
              position: 'absolute',
              top: '8px',
              bottom: '8px',
              left: '7px',
              width: '2px',
              backgroundColor: '#e2e8f0',
            }}
          />

          {horse.medicalHistory?.map((item, idx) => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
              <div
                style={{
                  position: 'absolute',
                  left: '-21px',
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  backgroundColor: idx === 0 ? '#16a34a' : '#94a3b8',
                  boxShadow: '0 0 0 3px #ffffff',
                }}
              />
              <div>
                <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>{item.date}</span>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-heading)', marginTop: '2px' }}>
                  {item.title}
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                  <UserCheck size={13} style={{ display: 'inline', marginRight: '4px' }} />
                  {item.examiner}
                </div>
              </div>

              <span
                style={{
                  padding: '3px 8px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 700,
                  backgroundColor: idx === 0 ? '#dcfce7' : '#f1f5f9',
                  color: idx === 0 ? '#15803d' : '#475569',
                }}
              >
                {item.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* DOCUMENT PREVIEW MODAL */}
      {previewDoc && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            padding: '16px',
          }}
          onClick={() => setPreviewDoc(null)}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '18px',
              maxWidth: '700px',
              width: '100%',
              overflow: 'hidden',
              boxShadow: 'var(--shadow-popup)',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: '90vh',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              style={{
                padding: '18px 24px',
                borderBottom: '1px solid var(--border-light)',
                backgroundColor: '#f8fafc',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-heading)', margin: 0 }}>
                  {previewDoc.title}
                </h3>
                <span style={{ fontSize: '12px', color: '#64748b' }}>Type: {previewDoc.type}</span>
              </div>
              <button
                onClick={() => setPreviewDoc(null)}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  backgroundColor: '#e2e8f0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Info Bar */}
            <div
              style={{
                padding: '12px 24px',
                borderBottom: '1px solid var(--border-light)',
                display: 'flex',
                gap: '24px',
                fontSize: '13px',
              }}
            >
              <div>
                <span style={{ color: '#94a3b8' }}>Uploaded: </span>
                <strong>{previewDoc.uploadedDate || '20 Sep 2026'}</strong>
              </div>
              <div>
                <span style={{ color: '#94a3b8' }}>Expiry: </span>
                <strong>{previewDoc.expiryDate || '20 Sep 2031'}</strong>
              </div>
              <div style={{ marginLeft: 'auto' }}>
                <span style={{ padding: '2px 8px', borderRadius: '4px', backgroundColor: '#dcfce7', color: '#15803d', fontSize: '11px', fontWeight: 700 }}>
                  Approved
                </span>
              </div>
            </div>

            {/* Large Preview Area */}
            <div
              style={{
                padding: '40px',
                backgroundColor: '#f1f5f9',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '360px',
              }}
            >
              <div
                style={{
                  width: '260px',
                  height: '320px',
                  backgroundColor: '#ffffff',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  boxShadow: 'var(--shadow-md)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '12px',
                  color: '#94a3b8',
                }}
              >
                <FileText size={48} color="#2563eb" />
                <span style={{ fontWeight: 600, color: 'var(--text-heading)' }}>PDF Document Preview</span>
                <span style={{ fontSize: '11px', color: '#64748b' }}>Official FEI Government Seal Verified</span>
              </div>
            </div>

            {/* Modal Actions */}
            <div
              style={{
                padding: '16px 24px',
                borderTop: '1px solid var(--border-light)',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '12px',
              }}
            >
              <button
                onClick={() => setPreviewDoc(null)}
                style={{
                  padding: '9px 18px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#ffffff',
                  fontSize: '13px',
                  fontWeight: 600,
                }}
              >
                Close
              </button>
              <button
                onClick={() => alert(`Downloading ${previewDoc.title}`)}
                style={{
                  padding: '9px 20px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--primary)',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  border: 'none',
                }}
              >
                <Download size={14} /> Download
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      <DocumentUploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onSuccess={handleUploadSuccess}
      />

      {/* Edit Horse Modal */}
      {isEditModalOpen && (
        <EditHorseModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          horse={horse}
          onHorseUpdated={(updated) => {
            setFeedbackSuccess(`Đã cập nhật thông tin con ngựa "${updated.name}" thành công!`);
            setTimeout(() => setFeedbackSuccess(null), 5000);
          }}
        />
      )}

      {/* Delete Horse Modal */}
      {isDeleteModalOpen && (
        <DeleteHorseModal
          isOpen={isDeleteModalOpen}
          onClose={() => setIsDeleteModalOpen(false)}
          horse={horse}
          onHorseDeleted={() => {
            router.push('/customer/horses');
          }}
        />
      )}
    </div>
  );
}
