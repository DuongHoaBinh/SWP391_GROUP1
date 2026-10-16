'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  DashboardMetrics,
  DocumentItem,
  Horse,
  NotificationItem,
  TransportRequest,
} from './types';
import {
  mockHorses as initialHorses,
  mockTransportRequests as initialRequests,
  mockNotifications as initialNotifications,
  mockDocuments as initialDocuments,
  mockMetrics as initialMetrics,
} from './mock-data';

import { apiClient } from './api-client';

import { getCurrentUser } from './auth';

export const getFullPhotoUrl = (url?: string | null): string | undefined => {
  if (!url) return undefined;
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:')) return url;
  const baseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');
  return `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
};

interface CustomerStoreContextType {
  requests: TransportRequest[];
  horses: Horse[];
  notifications: NotificationItem[];
  documents: DocumentItem[];
  metrics: DashboardMetrics;
  createRequest: (data: {
    title: string;
    transportType: 'International' | 'Domestic';
    origin: string;
    destination: string;
    departureDate: string;
    arrivalDate?: string;
    horseIds: string[];
    specialReqs?: string;
  }) => TransportRequest;
  uploadDocumentForRequest: (requestCode: string, docTitle: string) => void;
  uploadDocumentForHorse: (horseId: string, docTitle: string) => void;
  cancelRequest: (requestId: string) => void;
  markAllNotificationsRead: () => void;
  markNotificationRead: (id: string) => void;
  getHorseById: (id: string) => Horse | undefined;
  getRequestById: (id: string) => TransportRequest | undefined;
  addHorse: (horseData: Partial<Horse>) => Horse;
  updateHorse: (horseId: string, data: Partial<Horse>) => void;
  deleteHorse: (horseId: string) => void;
  refreshHorses: () => Promise<void>;
  uploadHorseAvatar: (horseId: string, file: File) => Promise<string>;
  uploadStandalonePhoto: (file: File) => Promise<string>;
}

const CustomerStoreContext = createContext<CustomerStoreContextType | null>(null);

const getStorageKey = (key: string) => {
  const user = getCurrentUser();
  const userId = user?.id || 'guest';
  return `equitransit_store_u${userId}_${key}`;
};

export const CustomerStoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [requests, setRequests] = useState<TransportRequest[]>(initialRequests);
  const [horses, setHorses] = useState<Horse[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>(initialNotifications);
  const [documents, setDocuments] = useState<DocumentItem[]>(initialDocuments);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage on client mount (user-scoped)
  useEffect(() => {
    try {
      const user = getCurrentUser();
      if (!user) {
        setIsLoaded(true);
        return;
      }
      const savedRequests = localStorage.getItem(getStorageKey('requests'));
      const savedHorses = localStorage.getItem(getStorageKey('horses'));
      const savedNotifs = localStorage.getItem(getStorageKey('notifs'));
      const savedDocs = localStorage.getItem(getStorageKey('docs'));

      if (savedRequests) setRequests(JSON.parse(savedRequests));
      if (savedHorses) setHorses(JSON.parse(savedHorses));
      if (savedNotifs) setNotifications(JSON.parse(savedNotifs));
      if (savedDocs) setDocuments(JSON.parse(savedDocs));
    } catch {
      // Ignore parse errors
    }
    setIsLoaded(true);
    refreshHorses();
  }, []);

  const refreshHorses = async () => {
    try {
      const data = await apiClient<any[]>('/horses');
      if (Array.isArray(data)) {
        const backendMapped: Horse[] = data
          .filter((item) => item.status !== 'retired' && item.status !== 'deleted')
          .map((item) => ({
          id: String(item.id || item.horse_id),
          backendId: item.id || item.horse_id,
          code: item.passportNo || `HR-${String(item.id || item.horse_id).padStart(5, '0')}`,
          name: item.name,
          breed: item.breed || 'Thoroughbred',
          age: Number(item.age) || 4,
          gender:
            item.gender === 'female'
              ? 'Mare'
              : item.gender === 'gelding'
              ? 'Gelding'
              : 'Stallion',
          dob: item.dateOfBirth
            ? new Date(item.dateOfBirth).toISOString().split('T')[0]
            : '2022-01-15',
          microchipNumber: item.microchipNo || '',
          passportNumber: item.passportNo || '',
          ownerName: 'You',
          photoUrl: getFullPhotoUrl(item.photoUrl),
          avatarUrl: getFullPhotoUrl(item.photoUrl),
          availabilityStatus:
            item.status === 'in_transit'
              ? 'In Transit'
              : item.status === 'delivered'
              ? 'Delivered'
              : item.status === 'active'
              ? 'Available'
              : 'Not Cleared',
          status: item.status || 'active',
          medicalStatus: item.medicalStatus || item.medical_status || 'Healthy',
          specialRequirements: item.specialRequirements || item.special_requirements || '',
          documentStatus: 'Valid',
          color: item.color || 'Bay',
          weight: item.weight || '480 kg',
          location: 'Stable',
          quantity: item.quantity !== undefined && item.quantity !== null ? Number(item.quantity) : 1,
          documents: [],
          medicalHistory: [],
        }));
        setHorses(backendMapped);
      }
    } catch {
      // Unauthenticated or network issue
    }
  };

  // Save to localStorage whenever state changes (user-scoped)
  useEffect(() => {
    if (!isLoaded) return;
    try {
      const user = getCurrentUser();
      if (!user) return;
      localStorage.setItem(getStorageKey('requests'), JSON.stringify(requests));
      localStorage.setItem(getStorageKey('horses'), JSON.stringify(horses));
      localStorage.setItem(getStorageKey('notifs'), JSON.stringify(notifications));
      localStorage.setItem(getStorageKey('docs'), JSON.stringify(documents));
    } catch {
      // Storage full or unavailable
    }
  }, [requests, horses, notifications, documents, isLoaded]);

  // Derived Metrics
  const activeRequests = requests.filter((r) => r.status !== 'COMPLETED' && r.status !== 'CANCELLED').length;
  const pendingApproval = requests.filter((r) => r.status === 'IN_REVIEW' || r.status === 'SUBMITTED').length;
  const inTransit = requests.filter((r) => r.status === 'IN_TRANSIT').length;
  const pendingDocuments = requests.reduce((acc, r) => acc + (r.pendingDocumentsCount || 0), 0);
  const completedTrips = requests.filter((r) => r.status === 'COMPLETED').length + 11; // base offset

  const metrics: DashboardMetrics = {
    activeRequests,
    pendingApproval,
    inTransit,
    pendingDocuments,
    completedTrips,
  };

  const getHorseById = (id: string) => {
    return horses.find(
      (h) =>
        h.id === id ||
        (h.backendId && String(h.backendId) === id) ||
        h.code?.toLowerCase() === id.toLowerCase() ||
        h.name.toLowerCase() === id.toLowerCase()
    );
  };

  const getRequestById = (id: string) => {
    return requests.find(
      (r) =>
        r.id === id ||
        r.requestCode.toLowerCase() === id.toLowerCase()
    );
  };

  const createRequest = ({
    title,
    transportType,
    origin,
    destination,
    departureDate,
    arrivalDate,
    horseIds,
    specialReqs,
  }: {
    title: string;
    transportType: 'International' | 'Domestic';
    origin: string;
    destination: string;
    departureDate: string;
    arrivalDate?: string;
    horseIds: string[];
    specialReqs?: string;
  }) => {
    const primaryHorse = horses.find((h) => h.id === horseIds[0]) || horses[0];
    const selectedHorseObjects = horses.filter((h) => horseIds.includes(h.id));

    const num = Math.floor(100 + Math.random() * 900);
    const requestCode = `TR-2026-${num}`;
    const id = `tr-${num}`;

    const newRequest: TransportRequest = {
      id,
      requestCode,
      title: title || `${origin} to ${destination} Transport`,
      transportationType: transportType,
      createdDate: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ', 10:00',
      horseId: primaryHorse.id,
      horse: primaryHorse,
      horses: selectedHorseObjects.map((h) => ({
        horse: h,
        medicalStatus: h.medicalStatus || 'Healthy',
        docsSummary: 'Pending Verification',
        isComplete: false,
      })),
      origin,
      originCode: origin.slice(0, 3).toUpperCase() + ', VN',
      transitPoint: 'BKK, TH',
      transitName: 'Border / Transit Checkpoint',
      destination,
      destinationCode: destination.slice(0, 3).toUpperCase() + ', SG',
      departureDate,
      estimatedArrivalDate: arrivalDate || departureDate,
      status: 'SUBMITTED',
      statusLabel: 'Pending Approval',
      activeStepIndex: 1,
      totalSteps: 7,
      pendingDocumentsCount: 2,
      notes: specialReqs || 'Standard climate controlled transport.',
      timeline: [
        { stage: 1, name: 'Request Created', status: 'completed' },
        { stage: 2, name: 'Docs Submitted', status: 'active' },
        { stage: 3, name: 'Document Review', status: 'pending' },
        { stage: 4, name: 'Request Approved', status: 'pending' },
        { stage: 5, name: 'Trip Planned', status: 'pending' },
        { stage: 6, name: 'In Transit', status: 'pending' },
        { stage: 7, name: 'Handover Completed', status: 'pending' },
      ],
      documents: [
        { id: `doc-${Date.now()}-1`, title: 'Horse Passport', status: 'Approved', uploadedDate: departureDate },
        { id: `doc-${Date.now()}-2`, title: 'Medical Certificate', status: 'Under Review' },
        { id: `doc-${Date.now()}-3`, title: 'Import / Export Permit', status: 'Missing', warning: 'Additional document required.' },
      ],
      activities: [
        {
          id: `act-${Date.now()}`,
          timestamp: 'Just now',
          description: `Transport request ${requestCode} created.`,
          actor: 'By Customer (John Doe)',
          type: 'customer',
        },
      ],
    };

    setRequests((prev) => [newRequest, ...prev]);

    // Add notification
    const newNotif: NotificationItem = {
      id: `notif-${Date.now()}`,
      type: 'SUCCESS',
      title: 'Request Created',
      message: `Your transport request ${requestCode} for ${selectedHorseObjects.map((h) => h.name).join(', ')} has been created.`,
      timeAgo: 'Just now',
      isRead: false,
      relatedRequestCode: requestCode,
    };
    setNotifications((prev) => [newNotif, ...prev]);

    return newRequest;
  };

  const uploadDocumentForRequest = (requestCode: string, docTitle: string) => {
    setRequests((prev) =>
      prev.map((r) => {
        if (r.requestCode === requestCode) {
          const updatedDocs = r.documents?.map((d) =>
            d.title.toLowerCase().includes(docTitle.toLowerCase()) || docTitle.toLowerCase().includes(d.title.toLowerCase())
              ? { ...d, status: 'Under Review' as const, warning: undefined, uploadedDate: 'Today' }
              : d
          );

          // Push into Specialist Review Queue via localStorage
          try {
            const currentPendingRaw = localStorage.getItem('equitransit_spec_pending_docs_v1');
            const currentPending = currentPendingRaw ? JSON.parse(currentPendingRaw) : [];
            const primaryHorseName = r.horse?.name || 'Horse';
            const newPendingDoc = {
              id: `DOC-2026-${Math.floor(100 + Math.random() * 900)}`,
              reqCode: requestCode,
              horseName: primaryHorseName,
              type: docTitle,
              iconType: docTitle.toLowerCase().includes('vaccin') ? 'vaccination' : docTitle.toLowerCase().includes('medic') ? 'medical' : 'other',
              date: new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
              status: 'PENDING',
              customerName: 'Customer',
              submittedAt: new Date().toISOString(),
            };
            localStorage.setItem('equitransit_spec_pending_docs_v1', JSON.stringify([newPendingDoc, ...currentPending]));
          } catch {
            // ignore
          }

          return {
            ...r,
            documents: updatedDocs,
            pendingDocumentsCount: (r.pendingDocumentsCount || 0),
            activities: [
              {
                id: `act-${Date.now()}`,
                timestamp: 'Just now',
                description: `${docTitle} uploaded. Awaiting Transport Specialist verification.`,
                actor: 'By Customer (John Doe)',
                type: 'customer',
              },
              ...(r.activities || []),
            ],
          };
        }
        return r;
      })
    );

    // Also update any matching horse documents
    setHorses((prev) =>
      prev.map((h) => ({
        ...h,
        documents: h.documents?.map((d) =>
          d.title.toLowerCase().includes(docTitle.toLowerCase()) || docTitle.toLowerCase().includes(d.title.toLowerCase())
            ? { ...d, status: 'Approved', uploadedDate: 'Today' }
            : d
        ),
      }))
    );

    // Mark missing notification as read
    setNotifications((prev) =>
      prev.map((n) =>
        n.relatedRequestCode === requestCode && n.type === 'CRITICAL'
          ? { ...n, isRead: true, actionText: undefined, message: `${docTitle} has been uploaded successfully.` }
          : n
      )
    );
  };

  const uploadDocumentForHorse = (horseId: string, docTitle: string) => {
    setHorses((prev) =>
      prev.map((h) => {
        if (h.id === horseId) {
          return {
            ...h,
            documents: h.documents?.map((d) =>
              d.title.toLowerCase().includes(docTitle.toLowerCase()) || docTitle.toLowerCase().includes(d.title.toLowerCase())
                ? { ...d, status: 'Approved', uploadedDate: 'Today' }
                : d
            ),
          };
        }
        return h;
      })
    );
  };

  const cancelRequest = (requestId: string) => {
    setRequests((prev) =>
      prev.map((r) =>
        r.id === requestId || r.requestCode === requestId
          ? {
              ...r,
              status: 'CANCELLED',
              statusLabel: 'Cancelled',
              activities: [
                {
                  id: `act-${Date.now()}`,
                  timestamp: 'Just now',
                  description: 'Request was cancelled by customer.',
                  actor: 'By Customer (John Doe)',
                  type: 'customer',
                },
                ...(r.activities || []),
              ],
            }
          : r
      )
    );
  };

  const markAllNotificationsRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    try {
      await apiClient('/notifications/read-all', { method: 'PATCH' });
    } catch {
      // ignore
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('notifications-updated'));
    }
  };

  const markNotificationRead = async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    try {
      await apiClient(`/notifications/${id}/read`, { method: 'PATCH' });
    } catch {
      // ignore
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('notifications-updated'));
    }
  };

  const addHorse = (horseData: Partial<Horse>): Horse => {
    const nextId = horseData.id ? String(horseData.id) : `hrs-${String(Date.now()).slice(-4)}`;
    const backendId = horseData.backendId || (Number(horseData.id) > 0 ? Number(horseData.id) : undefined);
    const nextCode = horseData.code || `HR-${String(backendId || Math.floor(100 + Math.random() * 900)).padStart(5, '0')}`;
    const newHorse: Horse = {
      id: nextId,
      backendId,
      code: nextCode,
      name: horseData.name || 'New Horse',
      breed: horseData.breed || 'Thoroughbred',
      age: horseData.age || 4,
      gender: horseData.gender || 'Stallion',
      dob: horseData.dob || '2022-01-15',
      location: horseData.location || 'Ho Chi Minh City, Vietnam',
      availabilityStatus: 'Available',
      medicalStatus: horseData.medicalStatus || 'Healthy',
      documentStatus: 'Valid',
      color: horseData.color || 'Bay',
      weight: horseData.weight || '480 kg',
      specialRequirements: horseData.specialRequirements || '',
      quantity: horseData.quantity !== undefined ? horseData.quantity : 1,
      microchipNumber: horseData.microchipNumber || `985141001248${Math.floor(100 + Math.random() * 900)}`,
      passportNumber: horseData.passportNumber || `FEI-VN-2026-${Math.floor(100 + Math.random() * 900)}`,
      ownerName: horseData.ownerName || 'Nguyễn Bình',
      photoUrl: horseData.photoUrl || horseData.avatarUrl,
      avatarUrl: horseData.avatarUrl || horseData.photoUrl,
    };

    setHorses((prev) => [newHorse, ...prev]);
    return newHorse;
  };

  const updateHorse = (horseId: string, updatedFields: Partial<Horse>) => {
    setHorses((prev) =>
      prev.map((h) => {
        if (h.id === horseId || (h.backendId && String(h.backendId) === horseId)) {
          return { ...h, ...updatedFields };
        }
        return h;
      })
    );
  };

  const deleteHorse = (horseId: string) => {
    setHorses((prev) =>
      prev.filter((h) => h.id !== horseId && (!h.backendId || String(h.backendId) !== horseId))
    );
  };

  const uploadHorseAvatar = async (horseId: string, file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);

    const horse = horses.find((h) => h.id === horseId || (h.backendId && String(h.backendId) === horseId));
    const targetId = horse?.backendId || (Number(horseId) > 0 ? Number(horseId) : horseId);

    const res = await apiClient<any>(`/horses/${targetId}/avatar`, {
      method: 'POST',
      body: formData,
    });

    const fullUrl = getFullPhotoUrl(res?.photoUrl) || '';
    if (fullUrl) {
      updateHorse(horseId, { photoUrl: fullUrl, avatarUrl: fullUrl });
    }

    await refreshHorses();
    return fullUrl;
  };

  const uploadStandalonePhoto = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await apiClient<{ url: string }>('/horses/upload-photo', {
      method: 'POST',
      body: formData,
    });
    return res.url;
  };

  return (
    <CustomerStoreContext.Provider
      value={{
        requests,
        horses,
        notifications,
        documents,
        metrics,
        createRequest,
        uploadDocumentForRequest,
        uploadDocumentForHorse,
        cancelRequest,
        markAllNotificationsRead,
        markNotificationRead,
        getHorseById,
        getRequestById,
        addHorse,
        updateHorse,
        deleteHorse,
        refreshHorses,
        uploadHorseAvatar,
        uploadStandalonePhoto,
      }}
    >
      {children}
    </CustomerStoreContext.Provider>
  );
};

export const useCustomerStore = () => {
  const context = useContext(CustomerStoreContext);
  if (!context) {
    throw new Error('useCustomerStore must be used within a CustomerStoreProvider');
  }
  return context;
};
