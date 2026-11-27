'use client';

import React, { createContext, useCallback, useContext, useState, useEffect } from 'react';
import {
  DashboardMetrics,
  DocumentItem,
  Horse,
  NotificationItem,
  TransportRequest,
} from './types';
import { apiClient, resolveAssetUrl } from './api-client';
import { getCurrentUser } from './auth';

export const getFullPhotoUrl = (url?: string | null): string | undefined => resolveAssetUrl(url);

const TERMINAL_ORDER_STATUSES = new Set([
  'completed',
  'cancelled',
  'cancelled_operational',
  'rejected',
  'refunded',
]);

function mapBackendOrderToStoreRequest(o: any): TransportRequest {
  const rawStatus = String(o.status || 'requested').toLowerCase();
  const statusUpper =
    rawStatus === 'completed'
      ? 'COMPLETED'
      : rawStatus === 'cancelled' || rawStatus === 'cancelled_operational' || rawStatus === 'rejected' || rawStatus === 'refunded'
        ? 'CANCELLED'
        : rawStatus === 'in_transit' || rawStatus === 'return_pending'
          ? 'IN_TRANSIT'
          : rawStatus === 'approved' || rawStatus === 'planning' || rawStatus === 'confirmed' || rawStatus === 'ready_to_depart'
            ? 'APPROVED'
            : rawStatus === 'paid_pending_review' || rawStatus === 'under_review'
              ? 'IN_REVIEW'
              : 'SUBMITTED';

  const firstHorse = Array.isArray(o.horses) && o.horses.length > 0 ? o.horses[0] : null;
  const fallbackHorse: Horse = {
    id: String(firstHorse?.horseId || firstHorse?.id || '0'),
    code: firstHorse?.passportNo || `HR-${String(firstHorse?.horseId || 0).padStart(5, '0')}`,
    name: firstHorse?.name || 'Horse',
    breed: firstHorse?.breed || 'Thoroughbred',
    age: Number(firstHorse?.age) || 0,
    microchipNumber: firstHorse?.microchipNo || '',
    passportNumber: firstHorse?.passportNo || '',
    availabilityStatus: 'Available',
    documentStatus: 'Valid',
    ownerName: o.customerName || o.contactName || '',
  };

  return {
    id: String(o.id),
    requestCode: o.requestCode || `REQ-${String(o.id).padStart(3, '0')}`,
    title: `${o.originLocation || ''} → ${o.destinationLocation || ''}`,
    transportationType: o.transportationType || o.transportMode || 'Domestic',
    createdDate: o.createdAt || new Date().toISOString(),
    horseId: fallbackHorse.id,
    horse: fallbackHorse,
    horses: (o.horses || []).map((h: any) => ({
      horseId: String(h.horseId || h.id),
      horse: {
        ...fallbackHorse,
        id: String(h.horseId || h.id),
        name: h.name || 'Horse',
        breed: h.breed || 'Thoroughbred',
      },
      medicalStatus: h.medicalStatus || '',
      docsSummary: '',
      isComplete: true,
    })),
    origin: o.originLocation || '',
    originCode: (o.originLocation || '').slice(0, 3).toUpperCase(),
    destination: o.destinationLocation || '',
    destinationCode: (o.destinationLocation || '').slice(0, 3).toUpperCase(),
    departureDate: o.departureDate || o.requestedDate || '',
    estimatedArrivalDate: o.expectedArrivalDate || '',
    status: statusUpper as any,
    statusLabel: rawStatus,
    activeStepIndex: 1,
    totalSteps: 7,
    pendingDocumentsCount: 0,
    notes: o.specialRequirements || '',
    timeline: [],
    documents: [],
    activities: [],
  };
}

interface CustomerStoreContextType {
  requests: TransportRequest[];
  rawOrders: any[];
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
  refreshRequests: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
  uploadHorseAvatar: (horseId: string, file: File) => Promise<string>;
  uploadStandalonePhoto: (file: File) => Promise<string>;
}

const CustomerStoreContext = createContext<CustomerStoreContextType | null>(null);

