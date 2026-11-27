import { RegulationItem } from './api/documents.api';

export interface ResolveRegulationOptions {
  defaultRegulationId?: number | string | null;
  defaultDocType?: string | null;
  reuploadTitle?: string | null;
  destinationCountry?: string | null;
  isReupload?: boolean;
}

export interface SummaryDocTypeOptions {
  isReupload: boolean;
  reuploadTitle?: string | null;
  defaultDocType?: string | null;
  currentRegulation?: Pick<RegulationItem, 'documentType' | 'documentTypeCode' | 'description'> | null;
}

/**
 * Parse a positive numeric ID, returning undefined for null/empty/0/negative/NaN.
 * Prevents `Number(null)` or `Number('')` from silently becoming `0`.
 */
export function parseOptionalPositiveId(value?: number | string | null): number | undefined {
  if (value === null || value === undefined) return undefined;
  const trimmed = String(value).trim();
  if (!trimmed) return undefined;
  const num = Number(trimmed);
  if (!Number.isFinite(num) || num <= 0) return undefined;
  return num;
}

export function normalizeDocTypeToken(value?: string | null): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

export function getDocTypeAliases(value?: string | null): string[] {
  const token = normalizeDocTypeToken(value);
  if (!token) return [];
  const aliases = new Set<string>([token]);

  if (token.includes('passport') || token.includes('hộ_chiếu')) {
    aliases.add('horse_passport');
  }
  if (token.includes('coggins') || token === 'eia' || token.includes('eia_')) {
    aliases.add('coggins_test');
    aliases.add('eia_coggins_test');
  }
  if (token.includes('tetanus') || token.includes('uốn_ván')) {
    aliases.add('vaccination_tetanus');
  } else if (
    token.includes('influenza') ||
    token.includes('cúm') ||
    token === 'vaccination_certificate' ||
    token === 'vaccination_influenza' ||
    token === 'vaccine' ||
    token === 'vaccination' ||
    token.includes('tiêm_phòng')
  ) {
    aliases.add('vaccination_certificate');
    aliases.add('vaccination_influenza');
  }
  if (
    token.includes('export') &&
    (token.includes('quarantine') || token.includes('permit') || token.includes('kiểm_dịch'))
  ) {
    aliases.add('export_permit');
    aliases.add('export_quarantine_certificate');
  } else if (token.includes('kiểm_dịch') && token.includes('xuất')) {
    aliases.add('export_permit');
    aliases.add('export_quarantine_certificate');
  }
  if (
    (token.includes('import') && (token.includes('permit') || token.includes('nhập'))) ||
    (token.includes('giấy_phép') && token.includes('nhập'))
  ) {
    aliases.add('import_permit');
  }
  if (
    token === 'health_certificate' ||
    token.includes('health_cert') ||
    token.includes('sức_khỏe')
  ) {
    aliases.add('health_certificate');
  }
  if (token.includes('customs') || token.includes('hải_quan')) {
    aliases.add('customs_declaration');
  }
  if (token.includes('ownership') || token.includes('sở_hữu')) {
    aliases.add('ownership_certificate');
  }
  if (token.includes('microchip') || token.includes('vi_mạch')) {
    aliases.add('microchip_certificate');
  }
  if (
    token === 'quarantine_certificate' ||
    (token.includes('quarantine') && !token.includes('export') && !token.includes('import'))
  ) {
    aliases.add('quarantine_certificate');
  }

  return Array.from(aliases);
}

function matchRegulationByHints(
  pool: RegulationItem[],
  hints: string[],
): RegulationItem | undefined {
  const hintTokens = hints.map(normalizeDocTypeToken).filter(Boolean);
  if (hintTokens.length === 0) return undefined;

  // 1. Exact normalized token match against documentTypeCode, documentType, or description
  for (const reg of pool) {
    const regTokens = [reg.documentTypeCode, reg.documentType, reg.description]
      .map(normalizeDocTypeToken)
      .filter(Boolean);
    if (hintTokens.some((ht) => regTokens.includes(ht))) {
      return reg;
    }
  }

  // 2. Canonical alias match (e.g. vaccination_influenza <-> vaccination_certificate, eia_coggins_test <-> coggins_test)
  const hintAliasSet = new Set<string>();
  for (const h of hints) {
    for (const alias of getDocTypeAliases(h)) {
      hintAliasSet.add(alias);
    }
  }
  if (hintAliasSet.size === 0) return undefined;

  for (const reg of pool) {
    const regAliases = [
      ...getDocTypeAliases(reg.documentTypeCode),
      ...getDocTypeAliases(reg.documentType),
    ];
    if (regAliases.some((ra) => hintAliasSet.has(ra))) {
      return reg;
    }
  }

  return undefined;
}

/**
 * Resolve the initial regulation for DocumentUploadModal.
 * - Priority 1: Exact match by valid positive `defaultRegulationId`.
 * - Priority 2: Match by `defaultDocType` / `reuploadTitle` (preferring destination country -> Global Baseline -> all).
 * - Priority 3: Fallback to first country/baseline/available regulation ONLY for fresh uploads (never for re-uploads).
 */
export function resolveInitialRegulation(
  regulations: RegulationItem[],
  options: ResolveRegulationOptions,
): RegulationItem | undefined {
  if (!Array.isArray(regulations) || regulations.length === 0) return undefined;

  const validRegId = parseOptionalPositiveId(options.defaultRegulationId);
  if (validRegId !== undefined) {
    const exactById = regulations.find((r) => Number(r.id) === validRegId);
    if (exactById) return exactById;
  }

  const normalizedDest = String(options.destinationCountry || '').trim().toLowerCase();
  const countryRegs =
    normalizedDest && normalizedDest !== 'all'
      ? regulations.filter((r) => r.country.toLowerCase() === normalizedDest)
      : [];
  const baselineRegs = regulations.filter(
    (r) => r.country.toLowerCase() === 'global baseline',
  );

  const hints = [options.defaultDocType, options.reuploadTitle]
    .map((v) => String(v || '').trim())
    .filter(Boolean);

  if (hints.length > 0) {
    const pools = [countryRegs, baselineRegs, regulations];
    for (const pool of pools) {
      if (pool.length === 0) continue;
      const matched = matchRegulationByHints(pool, hints);
      if (matched) return matched;
    }
  }

  if (options.isReupload) {
    return undefined;
  }

  return countryRegs[0] || baselineRegs[0] || regulations[0];
}

/**
 * Determine arguments for `translateDocType(docType, customTitle)` in the modal summary row.
 * When re-uploading, always prefer the document's own title / docType so an unlinked or unmatched
 * regulation can never overwrite the displayed document type.
 */
export function resolveSummaryDocTypeArgs(
  options: SummaryDocTypeOptions,
): { docType: string; customTitle?: string } {
  const reuploadTitle = options.reuploadTitle?.trim() || '';
  const defaultDocType = options.defaultDocType?.trim() || '';
  const regDocType =
    options.currentRegulation?.documentType?.trim() ||
    options.currentRegulation?.documentTypeCode?.trim() ||
    '';
  const regDescription = options.currentRegulation?.description?.trim() || '';

  if (options.isReupload) {
    return {
      docType: reuploadTitle || defaultDocType || regDocType || 'Hồ sơ kiểm dịch',
      customTitle: reuploadTitle || regDescription || undefined,
    };
  }

  return {
    docType: regDocType || defaultDocType || reuploadTitle || 'Hồ sơ kiểm dịch',
    customTitle: reuploadTitle || regDescription || undefined,
  };
}
