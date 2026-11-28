// Step 8: Giấy tờ theo quốc gia, dùng lại giấy còn hạn, Manager duyệt 4 tiêu chí, job quét hết hạn
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnprocessableEntityException,
} = require('@nestjs/common');
const { UserRole } = require('../dist/modules/auth/auth.types');
const {
  evaluateRequirement,
  earliestFeasibleDeparture,
  formatDateIct,
} = require('../dist/modules/documents/requirement-policy');
const { DocumentsService } = require('../dist/modules/documents/documents.service');
const { DocumentExpiryMonitorService } = require('../dist/modules/documents/document-expiry-monitor.service');
const { ComplianceController } = require('../dist/modules/documents/compliance.controller');

const CUSTOMER_ALICE = { id: '10', email: 'alice@test.local', role: UserRole.CUSTOMER };
const CUSTOMER_BOB = { id: '20', email: 'bob@test.local', role: UserRole.CUSTOMER };
const MANAGER = { id: '1', email: 'manager@test.local', role: UserRole.LOGISTICS_MANAGER };

function makeMockDocumentsStore(initialData = {}) {
  const docs = new Map(initialData.docs || []);
  const reviewLogs = [...(initialData.reviewLogs || [])];
  const notices = new Set(initialData.notices || []);
  const orders = new Map(initialData.orders || []);
  const horses = new Map(initialData.horses || [
    [101, { id: 101, ownerId: 10, name: 'Storm', microchipNo: 'CHIP-101', passportNo: 'PASS-101' }],
    [102, { id: 102, ownerId: 20, name: 'Blaze', microchipNo: 'CHIP-102', passportNo: 'PASS-102' }],
  ]);
  const regulations = initialData.regulations || [
    {
      id: 1,
      country: 'Australia',
      transportMode: 'air',
      docTier: 'A',
      leadTimeDays: 14,
      maxIssueAgeDays: 10,
      minValidityBufferHours: 48,
      documentType: 'health_certificate',
      documentTypeCode: 'health_certificate',
      isMandatory: true,
      isActive: true,
    },
    {
      id: 2,
      country: 'Singapore',
      transportMode: 'air',
      docTier: 'A',
      leadTimeDays: 7,
      maxIssueAgeDays: 10,
      minValidityBufferHours: 48,
      documentType: 'health_certificate',
      documentTypeCode: 'health_certificate',
      isMandatory: true,
      isActive: true,
    },
    {
      id: 3,
      country: 'Singapore',
      transportMode: 'both',
      docTier: 'A',
      leadTimeDays: 7,
      documentType: 'horse_passport',
      documentTypeCode: 'horse_passport',
      isMandatory: true,
      isActive: true,
    },
  ];

  return {
    docs,
    reviewLogs,
    notices,
    orders,
    horses,
    regulations,

    isHorseOwnedByUser: async (horseId, userId) => horses.get(horseId)?.ownerId === userId,
    findHorseOwnerId: async (horseId) => horses.get(horseId)?.ownerId,
    findHorseById: async (horseId) => horses.get(horseId),
    findDocumentsByHorseId: async (horseId) =>
      [...docs.values()].filter((d) => d.horseId === horseId && !d.isArchived),
    findApprovedDocuments: async (filter) =>
      [...docs.values()].filter((d) => {
        if (d.isArchived) return false;
        if (filter?.horseId && d.horseId !== filter.horseId) return false;
        const requiredStatus = filter?.status || 'approved';
        if (d.status !== requiredStatus) return false;
        return true;
      }),
    findDocumentById: async (id) => docs.get(id),
    findActiveRegulations: async () => regulations,
    findRegulations: async () => regulations,
    findDocumentTypes: async () => [],
    hasRequirementsSent: async () => false,
    findOrderDetails: async (orderId) => orders.get(orderId),
    findOrderById: async (orderId) => orders.get(orderId),
    findHorsesInOrder: async (orderId) => [{ id: 101, horse_id: 101, horseId: 101, name: 'Storm', microchipNo: 'CHIP-101', passportNo: 'PASS-101' }],
    findActiveShipmentIdsByHorseId: async () => [],
    updateDocumentReview: async (id, status, notes, expiryDate, docNumber, reviewedBy) => {
      const doc = docs.get(id);
      if (doc) {
        doc.status = status;
        if (notes !== undefined) doc.reviewerNotes = notes;
        if (expiryDate !== undefined) doc.expiryDate = expiryDate;
        if (docNumber !== undefined) doc.docNumber = docNumber;
        doc.reviewedBy = reviewedBy;
        doc.reviewedAt = new Date();
      }
    },
    createReviewLog: async (log) => {
      const entry = { reviewId: reviewLogs.length + 1, createdAt: new Date(), ...log };
      reviewLogs.push(entry);
      return entry.reviewId;
    },
    findReviewLogsByDocumentId: async (docId) =>
      reviewLogs.filter((l) => l.documentId === docId),
    hasExpiryNoticeBeenSent: async (documentId, noticeType) =>
      notices.has(`${documentId}_${noticeType}`),
    recordExpiryNotice: async (documentId, noticeType, recipientUserId) => {
      notices.add(`${documentId}_${noticeType}`);
      return true;
    },
    updateOrderStatus: async (orderId, newStatus) => {
      const o = orders.get(orderId);
      if (o) o.status = newStatus;
    },
  };
}

