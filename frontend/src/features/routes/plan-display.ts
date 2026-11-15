import type { RouteDetail } from './api/routes.api';

export function savedPlanView(route: RouteDetail) {
  return {
    routeName: route.routeName ?? '',
    distanceKm: route.totalDistanceKm ?? 0,
    notes: route.strategicNotes ?? '',
    legs: (route.legs ?? []).map(leg => ({ ...leg })),
    stops: (route.stops ?? []).map(stop => ({ ...stop })),
  };
}
