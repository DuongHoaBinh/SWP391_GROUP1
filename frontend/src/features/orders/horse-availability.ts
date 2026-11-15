export interface HorseReservationOrder {
  status: string;
  horses?: Array<{ horseId: number | string }>;
}

// UI availability supplements profile flags; the backend still owns reservation validation.
export function getReservedHorseIds(orders: HorseReservationOrder[]) {
  return new Set(orders.filter(order => !['completed', 'cancelled', 'rejected'].includes(order.status))
    .flatMap(order => (order.horses ?? []).map(horse => String(horse.horseId))));
}
