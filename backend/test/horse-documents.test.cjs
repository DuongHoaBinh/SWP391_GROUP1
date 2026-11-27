// Step 2 sau review 11/2026: hồ sơ ngựa bỏ giới tính/ngày sinh, giấy tờ lưu trên ngựa và dùng lại cho nhiều đơn.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Reflector } = require('@nestjs/core');
const { ForbiddenException, NotFoundException, BadRequestException } = require('@nestjs/common');
const { UserRole } = require('../dist/modules/auth/auth.types');
const { RolesGuard } = require('../dist/common/guards/roles.guard');
const { DocumentsService } = require('../dist/modules/documents/documents.service');
const { HorseDocumentsController } = require('../dist/modules/documents/horse-documents.controller');
const { CreateHorseDto } = require('../dist/modules/horses/dto/create-horse.dto');
const {
  computeDocumentValidity,
  computeDefaultExpiryDate,
  isExpiryBeforeIssue,
} = require('../dist/modules/documents/document-validity.policy');

const OWNER = { id: '10', email: 'owner@test.local', role: UserRole.CUSTOMER };
const OTHER = { id: '11', email: 'other@test.local', role: UserRole.CUSTOMER };
const MANAGER = { id: '1', email: 'manager@test.local', role: UserRole.LOGISTICS_MANAGER };

function makeStore() {
  const docs = new Map();
  let nextId = 100;
  const store = {
    docs,
    created: [],
    findHorseOwnerId: async (horseId) => (horseId === 5 ? 10 : undefined),
    findDocumentTypeByCode: async (code) =>
      code === 'health_certificate'
        ? { code, nameVi: 'Giấy chứng nhận sức khỏe', nameEn: 'Health certificate', defaultValidityDays: 10, isIdentity: false, sortOrder: 70 }
        : code === 'horse_passport'
          ? { code, nameVi: 'Hộ chiếu ngựa', nameEn: 'Horse passport', defaultValidityDays: null, isIdentity: true, sortOrder: 10 }
          : undefined,
    findDocumentTypes: async () => [],
    createHorseDocument: async (uploadedBy, input) => {
      const id = nextId++;
      store.created.push({ uploadedBy, ...input });
      docs.set(id, {
        id,
        horseId: input.horseId,
        ownerId: 10,
        regulationId: null,
        documentTypeCode: input.documentTypeCode,
        docType: input.docType,
        docNumber: input.docNumber,
        fileUrl: input.fileUrl,
        issueDate: input.issueDate,
        expiryDate: input.expiryDate,
        status: 'submitted',
        uploadedBy,
      });
      return id;
    },
    findDocumentById: async (id) => docs.get(id),
    findDocumentsByHorseId: async (horseId) => [...docs.values()].filter((d) => d.horseId === horseId),
    findDocumentHistory: async () => [...docs.values()],
  };
  return store;
}

const makeService = (store) => new DocumentsService(store, { notifyUser: async () => {} }, {});

test('computeDocumentValidity: valid / expiring_soon (< 30 ngày) / expired / no_expiry', () => {
  const now = new Date(2026, 10, 23); // 23/11/2026 giờ địa phương
  assert.deepEqual(computeDocumentValidity('2027-06-01', now).validityStatus, 'valid');
  assert.deepEqual(computeDocumentValidity('2026-12-10', now), { validityStatus: 'expiring_soon', daysUntilExpiry: 17 });
  assert.deepEqual(computeDocumentValidity('2026-11-23', now), { validityStatus: 'expiring_soon', daysUntilExpiry: 0 });
  assert.deepEqual(computeDocumentValidity('2026-11-22', now), { validityStatus: 'expired', daysUntilExpiry: -1 });
  assert.deepEqual(computeDocumentValidity(null, now), { validityStatus: 'no_expiry', daysUntilExpiry: null });
  assert.equal(computeDocumentValidity('2026-12-23', now).validityStatus, 'valid'); // đúng 30 ngày
});

test('computeDefaultExpiryDate / isExpiryBeforeIssue', () => {
  assert.equal(computeDefaultExpiryDate('2026-11-20', 10), '2026-11-30');
  assert.equal(computeDefaultExpiryDate('2026-11-20', null), null);
  assert.equal(computeDefaultExpiryDate(undefined, 10), null);
  assert.equal(isExpiryBeforeIssue('2026-11-20', '2026-11-19'), true);
  assert.equal(isExpiryBeforeIssue('2026-11-20', '2026-11-20'), false);
  assert.equal(isExpiryBeforeIssue(undefined, '2026-11-19'), false);
});