// 1. evaluateRequirement: Cách A — Manager approval is authoritative, no Tier A/B issued_too_early rejection
test('1. evaluateRequirement: handles reusable, pending_review, missing, explicit expired, and trusts Manager approval', () => {
  const requirement = {
    regulationId: 1,
    documentTypeCode: 'health_certificate',
    tier: 'A',
    leadTimeDays: 7,
    maxIssueAgeDays: 10,
    minValidityBufferHours: 48,
  };

  const departureAt = new Date('2026-12-15T00:00:00.000+07:00');
  const tripEndAt = new Date('2026-12-16T10:00:00.000+07:00');
  const now = new Date('2026-12-01T08:00:00.000+07:00');

  // 1.1 reusable: approved doc, valid expiry
  const res1 = evaluateRequirement({
    requirement,
    document: {
      id: 10,
      status: 'approved',
      issueDate: '2026-12-10',
      expiryDate: '2027-06-01',
    },
    departureAt,
    tripEndAt,
    now,
  });
  assert.equal(res1.status, 'reusable');
  assert.equal(res1.canSubmitLater, true);

  // 1.2 pending_review: submitted doc
  const res2 = evaluateRequirement({
    requirement,
    document: {
      id: 11,
      status: 'submitted',
      issueDate: '2026-12-10',
      expiryDate: '2027-06-01',
    },
    departureAt,
    tripEndAt,
    now,
  });
  assert.equal(res2.status, 'pending_review');
  assert.equal(res2.canSubmitLater, true);

  // 1.3 missing: no document provided + Cách A submitDeadline = max(today, departure - 1d), never before today
  const res3 = evaluateRequirement({
    requirement,
    document: null,
    departureAt,
    tripEndAt,
    now,
  });
  assert.equal(res3.status, 'missing');
  assert.equal(res3.canSubmitLater, true);
  assert.equal(res3.submitDeadline, '2026-12-14'); // departure 15/12 - 1d

  // Order created on 2026-11-28 departing 2026-12-01 with leadTimeDays=7 must NOT produce 2026-11-24!
  const resNear = evaluateRequirement({
    requirement: { ...requirement, leadTimeDays: 7 },
    document: null,
    departureAt: new Date('2026-12-01T08:00:00.000+07:00'),
    tripEndAt: new Date('2026-12-02T10:00:00.000+07:00'),
    now: new Date('2026-11-28T08:55:00.000+07:00'),
  });
  assert.equal(resNear.submitDeadline, '2026-11-30');

  // Same-day departure must clamp to today (never yesterday)
  const resSameDay = evaluateRequirement({
    requirement: { ...requirement, leadTimeDays: 14 },
    document: null,
    departureAt: new Date('2026-11-28T18:00:00.000+07:00'),
    tripEndAt: new Date('2026-11-29T10:00:00.000+07:00'),
    now: new Date('2026-11-28T08:55:00.000+07:00'),
  });
  assert.equal(resSameDay.submitDeadline, '2026-11-28');

  // 1.4 Cách A: earlier issueDate is NOT auto-rejected as issued_too_early when Manager already approved
  const res4 = evaluateRequirement({
    requirement,
    document: {
      id: 12,
      status: 'approved',
      issueDate: '2026-12-04',
      expiryDate: '2027-06-01',
    },
    departureAt,
    tripEndAt,
    now,
  });
  assert.equal(res4.status, 'reusable');

  // 1.5 Cách A: Manager-approved doc inside old +48h buffer stays usable (reusable/expiring), never auto-downgraded to expired
  const res5 = evaluateRequirement({
    requirement,
    document: {
      id: 14,
      status: 'approved',
      issueDate: '2026-12-10',
      expiryDate: '2026-12-17',
    },
    departureAt,
    tripEndAt,
    now,
  });
  assert.ok(res5.status === 'reusable' || res5.status === 'expiring');

  // 1.6 Explicit DB status='expired' still evaluates to expired
  const res6 = evaluateRequirement({
    requirement,
    document: {
      id: 15,
      status: 'expired',
      issueDate: '2026-12-01',
      expiryDate: '2026-12-05',
    },
    departureAt,
    tripEndAt,
    now,
  });
  assert.equal(res6.status, 'expired');
});

