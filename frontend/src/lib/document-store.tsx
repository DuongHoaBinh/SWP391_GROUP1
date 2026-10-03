'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

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
    reqCode: string;
    horseName: string;
    type: string;
    customerName?: string;
    fileUrl?: string;
  }) => SpecialistPendingDoc;
  sendReminder: (id: string) => void;
  resetToDefaults: () => void;
}

const INITIAL_PENDING_DOCS: SpecialistPendingDoc[] = [
  {
    id: 'DOC-2026-041',
    reqCode: 'TR-2026-001',
    horseName: 'Thunder',
    type: 'Vaccination Certificate',
    iconType: 'vaccination',
    date: 'Sep 24, 2026',
    status: 'PENDING',
    customerName: 'John Doe',
    submittedAt: '2026-09-24T10:00:00Z',
  },
  {
    id: 'DOC-2026-042',
    reqCode: 'TR-2026-002',
    horseName: 'Silver Star',
    type: 'Medical Certificate',
    iconType: 'medical',
    date: 'Sep 25, 2026',
    status: 'PENDING',
    customerName: 'Alex Morgan',
    submittedAt: '2026-09-25T14:30:00Z',
  },
  {
    id: 'DOC-2026-043',
    reqCode: 'TR-2026-003',
    horseName: 'Golden Mile',
    type: 'Export Quarantine Permit',
    iconType: 'quarantine',
    date: 'Sep 26, 2026',
    status: 'PENDING',
    customerName: 'Emily Chen',
    submittedAt: '2026-09-26T08:15:00Z',
  },
];

const INITIAL_DOSSIERS: SpecialistDossier[] = [
  {
    id: 'DOS-TR-001',
    reqCode: 'TR-2026-001',
    horse: 'Thunder',
    destination: 'SGN',
    status: 'In Progress',
    approvedDocs: 4,
    totalDocs: 6,
    docs: '4/6',
    lastUpdated: 'Sep 24, 2026',
  },
  {
    id: 'DOS-TR-002',
    reqCode: 'TR-2026-002',
    horse: 'Silver Star',
    destination: 'DXB',
    status: 'In Progress',
    approvedDocs: 3,
    totalDocs: 6,
    docs: '3/6',
    lastUpdated: 'Sep 25, 2026',
  },
  {
    id: 'DOS-TR-003',
    reqCode: 'TR-2026-003',
    horse: 'Golden Mile',
    destination: 'SIN',
    status: 'Complete',
    approvedDocs: 8,
    totalDocs: 8,
    docs: '8/8',
    lastUpdated: 'Sep 26, 2026',
  },
];

const INITIAL_MISSING_DOCS: SpecialistMissingDoc[] = [
  {
    id: 'MISS-1',
    reqCode: 'TR-2026-002',
    horseName: 'Royal Star',
    type: 'Quarantine Certificate',
    due: 'Sep 29, 2026',
    customer: 'Alex Morgan',
    status: 'MISSING',
    remindersSent: 1,
    lastReminderDate: 'Sep 25, 2026',
  },
  {
    id: 'MISS-2',
    reqCode: 'TR-2026-008',
    horseName: 'Midnight',
    type: 'Export Permit (UAE)',
    due: 'Oct 01, 2026',
    customer: 'Emily Chen',
    status: 'REJECTED',
    rejectionReason: 'Illegible official stamp and missing transit veterinary authorization.',
    remindersSent: 2,
    lastReminderDate: 'Sep 26, 2026',
  },
];

const STORAGE_KEYS = {
  PENDING: 'equitransit_spec_pending_docs_v1',
  DOSSIERS: 'equitransit_spec_dossiers_v1',
  MISSING: 'equitransit_spec_missing_docs_v1',
};

const DocumentStoreContext = createContext<DocumentStoreContextType | null>(null);

export const DocumentStoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [pendingDocs, setPendingDocs] = useState<SpecialistPendingDoc[]>(INITIAL_PENDING_DOCS);
  const [dossiers, setDossiers] = useState<SpecialistDossier[]>(INITIAL_DOSSIERS);
  const [missingDocs, setMissingDocs] = useState<SpecialistMissingDoc[]>(INITIAL_MISSING_DOCS);
  const [isLoaded, setIsLoaded] = useState(false);

  // Initialize from LocalStorage
  useEffect(() => {
    try {
      const savedPending = localStorage.getItem(STORAGE_KEYS.PENDING);
      const savedDossiers = localStorage.getItem(STORAGE_KEYS.DOSSIERS);
      const savedMissing = localStorage.getItem(STORAGE_KEYS.MISSING);

      if (savedPending) {
        setPendingDocs(JSON.parse(savedPending));
      }
      if (savedDossiers) {
        setDossiers(JSON.parse(savedDossiers));
      }
      if (savedMissing) {
        setMissingDocs(JSON.parse(savedMissing));
      }
    } catch (e) {
      console.error('Error loading documents from localStorage:', e);
    }
    setIsLoaded(true);
  }, []);

  // Save to LocalStorage on change
  const savePending = useCallback((docs: SpecialistPendingDoc[]) => {
    setPendingDocs(docs);
    try {
      localStorage.setItem(STORAGE_KEYS.PENDING, JSON.stringify(docs));
    } catch (e) {
      console.error('Error saving pending docs to localStorage:', e);
    }
  }, []);

  const saveDossiers = useCallback((items: SpecialistDossier[]) => {
    setDossiers(items);
    try {
      localStorage.setItem(STORAGE_KEYS.DOSSIERS, JSON.stringify(items));
    } catch (e) {
      console.error('Error saving dossiers to localStorage:', e);
    }
  }, []);

  const saveMissing = useCallback((items: SpecialistMissingDoc[]) => {
    setMissingDocs(items);
    try {
      localStorage.setItem(STORAGE_KEYS.MISSING, JSON.stringify(items));
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
                const remainingPending = Math.max(0, (req.pendingDocumentsCount || 1) - 1);
                const isCleared = remainingPending === 0 || (updatedDocuments && updatedDocuments.every((d: any) => d.status === 'Approved'));
                return {
                  ...req,
                  documents: updatedDocuments,
                  pendingDocumentsCount: remainingPending,
                  status: isCleared ? 'DOCUMENTS_VERIFIED' : req.status,
                  statusLabel: isCleared ? 'Documents Verified • Ready for Dispatch' : req.statusLabel,
                  activeStepIndex: isCleared ? Math.max(req.activeStepIndex || 2, 3) : req.activeStepIndex,
                  activities: [
                    {
                      id: `act-${Date.now()}`,
                      timestamp: 'Just now',
                      description: `${doc.type} approved by Transport Specialist (Valid until ${expiryDate || 'N/A'}).${isCleared ? ' All mandatory quarantine documents verified.' : ''}`,
                      actor: 'Specialist Sarah Jenkins',
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
                      actor: 'Specialist Sarah Jenkins',
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
        id: `DOC-2026-${Math.floor(100 + Math.random() * 900)}`,
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

  // Send Reminder to Customer
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

  // Reset to initial seeds
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

export const useDocumentStore = () => {
  const context = useContext(DocumentStoreContext);
  if (!context) {
    throw new Error('useDocumentStore must be used within a DocumentStoreProvider');
  }
  return context;
};
