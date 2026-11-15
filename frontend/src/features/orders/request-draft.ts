import { z } from 'zod';

export const requestDraftFields = z.object({
  title: z.string().max(500), transportType: z.enum(['International', 'Domestic']),
  origin: z.string().max(2000), destination: z.string().max(2000),
  departureDate: z.string().max(40), arrivalDate: z.string().max(40).optional(),
  horseCount: z.number().finite().nonnegative(), specialReqs: z.string().max(20000).optional(),
});
const draftSchema = z.object({
  version: z.literal(1), savedAt: z.number().finite(), fields: requestDraftFields,
  currentStep: z.number().int().min(1).max(3), bookingType: z.enum(['shared_stall', 'dedicated_charter']),
  horseQuantities: z.record(z.string().regex(/^\d+$/), z.number().int().positive()),
  insuranceValues: z.record(z.string().regex(/^\d+$/), z.object({ declaredValue: z.string().max(100),
    declaredCurrency: z.enum(['VND', 'USD']), insurancePackage: z.enum(['basic', 'standard', 'premium']) })),
  routeData: z.object({ distanceKm: z.number().finite().nonnegative(), durationHours: z.number().finite().nonnegative().nullable(),
    mode: z.enum(['air', 'road']), source: z.enum(['road-routing', 'air-reference', 'rough-estimate']) }).nullable(),
});
export type RequestDraft = z.infer<typeof draftSchema>;
export function requestDraftKey(userId: string, selectedHorseId?: string | null) {
  return `equitransit_request_draft_v1:${encodeURIComponent(userId)}:${encodeURIComponent(selectedHorseId ?? 'new')}`;
}
export function readRequestDraft(storage: Pick<Storage, 'getItem' | 'removeItem'>, key: string, now = Date.now()): RequestDraft | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const draft = draftSchema.safeParse(JSON.parse(raw));
    if (!draft.success || draft.data.savedAt > now + 60000 || now - draft.data.savedAt > 7 * 86400000) {
      storage.removeItem(key); return null;
    }
    return draft.data;
  } catch { return null; }
}
export function saveRequestDraft(storage: Pick<Storage, 'setItem'>, key: string, draft: RequestDraft) {
  try { storage.setItem(key, JSON.stringify(draftSchema.parse(draft))); return true; } catch { return false; }
}