// 2. Round-trip: Cách A trusts Manager-approved document, flags explicit DB expired status
test('2. Round-trip: Manager-approved document remains valid while DB-expired document evaluates to expired', () => {
  const requirement = {
    regulationId: 2,
    documentTypeCode: 'health_certificate',
    tier: 'A',
    leadTimeDays: 7,
    minValidityBufferHours: 48,
  };

  const departureAt = new Date('2026-12-01T00:00:00.000+07:00');
  const tripEndAt = new Date('2026-12-27T23:59:59.999+07:00');
  const now = new Date('2026-11-20T08:00:00.000+07:00');

  // Manager already approved -> trusted (informational expiring/reusable, not auto-rejected)
  const resApproved = evaluateRequirement({
    requirement,
    document: {
      id: 20,
      status: 'approved',
      issueDate: '2026-11-28',
      expiryDate: '2026-12-10',
    },
    departureAt,
    tripEndAt,
    now,
  });
  assert.ok(resApproved.status === 'reusable' || resApproved.status === 'expiring');

  // Explicit DB status='expired' -> expired
  const resExpired = evaluateRequirement({
    requirement,
    document: {
      id: 21,
      status: 'expired',
      issueDate: '2026-11-01',
      expiryDate: '2026-11-15',
    },
    departureAt,
    tripEndAt,
    now,
  });
  assert.equal(resExpired.status, 'expired');
});

// 3. earliestFeasibleDeparture: Cách A never pushes departure date forward based on document leadTimeDays
test('3. earliestFeasibleDeparture: does not push departure date forward regardless of missing docs', () => {
  const now = new Date('2026-12-01T08:00:00.000+07:00');

  const missingReqs = [
    { status: 'missing', leadTimeDays: 14 },
    { status: 'reusable', leadTimeDays: 30 },
  ];
  assert.equal(formatDateIct(earliestFeasibleDeparture(missingReqs, now)), '2026-12-01');

  const reusableReqs = [
    { status: 'reusable', leadTimeDays: 14 },
    { status: 'pending_review', leadTimeDays: 7 },
  ];
  assert.equal(formatDateIct(earliestFeasibleDeparture(reusableReqs, now)), '2026-12-01');
});

// 4. assertDocumentLeadTime: Cách A no longer blocks order creation with 422 DOCUMENT_LEAD_TIME_VIOLATION
test('4. assertDocumentLeadTime: allows booking without blocking on document lead time (Cách A)', async () => {
  const store = makeMockDocumentsStore();
  const service = new DocumentsService(store, { createNotification: async () => {} }, {});

  const today = new Date().toISOString().slice(0, 10);

  await assert.doesNotReject(async () => {
    await service.assertDocumentLeadTime({
      destinationCountry: 'Australia',
      transportMode: 'air',
      horseIds: [101],
      departDate: today,
    });
  });
});

