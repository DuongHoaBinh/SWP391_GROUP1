/** @deprecated Ngừng dùng sau review 11/2026 (bỏ giới tính khỏi hồ sơ ngựa). Giữ để đọc dữ liệu cũ. */
export enum HorseGender {
  MALE = 'male',
  FEMALE = 'female',
  GELDING = 'gelding',
}

export enum HorseTemperament {
  CALM = 'calm',
  NORMAL = 'normal',
  DIFFICULT = 'difficult',
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
  age: number | null;
  microchipNo: string | null;
  passportNo: string | null;
  color: string | null;
  weight: string | null;
  medicalStatus: string | null;
  specialRequirements: string | null;
  /** Cần chuồng riêng (thay cho logic theo giới tính, ví dụ ngựa đực giống) */
  requiresPrivateStall: boolean;
  temperament: HorseTemperament;
  status: HorseStatus;
  quantity: number;
  photoUrl: string | null;
  createdAt: string;
}
