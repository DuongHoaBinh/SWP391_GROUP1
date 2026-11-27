const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function loadTsModule(absPath) {
  const compiled = new Module(absPath, module);
  compiled.filename = absPath;
  compiled.paths = module.paths;
  compiled.require = (name) => require(name);
  const src = fs.readFileSync(absPath, 'utf8');
  const transpiled = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  compiled._compile(transpiled, absPath);
  return compiled.exports;
}

const resolution = loadTsModule(
  path.resolve(__dirname, '../src/features/documents/document-upload-resolution.ts'),
);

const SAMPLE_REGULATIONS = [
  {
    id: 10,
    country: 'Thailand',
    documentType: 'coggins_test',
    documentTypeCode: 'eia_coggins_test',
    description: 'Chứng nhận xét nghiệm máu Coggins (EIA)',
    effectiveDate: null,
    createdAt: '',
  },
  {
    id: 11,
    country: 'Thailand',
    documentType: 'vaccination_certificate',
    documentTypeCode: 'vaccination_influenza',
    description: 'Chứng nhận tiêm phòng cúm ngựa',
    effectiveDate: null,
    createdAt: '',
  },
  {
    id: 12,
    country: 'Singapore',
    documentType: 'coggins_test',
    documentTypeCode: 'eia_coggins_test',
    description: 'EIA (Coggins) Singapore',
    effectiveDate: null,
    createdAt: '',
  },
  {
    id: 13,
    country: 'Singapore',
    documentType: 'import_permit',
    documentTypeCode: 'import_permit',
    description: 'Giấy phép nhập khẩu SFA',
    effectiveDate: null,
    createdAt: '',
  },
  {
    id: 14,
    country: 'Global Baseline',
    documentType: 'horse_passport',
    documentTypeCode: 'horse_passport',
    description: 'Hộ chiếu ngựa FEI',
    effectiveDate: null,
    createdAt: '',
  },
];

test('parseOptionalPositiveId rejects null, empty, 0, negative, and NaN', () => {
  assert.equal(resolution.parseOptionalPositiveId(null), undefined);
  assert.equal(resolution.parseOptionalPositiveId(undefined), undefined);
  assert.equal(resolution.parseOptionalPositiveId(''), undefined);
  assert.equal(resolution.parseOptionalPositiveId('   '), undefined);
  assert.equal(resolution.parseOptionalPositiveId(0), undefined);
  assert.equal(resolution.parseOptionalPositiveId('0'), undefined);
  assert.equal(resolution.parseOptionalPositiveId(-3), undefined);
  assert.equal(resolution.parseOptionalPositiveId(Number.NaN), undefined);
  assert.equal(resolution.parseOptionalPositiveId('not-a-number'), undefined);

  assert.equal(resolution.parseOptionalPositiveId(5), 5);
  assert.equal(resolution.parseOptionalPositiveId('12'), 12);
});

test('resolveInitialRegulation prioritizes valid defaultRegulationId when present', () => {
  const matched = resolution.resolveInitialRegulation(SAMPLE_REGULATIONS, {
    defaultRegulationId: 13,
    defaultDocType: 'coggins_test',
    destinationCountry: 'Thailand',
    isReupload: true,
  });
  assert.equal(matched?.id, 13);
});

test('resolveInitialRegulation matches expired vaccine doc without regulationId (DOC-005 scenario)', () => {
  // Simulates DOC-005 where d.regulationId is null (or accidentally 0) and destination is Thailand
  const matchedFromNull = resolution.resolveInitialRegulation(SAMPLE_REGULATIONS, {
    defaultRegulationId: null,
    defaultDocType: 'vaccination_influenza',
    reuploadTitle: 'Chứng nhận tiêm phòng cúm ngựa',
    destinationCountry: 'Thailand',
    isReupload: true,
  });
  assert.equal(matchedFromNull?.id, 11);
  assert.equal(matchedFromNull?.documentType, 'vaccination_certificate');

  // Even if a caller passes 0, it must still match vaccine instead of falling back to coggins_test (#10)
  const matchedFromZero = resolution.resolveInitialRegulation(SAMPLE_REGULATIONS, {
    defaultRegulationId: 0,
    defaultDocType: 'vaccination_certificate',
    reuploadTitle: 'Chứng nhận tiêm phòng cúm ngựa',
    destinationCountry: 'Thailand',
    isReupload: true,
  });
  assert.equal(matchedFromZero?.id, 11);
});

test('resolveInitialRegulation matches across countries when destination has no matching docType', () => {
  // Singapore has no vaccine regulation in SAMPLE_REGULATIONS, but Thailand does
  const matched = resolution.resolveInitialRegulation(SAMPLE_REGULATIONS, {
    defaultRegulationId: undefined,
    defaultDocType: 'vaccination_influenza',
    reuploadTitle: 'Chứng nhận tiêm phòng cúm ngựa',
    destinationCountry: 'Singapore',
    isReupload: true,
  });
  assert.equal(matched?.id, 11);
});