test('Chủ ngựa tải hộ chiếu lên hồ sơ ngựa và thấy nó trong danh sách', async () => {
  const store = makeStore();
  const service = makeService(store);
  const created = await service.uploadHorseDocument(OWNER, 5, {
    documentTypeCode: 'horse_passport',
    docNumber: ' FEI-VN-1 ',
    fileUrl: '/uploads/documents/passport.pdf',
    expiryDate: '2030-01-01',
  });
  assert.equal(created.regulationId, null);
  assert.equal(created.documentTypeCode, 'horse_passport');
  assert.equal(created.docNumber, 'FEI-VN-1');
  assert.equal(created.validityStatus, 'valid');
  assert.equal(store.created[0].uploadedBy, 10);

  const list = await service.listHorseDocuments(OWNER, 5);
  assert.equal(list.length, 1);
  assert.equal(list[0].id, created.id);
});

test('Hạn mặc định tính theo loại giấy tờ khi khách không nhập ngày hết hạn', async () => {
  const store = makeStore();
  const service = makeService(store);
  const created = await service.uploadHorseDocument(OWNER, 5, {
    documentTypeCode: 'health_certificate',
    fileUrl: '/uploads/documents/health.pdf',
    issueDate: '2026-11-20',
  });
  assert.equal(created.expiryDate, '2026-11-30');
});

test('Customer khác không xem, không tải được giấy tờ của ngựa người khác (403)', async () => {
  const store = makeStore();
  const service = makeService(store);
  await service.uploadHorseDocument(OWNER, 5, { documentTypeCode: 'horse_passport', fileUrl: '/uploads/documents/a.pdf' });
  const docId = [...store.docs.keys()][0];

  await assert.rejects(service.listHorseDocuments(OTHER, 5), ForbiddenException);
  await assert.rejects(
    service.uploadHorseDocument(OTHER, 5, { documentTypeCode: 'horse_passport', fileUrl: '/uploads/documents/b.pdf' }),
    ForbiddenException,
  );
  await assert.rejects(service.getHorseDocumentHistory(OTHER, 5, docId), ForbiddenException);
  await assert.rejects(service.getHorseDocumentFilePath(OTHER, 5, docId), ForbiddenException);
  assert.equal(store.created.length, 1);
});

test('Manager xem được giấy tờ của mọi ngựa; ngựa không tồn tại trả 404; giấy tờ khác ngựa trả 404', async () => {
  const store = makeStore();
  const service = makeService(store);
  await service.uploadHorseDocument(OWNER, 5, { documentTypeCode: 'horse_passport', fileUrl: '/uploads/documents/a.pdf' });
  const docId = [...store.docs.keys()][0];

  assert.equal((await service.listHorseDocuments(MANAGER, 5)).length, 1);
  await assert.rejects(service.listHorseDocuments(MANAGER, 999), NotFoundException);
  store.docs.get(docId).horseId = 6;
  await assert.rejects(service.getHorseDocumentHistory(MANAGER, 5, docId), NotFoundException);
});

test('Từ chối loại giấy tờ ngoài danh mục và ngày hết hạn trước ngày cấp', async () => {
  const service = makeService(makeStore());
  await assert.rejects(
    service.uploadHorseDocument(OWNER, 5, { documentTypeCode: 'unknown_doc', fileUrl: '/uploads/documents/a.pdf' }),
    BadRequestException,
  );
  await assert.rejects(
    service.uploadHorseDocument(OWNER, 5, {
      documentTypeCode: 'horse_passport',
      fileUrl: '/uploads/documents/a.pdf',
      issueDate: '2026-11-20',
      expiryDate: '2026-11-01',
    }),
    BadRequestException,
  );
});

test('Driver/Escort bị chặn ở tầng role với kho giấy tờ ngựa', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);
  const ctxFor = (role) => ({
    getHandler: () => HorseDocumentsController.prototype.listHorseDocuments,
    getClass: () => HorseDocumentsController,
    switchToHttp: () => ({ getRequest: () => ({ user: { id: '3', role } }) }),
  });
  assert.equal(guard.canActivate(ctxFor(UserRole.CUSTOMER)), true);
  assert.equal(guard.canActivate(ctxFor(UserRole.LOGISTICS_MANAGER)), true);
  assert.throws(() => guard.canActivate(ctxFor(UserRole.DRIVER_ESCORT)), /Access denied/);
});

test('Form ngựa hỗ trợ giới tính (male/female/gelding/other), không còn ngày sinh và không còn cờ chuồng riêng; có tính khí', () => {
  const { getMetadataStorage } = require('class-validator');
  const props = new Set(
    getMetadataStorage()
      .getTargetValidationMetadatas(CreateHorseDto, '', true, false)
      .map((m) => m.propertyName),
  );
  assert.ok(props.has('gender'));
  assert.ok(!props.has('dateOfBirth'));
  assert.ok(!props.has('requiresPrivateStall'));
  assert.ok(props.has('temperament'));
});
