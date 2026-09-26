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
}

const CustomerStoreContext = createContext<CustomerStoreContextType | null>(null);

const STORAGE_KEY_PREFIX = 'equitransit_store_';

export const CustomerStoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [requests, setRequests] = useState<TransportRequest[]>(initialRequests);
  const [horses, setHorses] = useState<Horse[]>(initialHorses);
  const [notifications, setNotifications] = useState<NotificationItem[]>(initialNotifications);
  const [documents, setDocuments] = useState<DocumentItem[]>(initialDocuments);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage on client mount
  useEffect(() => {
    try {
      const savedRequests = localStorage.getItem(`${STORAGE_KEY_PREFIX}requests`);
      const savedHorses = localStorage.getItem(`${STORAGE_KEY_PREFIX}horses`);
      const savedNotifs = localStorage.getItem(`${STORAGE_KEY_PREFIX}notifs`);
      const savedDocs = localStorage.getItem(`${STORAGE_KEY_PREFIX}docs`);

      if (savedRequests) setRequests(JSON.parse(savedRequests));
      if (savedHorses) setHorses(JSON.parse(savedHorses));
      if (savedNotifs) setNotifications(JSON.parse(savedNotifs));
      if (savedDocs) setDocuments(JSON.parse(savedDocs));
    } catch {
      // Ignore parse errors, fallback to initial
    }
    setIsLoaded(true);
  }, []);

  // Save to localStorage whenever state changes
  useEffect(() => {
    if (!isLoaded) return;
    try {
      localStorage.setItem(`${STORAGE_KEY_PREFIX}requests`, JSON.stringify(requests));
      localStorage.setItem(`${STORAGE_KEY_PREFIX}horses`, JSON.stringify(horses));
      localStorage.setItem(`${STORAGE_KEY_PREFIX}notifs`, JSON.stringify(notifications));
      localStorage.setItem(`${STORAGE_KEY_PREFIX}docs`, JSON.stringify(documents));
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
              ? { ...d, status: 'Approved' as const, warning: undefined, uploadedDate: 'Today' }
              : d
          );
          const hasMissing = updatedDocs?.some((d) => d.status === 'Missing');
          return {
            ...r,
            documents: updatedDocs,
            pendingDocumentsCount: hasMissing ? 1 : 0,
            activities: [
              {
                id: `act-${Date.now()}`,
                timestamp: 'Just now',
                description: `${docTitle} uploaded and approved by specialist check.`,
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

  const markAllNotificationsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  const markNotificationRead = (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
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