// 5. GET /compliance/requirements: security & ownership verification
test('5. GET /compliance/requirements: returns 403 Forbidden when customer accesses another user horse', async () => {
  const store = makeMockDocumentsStore();
  const service = new DocumentsService(store, { createNotification: async () => {} }, {});
  const monitor = new DocumentExpiryMonitorService(store, service, { createNotification: async () => {} }, {});
  const controller = new ComplianceController(service, monitor);

  // Horse 102 belongs to CUSTOMER_BOB (id: 20). CUSTOMER_ALICE (id: 10) queries it.
  await assert.rejects(
    async () => {
      await controller.getRequirements(
        CUSTOMER_ALICE,
        'Singapore',
        '2026-12-20',
        'air',
        '102' // Bob's horse
      );
    },
    (err) => {
      assert(err instanceof ForbiddenException);
      return true;
    }
  );

  // When Alice queries her own horse (101), it succeeds
  const res = await controller.getRequirements(
    CUSTOMER_ALICE,
    'Singapore',
    '2026-12-25',
    'air',
    '101'
  );
  assert.equal(res.country, 'Singapore');
  assert.equal(res.horses.length, 1);
  assert.equal(res.horses[0].horseId, 101);
});

// 6. Order checklist recognizes general horse documents matching document_type_code
test('6. Order checklist recognizes general horse documents matching document_type_code', async () => {
  const store = makeMockDocumentsStore({
    docs: [
      [
        1,
        {
          id: 1,
          horseId: 101,
          regulationId: null, // General horse document, not uploaded for a specific regulation
          documentTypeCode: 'horse_passport',
          docType: 'horse_passport',
          docNumber: 'PASS-101',
          fileUrl: '/docs/pass101.pdf',
          issueDate: '2026-01-01',
          expiryDate: '2028-01-01',
          status: 'approved',
          isArchived: false,
        },
      ],
    ],
    orders: [
      [
        500,
        {
          id: 500,
          customer_id: 10,
          request_code: 'REQ-500',
          destination_location: 'Singapore Changi',
          transport_mode: 'air',
          requested_date: '2026-12-20',
          horses: [{ id: 101, name: 'Storm' }],
        },
      ],
    ],
  });

  const service = new DocumentsService(store, { createNotification: async () => {} }, {});
  const checklist = await service.getOrderComplianceChecklist(CUSTOMER_ALICE, 500);

  assert.equal(checklist.orderId, 500);
  assert(checklist.approvedDocumentsCount >= 1);
  const passportDoc = checklist.horses[0].documents.find(
    (d) => d.documentTypeCode === 'horse_passport' || d.docType === 'horse_passport'
  );
  assert(passportDoc, 'General horse passport document must be matched');
  assert.equal(passportDoc.matchedBy, 'document_type');
});

// 7. Logistics Manager review: 4 criteria validation, conflict on rejected, writes review log
test('7. Logistics Manager review: 4 criteria required, writes audit log, prevents re-reviewing rejected', async () => {
  const store = makeMockDocumentsStore({
    docs: [
      [
        50,
        {
          id: 50,
          horseId: 101,
          status: 'submitted',
          docType: 'health_certificate',
          documentTypeCode: 'health_certificate',
          fileUrl: '/docs/doc50.pdf',
          isArchived: false,
        },
      ],
    ],
  });

  const service = new DocumentsService(store, { createNotification: async () => {} }, {});

  // 7.1 Review approved without 4 checkedFields -> 400 BadRequestException
  await assert.rejects(
    async () => {
      await service.reviewDocument(MANAGER, 50, {
        status: 'approved',
        expiryDate: '2027-01-01',
        checkedFields: {
          microchipMatches: true,
          passportMatches: true,
          issueDateOk: false, // Incomplete!
          expiryOk: true,
        },
      });
    },
    (err) => {
      assert(err instanceof BadRequestException);
      assert(err.message.includes('4 tiêu chí'));
      return true;
    }
  );

  // 7.2 Review approved with all 4 true -> succeeds and logs audit entry
  const approvedDoc = await service.reviewDocument(MANAGER, 50, {
    status: 'approved',
    expiryDate: '2027-01-01',
    docNumber: 'REF-2026-001',
    checkedFields: {
      microchipMatches: true,
      passportMatches: true,
      issueDateOk: true,
      expiryOk: true,
    },
  });
  assert.equal(approvedDoc.status, 'approved');
  assert.equal(store.reviewLogs.length, 1);
  assert.equal(store.reviewLogs[0].toStatus, 'approved');
  assert.equal(store.reviewLogs[0].reviewerId, 1);

  // 7.3 Attempting to review a non-submitted / rejected doc -> 409 ConflictException
  store.docs.get(50).status = 'rejected';
  await assert.rejects(
    async () => {
      await service.reviewDocument(MANAGER, 50, {
        status: 'approved',
        expiryDate: '2027-01-01',
        checkedFields: {
          microchipMatches: true,
          passportMatches: true,
          issueDateOk: true,
          expiryOk: true,
        },
      });
    },
    (err) => {
      assert(err instanceof ConflictException);
      return true;
    }
  );
});

