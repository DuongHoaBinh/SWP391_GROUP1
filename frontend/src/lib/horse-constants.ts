export interface HorseOptionItem {
  value: string;
  label: string;
}

/**
 * Standard horse racing coat colors with Vietnamese translations
 * Bảng màu lông ngựa đua tiêu chuẩn kèm giải nghĩa tiếng Việt
 */
export const HORSE_COAT_COLORS: HorseOptionItem[] = [
  { value: 'Bay', label: 'Bay (Nâu đỏ, bờm đen)' },
  { value: 'Chestnut', label: 'Chestnut (Nâu đỏ, màu hạt dẻ)' },
  { value: 'Dark Bay', label: 'Dark Bay (Nâu sẫm)' },
  { value: 'Black', label: 'Black (Đen)' },
  { value: 'Gray / Grey', label: 'Gray / Grey (Xám)' },
  { value: 'Palomino', label: 'Palomino (Vàng kim, bờm trắng)' },
  { value: 'Roan', label: 'Roan (Lông pha trắng)' },
  { value: 'Dun', label: 'Dun (Vàng nâu, thường có vệt sẫm)' },
  { value: 'Buckskin', label: 'Buckskin (Vàng nâu, chân thường sẫm)' },
  { value: 'White', label: 'White (Trắng)' },
];

/**
 * Standard horse medical statuses with Vietnamese translations
 * Tình trạng y tế ngựa tiêu chuẩn kèm phiên dịch tiếng Việt
 */
export const HORSE_MEDICAL_STATUSES: HorseOptionItem[] = [
  { value: 'Healthy', label: 'Healthy (Khỏe mạnh)' },
  { value: 'Monitoring', label: 'Monitoring (Theo dõi)' },
  { value: 'Requires Review', label: 'Requires Review (Cần xem xét)' },
  { value: 'Medical Attention', label: 'Medical Attention (Cần chăm sóc)' },
];

/**
 * Helper to get user-friendly coat color display text
 */
export function formatHorseColor(color?: string | null): string {
  if (!color) return '—';
  const found = HORSE_COAT_COLORS.find(
    (c) => c.value.toLowerCase() === color.trim().toLowerCase()
  );
  if (found) return found.label;
  if (color.toLowerCase() === 'grey' || color.toLowerCase() === 'gray') {
    return 'Gray / Grey (Xám)';
  }
  return color;
}

/**
 * Helper to get user-friendly medical status display text
 */
export function formatHorseMedicalStatus(status?: string | null): string {
  if (!status) return 'Healthy (Khỏe mạnh)';
  const found = HORSE_MEDICAL_STATUSES.find(
    (s) => s.value.toLowerCase() === status.trim().toLowerCase()
  );
  return found ? found.label : status;
}
