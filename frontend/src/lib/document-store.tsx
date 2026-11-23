'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { documentsApi } from '@/features/documents/api/documents.api';
import { getAuthToken, getCurrentUser } from '@/lib/auth';

export type DocIconType = 'vaccination' | 'medical' | 'quarantine' | 'permit' | 'passport' | 'other';

export interface SpecialistPendingDoc {
  id: string;
  reqCode: string;
  horseName: string;
  type: string;
  iconType: DocIconType;
  date: string;
  status: 'PENDING' | 'UNDER_REVIEW';
  customerName: string;
  fileUrl?: string;
  submittedAt?: string;
}

export interface SpecialistDossier {
  id: string;
  reqCode: string;
  horse: string;
  destination: string;
  status: 'In Progress' | 'Complete';
  approvedDocs: number;
  totalDocs: number;
  docs: string; // e.g. "4/6"
  lastUpdated?: string;
}

export interface SpecialistMissingDoc {
  id: string;
  reqCode: string;
  horseName: string;
  type: string;
  due: string;
  customer: string;
  status: 'MISSING' | 'REJECTED';
  rejectionReason?: string;
  remindersSent?: number;
  lastReminderDate?: string;
}

interface DocumentStoreContextType {
  pendingDocs: SpecialistPendingDoc[];
  dossiers: SpecialistDossier[];
  missingDocs: SpecialistMissingDoc[];
  isLoaded: boolean;
  reviewDocument: (
    docId: string,
    status: 'APPROVED' | 'REJECTED',
    expiryDate?: string,
    rejectionReason?: string
  ) => void;
  createDossier: (data: {
    reqCode: string;
    horse: string;
    destination: string;
    totalDocs?: number;
  }) => SpecialistDossier;
  submitDocumentForReview: (data: {
    id?: string;
    reqCode: string;
    horseName: string;
    type: string;
    customerName?: string;
    fileUrl?: string;
  }) => SpecialistPendingDoc;
  sendReminder: (id: string) => void;
  resetToDefaults: () => void;
}

const INITIAL_PENDING_DOCS: SpecialistPendingDoc[] = [];

const INITIAL_DOSSIERS: SpecialistDossier[] = [];

const INITIAL_MISSING_DOCS: SpecialistMissingDoc[] = [];

const getDocStorageKeys = () => {
  const userId = getCurrentUser()?.id || 'anon';
  return {
    PENDING: `equitransit_spec_u${userId}_pending_docs_v1`,
    DOSSIERS: `equitransit_spec_u${userId}_dossiers_v1`,
    MISSING: `equitransit_spec_u${userId}_missing_docs_v1`,
  };
};

const DocumentStoreContext = createContext<DocumentStoreContextType | null>(null);