export const CustomerStoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [requests, setRequests] = useState<TransportRequest[]>([]);
  const [rawOrders, setRawOrders] = useState<any[]>([]);
  const [horses, setHorses] = useState<Horse[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [documents] = useState<DocumentItem[]>([]);

  const refreshHorses = useCallback(async () => {
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
            gender: item.gender || undefined,
            age: item.age != null && Number(item.age) > 0 ? Number(item.age) : 0,
            requiresPrivateStall: Boolean(item.requiresPrivateStall),
            temperament: item.temperament || 'normal',
            microchipNumber: item.microchipNo || '',
            passportNumber: item.passportNo || '',
            ownerName: getCurrentUser()?.name || '',
            photoUrl: getFullPhotoUrl(item.photoUrl),
            avatarUrl: getFullPhotoUrl(item.photoUrl),
            availabilityStatus:
              item.status === 'in_transit'
                ? 'In Transit'
                : item.status === 'active'
                  ? 'Available'
                  : 'Not Cleared',
            status: item.status || 'active',
            medicalStatus: item.medicalStatus || item.medical_status || '',
            specialRequirements: item.specialRequirements || item.special_requirements || '',
            documentStatus: 'Valid',
            color: item.color || '',
            weight: item.weight || '',
            location: item.location || '',
            quantity: item.quantity !== undefined && item.quantity !== null ? Number(item.quantity) : 1,
            documents: [],
            medicalHistory: [],
          }));
        setHorses(backendMapped);
      }
    } catch {
      // Unauthenticated or network issue
    }
  }, []);

  const refreshRequests = useCallback(async () => {
    try {
      const data = await apiClient<any[]>('/orders/my-orders');
      if (Array.isArray(data)) {
        setRawOrders(data);
        setRequests(data.map(mapBackendOrderToStoreRequest));
      }
    } catch {
      // Ignore network/auth error
    }
  }, []);

  const refreshNotifications = useCallback(async () => {
    try {
      const data = await apiClient<
        Array<{
          id: string | number;
          notifType?: string;
          title: string;
          message: string;
          createdAt?: string;
          isRead?: boolean;
          shipmentId?: number | string;
        }>
      >('/notifications');
      if (Array.isArray(data)) {
        setNotifications(
          data.map((item) => ({
            id: String(item.id),
            type:
              item.notifType === 'health_alert' || item.notifType === 'incident'
                ? 'CRITICAL'
                : 'INFO',
            title: item.title,
            message: item.message,
            timeAgo: item.createdAt || '',
            isRead: Boolean(item.isRead),
            relatedRequestCode: item.shipmentId ? `REQ-${String(item.shipmentId).padStart(3, '0')}` : undefined,
            actionUrl: item.shipmentId ? `/customer/requests/${item.shipmentId}` : undefined,
          })),
        );
      }
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    const user = getCurrentUser();
    if (!user?.id) return;
    void Promise.allSettled([refreshHorses(), refreshRequests(), refreshNotifications()]);

    const handleNotifUpdate = () => {
      void refreshNotifications();
    };
    const handleOrdersUpdate = () => {
      void refreshRequests();
      void refreshHorses();
    };
    window.addEventListener('notifications-updated', handleNotifUpdate);
    window.addEventListener('customer-orders-updated', handleOrdersUpdate);
    return () => {
      window.removeEventListener('notifications-updated', handleNotifUpdate);
      window.removeEventListener('customer-orders-updated', handleOrdersUpdate);
    };
  }, [refreshHorses, refreshRequests, refreshNotifications]);

  // Derived Metrics from real API orders
  const activeRequests = rawOrders.filter(
    (o) => !TERMINAL_ORDER_STATUSES.has(String(o.status || '').toLowerCase()),
  ).length;
  const pendingApproval = rawOrders.filter((o) =>
    ['requested', 'awaiting_payment', 'paid_pending_review', 'under_review', 'change_requested'].includes(
      String(o.status || '').toLowerCase(),
    ),
  ).length;
  const inTransit = rawOrders.filter((o) =>
    ['in_transit', 'return_pending'].includes(String(o.status || '').toLowerCase()),
  ).length;
  const pendingDocuments = rawOrders.filter((o) =>
    ['approved', 'planning', 'confirmed'].includes(String(o.status || '').toLowerCase()),
  ).length;
  const completedTrips = rawOrders.filter(
    (o) => String(o.status || '').toLowerCase() === 'completed',
  ).length;

  const metrics: DashboardMetrics = {
    activeRequests,
    pendingApproval,
    inTransit,
    pendingDocuments,
    completedTrips,
  };

  const getHorseById = (id: string) =>
    horses.find(
      (h) =>
        h.id === id ||
        (h.backendId && String(h.backendId) === id) ||
        h.code?.toLowerCase() === id.toLowerCase() ||
        h.name.toLowerCase() === id.toLowerCase(),
    );

  const getRequestById = (id: string) =>
    requests.find(
      (r) => r.id === id || r.requestCode.toLowerCase() === id.toLowerCase(),
    );

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
    const num = Math.floor(100 + Math.random() * 900);
    const requestCode = `REQ-${num}`;
    const newRequest: TransportRequest = {
      id: String(num),
      requestCode,
      title: title || `${origin} → ${destination}`,
      transportationType: transportType,
      createdDate: new Date().toISOString(),
      horseId: primaryHorse?.id || '0',
      horse: primaryHorse,
      horses: [],
      origin,
      originCode: origin.slice(0, 3).toUpperCase(),
      destination,
      destinationCode: destination.slice(0, 3).toUpperCase(),
      departureDate,
      estimatedArrivalDate: arrivalDate || departureDate,
      status: 'SUBMITTED',
      statusLabel: 'awaiting_payment',
      activeStepIndex: 1,
      totalSteps: 7,
      pendingDocumentsCount: 0,
      notes: specialReqs || '',
      timeline: [],
      documents: [],
      activities: [],
    };
    void refreshRequests();
    return newRequest;
  };

  const uploadDocumentForRequest = () => {
    void refreshRequests();
  };

  const uploadDocumentForHorse = () => {
    void refreshHorses();
  };

  const cancelRequest = async (requestId: string) => {
    const target = requests.find((r) => r.id === requestId || r.requestCode === requestId);
    const horseIds = target?.horses?.map((h) => String(h.horse?.id || h.horseId || '')).filter(Boolean) || [];

    setRequests((prev) =>
      prev.map((r) =>
        r.id === requestId || r.requestCode === requestId
          ? { ...r, status: 'CANCELLED', statusLabel: 'cancelled' }
          : r,
      ),
    );

    if (horseIds.length > 0) {
      setHorses((prev) =>
        prev.map((h) =>
          horseIds.includes(String(h.id))
            ? { ...h, status: 'active', availabilityStatus: 'Available' }
            : h,
        ),
      );
    }

    await Promise.allSettled([refreshRequests(), refreshHorses()]);
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
      gender: horseData.gender || undefined,
      age: horseData.age || 0,
      requiresPrivateStall: Boolean(horseData.requiresPrivateStall),
      temperament: horseData.temperament || 'normal',
      location: horseData.location || '',
      availabilityStatus: 'Available',
      medicalStatus: horseData.medicalStatus || undefined,
      documentStatus: 'Valid',
      color: horseData.color || '',
      weight: horseData.weight || '',
      specialRequirements: horseData.specialRequirements || '',
      quantity: horseData.quantity !== undefined ? horseData.quantity : 1,
      microchipNumber: horseData.microchipNumber || '',
      passportNumber: horseData.passportNumber || '',
      ownerName: horseData.ownerName || getCurrentUser()?.name || '',
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
      }),
    );
  };

  const deleteHorse = (horseId: string) => {
    setHorses((prev) =>
      prev.filter((h) => h.id !== horseId && (!h.backendId || String(h.backendId) !== horseId)),
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
        rawOrders,
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
        refreshRequests,
        refreshNotifications,
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
