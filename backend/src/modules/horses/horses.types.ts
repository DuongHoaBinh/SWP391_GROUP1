export enum HorseGender {
  MALE = 'male',
  FEMALE = 'female',
}

export const HORSE_MIN_WEIGHT_KG = 150;
export const HORSE_MAX_WEIGHT_KG = 1200;

/**
 * Validate and normalize horse weight input (e.g. "480", "480 kg", "480.5 kg")
 * into a canonical "<number> kg" string within realistic racehorse bounds (150–1200 kg).
 * Returns null if invalid.
 */
export function parseAndNormalizeHorseWeight(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  if (!text) return null;
  const match = /^(\d+(?:\.\d{1,2})?)(?:\s*kg)?$/i.exec(text);
  if (!match) return null;
  const kg = Number(match[1]);
  if (!Number.isFinite(kg) || kg < HORSE_MIN_WEIGHT_KG || kg > HORSE_MAX_WEIGHT_KG) {
    return null;
  }
  const formatted = Number.isInteger(kg) ? String(kg) : String(Number(kg.toFixed(2)));
  return `${formatted} kg`;
}

export enum HorseStatus {
  ACTIVE = 'active',
  IN_TRANSIT = 'in_transit',
  RETIRED = 'retired',
  DECEASED = 'deceased',
}

export interface HorseEntity {
  id: number;
  ownerId: number;
  name: string;
  breed: string | null;
  gender: HorseGender | null;
  age: number | null;
  microchipNo: string | null;
  passportNo: string | null;
  color: string | null;
  weight: string | null;
  medicalStatus: string | null;
  specialRequirements: string | null;
  status: HorseStatus;
  quantity: number;
  photoUrl: string | null;
  createdAt: string;
}
