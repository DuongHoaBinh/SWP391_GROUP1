export enum HorseGender {
  MALE = 'male',
  FEMALE = 'female',
  GELDING = 'gelding',
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
  dateOfBirth: string | null;
  age: number | null;
  microchipNo: string | null;
  passportNo: string | null;
  status: HorseStatus;
  createdAt: string;
}