export const DocumentStoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [pendingDocs, setPendingDocs] = useState<SpecialistPendingDoc[]>(INITIAL_PENDING_DOCS);
  const [dossiers, setDossiers] = useState<SpecialistDossier[]>(INITIAL_DOSSIERS);
  const [missingDocs, setMissingDocs] = useState<SpecialistMissingDoc[]>(INITIAL_MISSING_DOCS);
  const [isLoaded, setIsLoaded] = useState(false);

  // Initialize from user-scoped LocalStorage & Backend (only for authenticated specialist/admin)
  useEffect(() => {
    const keys = getDocStorageKeys();
    const token = getAuthToken();
    const user = getCurrentUser();
    const role = String(user?.role || '').toUpperCase();

    if (token) {
      try {
        const savedPending = localStorage.getItem(keys.PENDING);
        const savedDossiers = localStorage.getItem(keys.DOSSIERS);
        const savedMissing = localStorage.getItem(keys.MISSING);

        if (savedPending) {
          setPendingDocs(JSON.parse(savedPending));
        }
        if (savedDossiers) {
          setDossiers(JSON.parse(savedDossiers));
        }
        if (savedMissing) {
          const parsed = JSON.parse(savedMissing);
          setMissingDocs(Array.isArray(parsed) ? parsed : []);
        }
      } catch (e) {
        console.error('Error loading documents from localStorage:', e);
      }
    }
    setIsLoaded(true);

    if (!token || (role !== 'LOGISTICS_MANAGER' && role !== 'ADMIN')) {
      return;
    }

    // Fetch real pending documents from backend API
    const syncFromApi = async () => {
      try {
        const apiDocs = await documentsApi.getDocuments({ status: 'submitted' });
        if (Array.isArray(apiDocs)) {
          const mapped: SpecialistPendingDoc[] = apiDocs.map((d) => {
            const typeLower = (d.regulationDocType || d.docType).toLowerCase();
            let iconType: DocIconType = 'other';
            if (typeLower.includes('vaccin')) iconType = 'vaccination';
            else if (typeLower.includes('medic') || typeLower.includes('health')) iconType = 'medical';
            else if (typeLower.includes('quarant')) iconType = 'quarantine';
            else if (typeLower.includes('permit')) iconType = 'permit';
            else if (typeLower.includes('passport')) iconType = 'passport';

            return {
              id: `DOC-${d.id}`,
              reqCode: d.requestCode || `TR-HORSE-${d.horseId}`,
              horseName: d.horseName || `Horse #${d.horseId}`,
              type: d.regulationDocType || d.docType,
              iconType,
              date: d.createdAt ? new Date(d.createdAt).toLocaleDateString() : 'Just now',
              status: 'PENDING',
              customerName: d.uploaderName || d.uploaderEmail || 'Customer',
              fileUrl: d.fileUrl,
              submittedAt: d.createdAt,
            };
          });

          setPendingDocs(mapped);
          try {
            localStorage.setItem(keys.PENDING, JSON.stringify(mapped));
          } catch {}
        }
      } catch {
        // Backend offline or unprivileged role
      }
    };
    syncFromApi();
  }, []);

  // Save to LocalStorage on change
  const savePending = useCallback((docs: SpecialistPendingDoc[]) => {
    setPendingDocs(docs);
    try {
      localStorage.setItem(getDocStorageKeys().PENDING, JSON.stringify(docs));
    } catch (e) {
      console.error('Error saving pending docs to localStorage:', e);
    }
  }, []);

  const saveDossiers = useCallback((items: SpecialistDossier[]) => {
    setDossiers(items);
    try {
      localStorage.setItem(getDocStorageKeys().DOSSIERS, JSON.stringify(items));
    } catch (e) {
      console.error('Error saving dossiers to localStorage:', e);
    }
  }, []);

  const saveMissing = useCallback((items: SpecialistMissingDoc[]) => {
    setMissingDocs(items);
    try {
      localStorage.setItem(getDocStorageKeys().MISSING, JSON.stringify(items));
    } catch (e) {
      console.error('Error saving missing docs to localStorage:', e);
    }
  }, []);

  // Review Document Action: Core of Flow 2
  const reviewDocument = useCallback(
    (
      docId: string,
      status: 'APPROVED' | 'REJECTED',
      expiryDate?: string,
      rejectionReason?: string
    ) => {
      const doc = pendingDocs.find((d) => d.id === docId);
      if (!doc) return;

      // 1. Remove from pending queue
      const updatedPending = pendingDocs.filter((d) => d.id !== docId);
      savePending(updatedPending);

      // 2. Handle APPROVED vs REJECTED
      if (status === 'APPROVED') {
        // Update matching Dossier: increment approvedDocs, check if complete
        const updatedDossiers = dossiers.map((dos) => {
          const isMatch =
            dos.reqCode.toLowerCase() === doc.reqCode.toLowerCase() ||
            dos.horse.toLowerCase() === doc.horseName.toLowerCase();

          if (isMatch) {
            const nextApproved = Math.min(dos.totalDocs, dos.approvedDocs + 1);
            const isComplete = nextApproved >= dos.totalDocs;
            return {
              ...dos,
              approvedDocs: nextApproved,
              status: isComplete ? ('Complete' as const) : ('In Progress' as const),
              docs: `${nextApproved}/${dos.totalDocs}`,
              lastUpdated: new Date().toLocaleDateString('en-US', {
                month: 'short',
                day: '2-digit',
                year: 'numeric',
              }),
            };
          }
          return dos;
        });
        saveDossiers(updatedDossiers);

        // Remove from missing if previously there
        const updatedMissing = missingDocs.filter(
          (m) =>
            !(
              m.reqCode.toLowerCase() === doc.reqCode.toLowerCase() &&
              m.type.toLowerCase().includes(doc.type.toLowerCase())
            )
        );
        saveMissing(updatedMissing);

        // Update customer store in localStorage if present
        try {
          const customerRequestsRaw = localStorage.getItem('equitransit_store_requests');
          if (customerRequestsRaw) {
            const requests = JSON.parse(customerRequestsRaw);
            const updatedRequests = requests.map((req: any) => {
              if (req.requestCode === doc.reqCode) {
                const updatedDocuments = req.documents?.map((d: any) => {
                  if (
                    d.title.toLowerCase().includes(doc.type.toLowerCase()) ||
                    doc.type.toLowerCase().includes(d.title.toLowerCase())
                  ) {
                    return {
                      ...d,
                      status: 'Approved',
                      expiryDate: expiryDate || '2027-01-01',
                      warning: undefined,
                    };
                  }
                  return d;
                });
                return {
                  ...req,
                  documents: updatedDocuments,
                  pendingDocumentsCount: Math.max(0, (req.pendingDocumentsCount || 1) - 1),
                  activities: [
                    {
                      id: `act-${Date.now()}`,
                      timestamp: 'Just now',
                      description: `${doc.type} approved by Transport Specialist (Valid until ${expiryDate || 'N/A'}).`,
                      actor: getCurrentUser()?.fullName || getCurrentUser()?.name || 'Transport Specialist',
                      type: 'system',
                    },
                    ...(req.activities || []),
                  ],
                };
              }
              return req;
            });
            localStorage.setItem('equitransit_store_requests', JSON.stringify(updatedRequests));
          }
        } catch {
          // ignore
        }
      } else {
        // REJECTED: Add to missing queue with reason and 3-day due date
        const newMissingItem: SpecialistMissingDoc = {
          id: `MISS-${Date.now().toString().slice(-4)}`,
          reqCode: doc.reqCode,
          horseName: doc.horseName,
          type: doc.type,
          due: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', {
            month: 'short',
            day: '2-digit',
            year: 'numeric',
          }),
          customer: doc.customerName || 'Customer',
          status: 'REJECTED',
          rejectionReason: rejectionReason || 'Document did not meet regulatory requirements.',
          remindersSent: 0,
        };

        const updatedMissing = [newMissingItem, ...missingDocs.filter((m) => m.id !== doc.id)];
        saveMissing(updatedMissing);

        // Update customer store in localStorage if present
        try {
          const customerRequestsRaw = localStorage.getItem('equitransit_store_requests');
          if (customerRequestsRaw) {
            const requests = JSON.parse(customerRequestsRaw);
            const updatedRequests = requests.map((req: any) => {
              if (req.requestCode === doc.reqCode) {
                const updatedDocuments = req.documents?.map((d: any) => {
                  if (
                    d.title.toLowerCase().includes(doc.type.toLowerCase()) ||
                    doc.type.toLowerCase().includes(d.title.toLowerCase())
                  ) {
                    return {
                      ...d,
                      status: 'Rejected',
                      warning: rejectionReason || 'Rejection reason not specified',
                    };
                  }
                  return d;
                });
                return {
                  ...req,
                  documents: updatedDocuments,
                  pendingDocumentsCount: (req.pendingDocumentsCount || 0) + 1,
                  activities: [
                    {
                      id: `act-${Date.now()}`,
                      timestamp: 'Just now',
                      description: `${doc.type} rejected: ${rejectionReason}. Action required by customer.`,
                      actor: getCurrentUser()?.fullName || getCurrentUser()?.name || 'Transport Specialist',
                      type: 'system',
                    },
                    ...(req.activities || []),
                  ],
                };
              }
              return req;
            });
            localStorage.setItem('equitransit_store_requests', JSON.stringify(updatedRequests));
          }
        } catch {
          // ignore
        }
      }
    },
    [pendingDocs, dossiers, missingDocs, savePending, saveDossiers, saveMissing]
  );

  // Create New Dossier
  const createDossier = useCallback(
    (data: { reqCode: string; horse: string; destination: string; totalDocs?: number }) => {
      const total = data.totalDocs || 6;
      const newDossier: SpecialistDossier = {
        id: `DOS-${data.reqCode}`,
        reqCode: data.reqCode,
        horse: data.horse,
        destination: data.destination,
        status: 'In Progress',
        approvedDocs: 0,
        totalDocs: total,
        docs: `0/${total}`,
        lastUpdated: new Date().toLocaleDateString('en-US', {
          month: 'short',
          day: '2-digit',
          year: 'numeric',
        }),
      };
      saveDossiers([newDossier, ...dossiers]);
      return newDossier;
    },
    [dossiers, saveDossiers]
  );

  // Submit document (Customer upload or manual addition)
  const submitDocumentForReview = useCallback(
    (data: {
      id?: string;
      reqCode: string;
      horseName: string;
      type: string;
      customerName?: string;
      fileUrl?: string;
    }) => {
      const typeLower = data.type.toLowerCase();
      let iconType: DocIconType = 'other';
      if (typeLower.includes('vaccin')) iconType = 'vaccination';
      else if (typeLower.includes('medic') || typeLower.includes('health')) iconType = 'medical';
      else if (typeLower.includes('quarant')) iconType = 'quarantine';
      else if (typeLower.includes('permit')) iconType = 'permit';
      else if (typeLower.includes('passport')) iconType = 'passport';

      const newDoc: SpecialistPendingDoc = {
        id: data.id || `DOC-2026-${Math.floor(100 + Math.random() * 900)}`,
        reqCode: data.reqCode,
        horseName: data.horseName,
        type: data.type,
        iconType,
        date: new Date().toLocaleDateString('en-US', {
          month: 'short',
          day: '2-digit',
          year: 'numeric',
        }),
        status: 'PENDING',
        customerName: data.customerName || 'Customer',
        fileUrl: data.fileUrl,
        submittedAt: new Date().toISOString(),
      };

      savePending([newDoc, ...pendingDocs]);

      // Remove from missing docs if it was previously listed
      const updatedMissing = missingDocs.filter(
        (m) =>
          !(
            m.reqCode.toLowerCase() === data.reqCode.toLowerCase() &&
            m.type.toLowerCase().includes(data.type.toLowerCase())
          )
      );
      if (updatedMissing.length !== missingDocs.length) {
        saveMissing(updatedMissing);
      }

      return newDoc;
    },
    [pendingDocs, missingDocs, savePending, saveMissing]
  );

  // Update local reminder metadata only (API notification is dispatched explicitly by caller with verified numeric orderId)
  const sendReminder = useCallback(
    (id: string) => {
      const updated = missingDocs.map((m) => {
        if (m.id === id) {
          return {
            ...m,
            remindersSent: (m.remindersSent || 0) + 1,
            lastReminderDate: new Date().toLocaleDateString('en-US', {
              month: 'short',
              day: '2-digit',
              year: 'numeric',
            }),
          };
        }
        return m;
      });
      saveMissing(updated);
    },
    [missingDocs, saveMissing]
  );

  // Reset to initial empty state
  const resetToDefaults = useCallback(() => {
    savePending(INITIAL_PENDING_DOCS);
    saveDossiers(INITIAL_DOSSIERS);
    saveMissing(INITIAL_MISSING_DOCS);
  }, [savePending, saveDossiers, saveMissing]);

  return (
    <DocumentStoreContext.Provider
      value={{
        pendingDocs,
        dossiers,
        missingDocs,
        isLoaded,
        reviewDocument,
        createDossier,
        submitDocumentForReview,
        sendReminder,
        resetToDefaults,
      }}
    >
      {children}
    </DocumentStoreContext.Provider>
  );
};

export const useOptionalDocumentStore = () => {
  return useContext(DocumentStoreContext);
};

export const useDocumentStore = () => {
  const context = useContext(DocumentStoreContext);
  if (!context) {
    throw new Error('useDocumentStore must be used within a DocumentStoreProvider');
  }
  return context;
};
