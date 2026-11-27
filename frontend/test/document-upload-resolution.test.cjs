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

test('parseOptionalPositiveId rejects null, empty, 0, negative, float, and NaN', () => {
  assert.equal(resolution.parseOptionalPositiveId(null), undefined);
  assert.equal(resolution.parseOptionalPositiveId(undefined), undefined);
  assert.equal(resolution.parseOptionalPositiveId(''), undefined);
  assert.equal(resolution.parseOptionalPositiveId('   '), undefined);
  assert.equal(resolution.parseOptionalPositiveId(0), undefined);
  assert.equal(resolution.parseOptionalPositiveId('0'), undefined);
  assert.equal(resolution.parseOptionalPositiveId(-3), undefined);
  assert.equal(resolution.parseOptionalPositiveId(1.5), undefined);
  assert.equal(resolution.parseOptionalPositiveId('2.75'), undefined);
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

test('resolveSummaryDocTypeArgs prefers defaultDocType/reuploadTitle in reupload mode over any regulation', () => {
  // Even if currentRegulation were coggins_test, reupload mode must display the vaccine document type
  const args = resolution.resolveSummaryDocTypeArgs({
    isReupload: true,
    reuploadTitle: 'Chứng nhận tiêm phòng cúm ngựa',
    defaultDocType: 'vaccination_influenza',
    currentRegulation: SAMPLE_REGULATIONS[0], // coggins_test
  });
  assert.equal(args.docType, 'vaccination_influenza');
  assert.equal(args.customTitle, 'Chứng nhận tiêm phòng cúm ngựa');

  // Reupload without currentRegulation (unlinked doc) preserves canonical code + custom title
  const unlinkedArgs = resolution.resolveSummaryDocTypeArgs({
    isReupload: true,
    reuploadTitle: 'Tiêm phòng uốn ván',
    defaultDocType: 'vaccination_tetanus',
    currentRegulation: undefined,
  });
  assert.equal(unlinkedArgs.docType, 'vaccination_tetanus');
  assert.equal(unlinkedArgs.customTitle, 'Tiêm phòng uốn ván');

  // Reupload with only reuploadTitle (no defaultDocType)
  const titleOnly = resolution.resolveSummaryDocTypeArgs({
    isReupload: true,
    reuploadTitle: 'Chứng nhận tiêm phòng cúm ngựa',
    defaultDocType: '',
    currentRegulation: SAMPLE_REGULATIONS[0], // coggins_test
  });
  assert.equal(titleOnly.docType, 'Chứng nhận tiêm phòng cúm ngựa');
  assert.equal(titleOnly.customTitle, 'Chứng nhận tiêm phòng cúm ngựa');

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

test('resolveInitialRegulation matches vaccination_record and Vietnamese health certificate title', () => {
  const extendedRegs = [
    ...SAMPLE_REGULATIONS,
    {
      id: 15,
      country: 'Vietnam',
      documentType: 'health_certificate',
      documentTypeCode: 'health_certificate',
      description: 'Giấy kiểm dịch động vật nội địa (Mẫu 15b-TY)',
      effectiveDate: null,
      createdAt: '',
    },
  ];
  const vacRecord = resolution.resolveInitialRegulation(extendedRegs, {
    defaultDocType: 'vaccination_record',
    destinationCountry: 'Thailand',
    isReupload: true,
  });
  assert.equal(vacRecord?.id, 11);

  const healthByViTitle = resolution.resolveInitialRegulation(extendedRegs, {
    reuploadTitle: 'Giấy chứng nhận kiểm dịch thú y quốc tế',
    destinationCountry: 'Vietnam',
    isReupload: true,
  });
  assert.equal(healthByViTitle?.id, 15);
});

test('translateDocType + resolveSummaryDocTypeArgs renders accurate labels for all live document & regulation patterns', () => {
  const langSrc = fs.readFileSync(
    path.resolve(__dirname, '../src/lib/i18n/LanguageContext.tsx'),
    'utf8',
  );
  const docTypeMatch = langSrc.match(/const DOC_TYPE_DATA[\s\S]*?^};/m);
  const translateFnMatch = langSrc.match(
    /const translateDocType = useCallback\(\s*(\(docType[\s\S]*?\n    \}),\s*\[language\]/m,
  );
  assert.ok(docTypeMatch && translateFnMatch, 'Expected DOC_TYPE_DATA and translateDocType in LanguageContext.tsx');

  const makeTranslator = (language) => {
    const code = `${docTypeMatch[0]}\nconst fn = ${translateFnMatch[1]};\nreturn fn;`;
    const js = ts.transpileModule(code, {
      compilerOptions: { target: ts.ScriptTarget.ES2020 },
    }).outputText;
    return new Function('language', js)(language);
  };

  const tVi = makeTranslator('vi');
  const tEn = makeTranslator('en');

  // 1. DOC-005 (expired unlinked vaccine on REQ-008)
  const doc5Args = resolution.resolveSummaryDocTypeArgs({
    isReupload: true,
    reuploadTitle: 'vaccination',
    defaultDocType: 'vaccination_influenza',
    currentRegulation: SAMPLE_REGULATIONS[0], // even if coggins were passed
  });
  assert.equal(tVi(doc5Args.docType, doc5Args.customTitle), 'Chứng nhận tiêm phòng cúm ngựa');
  assert.equal(tEn(doc5Args.docType, doc5Args.customTitle), 'Equine Influenza Vaccination Certificate');

  // 2. Regulation descriptions ending with parentheticals must NEVER truncate to "(Mẫu 15b-TY)", "(cấp trong 10 ngày)", or "(AVS/DVS/AFCD)"
  assert.equal(
    tVi('Giấy kiểm dịch động vật nội địa (Mẫu 15b-TY)'),
    'Giấy chứng nhận kiểm dịch thú y quốc tế',
  );
  assert.equal(
    tVi('Giấy chứng nhận sức khỏe kiểm dịch quốc tế (cấp trong 10 ngày)'),
    'Giấy chứng nhận kiểm dịch thú y quốc tế',
  );
  assert.equal(
    tEn('Giấy phép nhập cảnh động vật chính thức (AVS/DVS/AFCD)'),
    'Live Animal Import & Transit Permit',
  );

  // 3. Tetanus vaccine must NOT be mislabeled as Equine Influenza
  const tetanusArgs = resolution.resolveSummaryDocTypeArgs({
    isReupload: true,
    reuploadTitle: 'Tiêm phòng uốn ván',
    defaultDocType: 'vaccination_tetanus',
    currentRegulation: undefined,
  });
  assert.equal(tVi(tetanusArgs.docType, tetanusArgs.customTitle), 'Chứng nhận tiêm phòng uốn ván');
  assert.equal(tEn(tetanusArgs.docType, tetanusArgs.customTitle), 'Tetanus Vaccination Certificate');
  assert.equal(tVi('Tiêm phòng uốn ván'), 'Chứng nhận tiêm phòng uốn ván');

  // 4. Microchip certificate translates cleanly instead of leaking raw snake_case
  assert.equal(tVi('microchip_certificate'), 'Giấy chứng nhận vi mạch (Microchip)');
  assert.equal(tEn('microchip_certificate'), 'Microchip Identification Certificate');

  // 5. Export quarantine certificate does not collide with generic quarantine_certificate
  assert.equal(tVi('export_quarantine_certificate'), 'Giấy chứng nhận kiểm dịch xuất khẩu');
  assert.equal(tEn('export_quarantine_certificate'), 'Export Quarantine Clearance Certificate');

  // 6. Custom unknown document preserves customTitle
  const customArgs = resolution.resolveSummaryDocTypeArgs({
    isReupload: true,
    reuploadTitle: 'Custom Lab Certificate',
    defaultDocType: 'custom_lab_cert',
    currentRegulation: undefined,
  });
  assert.equal(tVi(customArgs.docType, customArgs.customTitle), 'Custom Lab Certificate');
  assert.equal(tEn(customArgs.docType, customArgs.customTitle), 'Custom Lab Certificate');

  // 7. Genuine bilingual parenthetical still splits cleanly for unknown doc types
  assert.equal(tEn('Special Stable Clearance (Giấy xác nhận chuồng đặc biệt)'), 'Special Stable Clearance');
  assert.equal(tVi('Special Stable Clearance (Giấy xác nhận chuồng đặc biệt)'), 'Giấy xác nhận chuồng đặc biệt');
});