// 8. DocumentExpiryMonitorService: auto-expires, idempotent notices, demotes ready_to_depart orders
test('8. DocumentExpiryMonitorService: auto-expires, demotes ready_to_depart orders, leaves in_transit orders', async () => {
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const in3Days = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);

  const store = makeMockDocumentsStore({
    docs: [
      // Expired document
      [
        60,
        {
          id: 60,
          horseId: 101,
          status: 'approved',
          expiryDate: yesterday,
          documentTypeCode: 'health_certificate',
          docType: 'health_certificate',
          isArchived: false,
        },
      ],
      // Expiring in 3 days (within 7-day reminder window)
      [
        61,
        {
          id: 61,
          horseId: 101,
          status: 'approved',
          expiryDate: in3Days,
          documentTypeCode: 'horse_passport',
          docType: 'horse_passport',
          isArchived: false,
        },
      ],
    ],
    orders: [
      [
        701,
        {
          id: 701,
          customer_id: 10,
          request_code: 'REQ-701',
          status: 'ready_to_depart',
          horses: [{ id: 101 }],
        },
      ],
      [
        702,
        {
          id: 702,
          customer_id: 10,
          request_code: 'REQ-702',
          status: 'in_transit',
          horses: [{ id: 101 }],
        },
      ],
    ],
  });

  const mockDocsService = {
    getOrderComplianceChecklist: async (user, shipmentId) => ({
      orderId: shipmentId,
      isFullyCompliant: false,
      hasExpiredDocuments: true,
      horses: [
        {
          horseId: 101,
          documents: [
            { id: 60, isExpiredForTrip: true, regulationDocType: 'health_certificate', status: 'expired' },
          ],
        },
      ],
    }),
  };

  const pool = {
    execute: async (sql, params) => {
      if (sql.includes("SELECT shipment_id, customer_id FROM shipment WHERE status = 'ready_to_depart'")) {
        const rows = [...store.orders.entries()]
          .filter(([_, o]) => o.status === 'ready_to_depart')
          .map(([id, o]) => ({ shipment_id: id, customer_id: o.customer_id || 10 }));
        return [rows];
      }
      if (sql.includes("UPDATE shipment SET status = 'confirmed'")) {
        const orderId = params[0];
        const o = store.orders.get(orderId);
        if (o && o.status === 'ready_to_depart') o.status = 'confirmed';
        return [{ affectedRows: 1 }];
      }
      return [[]];
    },
  };

  const monitor = new DocumentExpiryMonitorService(
    store,
    mockDocsService,
    { createNotification: async () => {}, notifyRole: async () => {} },
    pool
  );

  // First sweep run
  const res1 = await monitor.runSweep();
  assert.equal(res1.expiredCount, 1);
  assert(res1.reminderCount >= 1);
  assert.equal(res1.demotedOrdersCount, 1);

  // Doc 60 is now expired
  assert.equal(store.docs.get(60).status, 'expired');

  // Order 701 (ready_to_depart) demoted back to confirmed
  assert.equal(store.orders.get(701).status, 'confirmed');

  // Order 702 (in_transit) was NOT demoted
  assert.equal(store.orders.get(702).status, 'in_transit');

  // Second sweep run: verify idempotency of reminders
  const res2 = await monitor.runSweep();
  assert.equal(res2.expiredCount, 0, 'No new docs expired on 2nd run');
  assert.equal(res2.reminderCount, 0, 'No duplicate reminders on 2nd run');
});