test('resolveInitialRegulation matches by Vietnamese reuploadTitle when docType is omitted', () => {
  const matched = resolution.resolveInitialRegulation(SAMPLE_REGULATIONS, {
    defaultRegulationId: undefined,
    defaultDocType: undefined,
    reuploadTitle: 'Chứng nhận tiêm phòng cúm ngựa',
    destinationCountry: 'Thailand',
    isReupload: true,
  });
  assert.equal(matched?.id, 11);
});

test('resolveInitialRegulation NEVER falls back to unrelated regulation (e.g. coggins_test) in reupload mode', () => {
  // Tetanus vaccine is NOT in SAMPLE_REGULATIONS and must NOT match influenza (#11) or coggins (#10)
  const unmatchedTetanus = resolution.resolveInitialRegulation(SAMPLE_REGULATIONS, {
    defaultRegulationId: undefined,
    defaultDocType: 'vaccination_tetanus',
    reuploadTitle: 'Tiêm phòng uốn ván',
    destinationCountry: 'Thailand',
    isReupload: true,
  });
  assert.equal(unmatchedTetanus, undefined);

  // Unknown regulationId + custom docType in reupload mode must NOT fall back to coggins_test
  const unmatchedCustom = resolution.resolveInitialRegulation(SAMPLE_REGULATIONS, {
    defaultRegulationId: 9999,
    defaultDocType: 'custom_lab_cert',
    reuploadTitle: 'Custom Lab Certificate',
    destinationCountry: 'Thailand',
    isReupload: true,
  });
  assert.equal(unmatchedCustom, undefined);
});

test('resolveInitialRegulation falls back to destination -> baseline -> first for fresh uploads', () => {
  const destFallback = resolution.resolveInitialRegulation(SAMPLE_REGULATIONS, {
    destinationCountry: 'Singapore',
    isReupload: false,
  });
  assert.equal(destFallback?.id, 12);

  const baselineFallback = resolution.resolveInitialRegulation(SAMPLE_REGULATIONS, {
    destinationCountry: 'UnknownCountry',
    isReupload: false,
  });
  assert.equal(baselineFallback?.id, 14);

  const emptyResult = resolution.resolveInitialRegulation([], {
    destinationCountry: 'Singapore',
    isReupload: false,
  });
  assert.equal(emptyResult, undefined);
});

test('resolveSummaryDocTypeArgs prefers reuploadTitle/defaultDocType in reupload mode over any regulation', () => {
  // Even if currentRegulation were coggins_test, reupload mode must display the vaccine document type
  const args = resolution.resolveSummaryDocTypeArgs({
    isReupload: true,
    reuploadTitle: 'Chứng nhận tiêm phòng cúm ngựa',
    defaultDocType: 'vaccination_influenza',
    currentRegulation: SAMPLE_REGULATIONS[0], // coggins_test
  });
  assert.equal(args.docType, 'Chứng nhận tiêm phòng cúm ngựa');
  assert.equal(args.customTitle, 'Chứng nhận tiêm phòng cúm ngựa');

  // Reupload without currentRegulation (unlinked doc)
  const unlinkedArgs = resolution.resolveSummaryDocTypeArgs({
    isReupload: true,
    reuploadTitle: 'Tiêm phòng uốn ván',
    defaultDocType: 'vaccination_tetanus',
    currentRegulation: undefined,
  });
  assert.equal(unlinkedArgs.docType, 'Tiêm phòng uốn ván');
  assert.equal(unlinkedArgs.customTitle, 'Tiêm phòng uốn ván');

  // Reupload with only defaultDocType
  const docTypeOnly = resolution.resolveSummaryDocTypeArgs({
    isReupload: true,
    reuploadTitle: '',
    defaultDocType: 'vaccination_influenza',
    currentRegulation: undefined,
  });
  assert.equal(docTypeOnly.docType, 'vaccination_influenza');
});

test('resolveSummaryDocTypeArgs prefers currentRegulation in fresh upload mode', () => {
  const freshArgs = resolution.resolveSummaryDocTypeArgs({
    isReupload: false,
    reuploadTitle: undefined,
    defaultDocType: undefined,
    currentRegulation: SAMPLE_REGULATIONS[3], // import_permit
  });
  assert.equal(freshArgs.docType, 'import_permit');
  assert.equal(freshArgs.customTitle, 'Giấy phép nhập khẩu SFA');

  const fallbackArgs = resolution.resolveSummaryDocTypeArgs({
    isReupload: false,
    currentRegulation: undefined,
  });
  assert.equal(fallbackArgs.docType, 'Hồ sơ kiểm dịch');
});
