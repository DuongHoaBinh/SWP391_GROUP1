export interface ConsolidatedShipmentEndpoint {
  shipmentId: number;
  requestCode?: string;
  customerId?: number;
  originLocation: string;
  destinationLocation: string;
}

export interface CorridorStopInput {
  routeStopId?: number;
  sequenceNo?: number;
  stopType: string;
  locationName: string;
  country?: string | null;
  plannedArrival?: Date | string | null;
  plannedDeparture?: Date | string | null;
  status?: string;
  actualArrival?: Date | string | null;
  actualDeparture?: Date | string | null;
  updatedBy?: number | null;
  notes?: string | null;
}

export interface SequencedStopItem {
  sequenceNo: number;
  stopType: 'rest' | 'quarantine' | 'refuel' | 'border_check' | 'transfer_hub' | 'other';
  stopRole: 'pickup' | 'transit' | 'dropoff';
  locationName: string;
  country: string;
  shipmentIds: number[];
  requestCodes: string[];
  plannedArrival?: Date | string | null;
  plannedDeparture?: Date | string | null;
  notes?: string | null;
}

export interface ConsolidatedRoadItinerary {
  canonicalOrigin: string;
  canonicalDestination: string;
  orderedOrigins: Array<{ location: string; shipmentIds: number[]; requestCodes: string[] }>;
  orderedDestinations: Array<{ location: string; shipmentIds: number[]; requestCodes: string[] }>;
  stops: SequencedStopItem[];
  isConsolidatedMultiPoint: boolean;
}

interface CoordEntry {
  keywords: string[];
  coords: [number, number];
  country: string;
  tier?: 1 | 2; // 2 = specific district/hub/station (default), 1 = generic city/country fallback
}

const LOCATION_COORDS: CoordEntry[] = [
  // HCMC metro & South Vietnam (specific districts/cities first)
  { keywords: ['cu chi', 'trang trai cu chi'], coords: [11.0067, 106.5136], country: 'Việt Nam' },
  { keywords: ['hoc mon'], coords: [10.8863, 106.5944], country: 'Việt Nam' },
  { keywords: ['binh chanh'], coords: [10.6873, 106.5938], country: 'Việt Nam' },
  { keywords: ['nha be'], coords: [10.6952, 106.7269], country: 'Việt Nam' },
  { keywords: ['can gio'], coords: [10.4112, 106.9547], country: 'Việt Nam' },
  { keywords: ['thu duc', 'tp thu duc', 'quan 2', 'quan 9', 'linh trung'], coords: [10.8494, 106.7710], country: 'Việt Nam' },
  { keywords: ['binh thanh'], coords: [10.8106, 106.7091], country: 'Việt Nam' },
  { keywords: ['go vap'], coords: [10.8387, 106.6653], country: 'Việt Nam' },
  { keywords: ['phu nhuan'], coords: [10.7992, 106.6803], country: 'Việt Nam' },
  { keywords: ['tan binh', 'tan son nhat', 'sgn'], coords: [10.8185, 106.6588], country: 'Việt Nam' },
  { keywords: ['tan phu'], coords: [10.7901, 106.6281], country: 'Việt Nam' },
  { keywords: ['binh tan'], coords: [10.7652, 106.6038], country: 'Việt Nam' },
  { keywords: ['quan 12'], coords: [10.8671, 106.6413], country: 'Việt Nam' },
  { keywords: ['quan 11'], coords: [10.7629, 106.6501], country: 'Việt Nam' },
  { keywords: ['quan 10'], coords: [10.7745, 106.6679], country: 'Việt Nam' },
  { keywords: ['quan 8'], coords: [10.7241, 106.6286], country: 'Việt Nam' },
  { keywords: ['quan 7', 'phu my hung'], coords: [10.7340, 106.7218], country: 'Việt Nam' },
  { keywords: ['quan 6'], coords: [10.7481, 106.6352], country: 'Việt Nam' },
  { keywords: ['quan 5'], coords: [10.7540, 106.6634], country: 'Việt Nam' },
  { keywords: ['quan 4'], coords: [10.7578, 106.7013], country: 'Việt Nam' },
  { keywords: ['quan 3'], coords: [10.7844, 106.6844], country: 'Việt Nam' },
  { keywords: ['quan 1', 'ben nghe'], coords: [10.7757, 106.7004], country: 'Việt Nam' },
  { keywords: ['ho chi minh', 'tp hcm', 'tphcm', 'sai gon', 'saigon', 'hcmc'], coords: [10.7769, 106.7009], country: 'Việt Nam', tier: 1 },
  { keywords: ['di an'], coords: [10.9069, 106.7694], country: 'Việt Nam' },
  { keywords: ['thuan an'], coords: [10.9167, 106.7000], country: 'Việt Nam' },
  { keywords: ['thu dau mot', 'dai nam', 'binh duong'], coords: [11.0042, 106.6584], country: 'Việt Nam' },
  { keywords: ['bien hoa', 'dong nai', 'long thanh'], coords: [10.9574, 106.8427], country: 'Việt Nam' },
  { keywords: ['ba ria', 'vung tau'], coords: [10.3460, 107.0843], country: 'Việt Nam' },
  { keywords: ['ben luc', 'tan an', 'long an'], coords: [10.5333, 106.4050], country: 'Việt Nam' },
  { keywords: ['tay ninh', 'moc bai'], coords: [11.3100, 106.0983], country: 'Việt Nam' },
  { keywords: ['binh phuoc', 'dong xoai'], coords: [11.5350, 106.8832], country: 'Việt Nam' },
  { keywords: ['cai lay', 'trung luong', 'my tho', 'tien giang'], coords: [10.3600, 106.3600], country: 'Việt Nam' },
  { keywords: ['ben tre'], coords: [10.2434, 106.3756], country: 'Việt Nam' },
  { keywords: ['vinh long'], coords: [10.2537, 105.9722], country: 'Việt Nam' },
  { keywords: ['can tho'], coords: [10.0452, 105.7469], country: 'Việt Nam' },
  { keywords: ['ca mau'], coords: [9.1768, 105.1524], country: 'Việt Nam' },

  // Central coast & highlands
  { keywords: ['phan thiet', 'binh thuan'], coords: [10.9333, 108.1000], country: 'Việt Nam' },
  { keywords: ['phan rang', 'ninh thuan'], coords: [11.5643, 108.9886], country: 'Việt Nam' },
  { keywords: ['cam ranh'], coords: [11.9214, 109.1591], country: 'Việt Nam' },
  { keywords: ['nha trang', 'khanh hoa'], coords: [12.2388, 109.1967], country: 'Việt Nam' },
  { keywords: ['da lat', 'lam dong'], coords: [11.9404, 108.4583], country: 'Việt Nam' },
  { keywords: ['buon ma thuot', 'dak lak'], coords: [12.6667, 108.0500], country: 'Việt Nam' },
  { keywords: ['quy nhon', 'binh dinh'], coords: [13.7830, 109.2197], country: 'Việt Nam' },
  { keywords: ['quang ngai'], coords: [15.1214, 108.8044], country: 'Việt Nam' },
  { keywords: ['hoi an', 'tam ky', 'quang nam'], coords: [15.8801, 108.3380], country: 'Việt Nam' },
  { keywords: ['da nang', 'danang'], coords: [16.0544, 108.2022], country: 'Việt Nam' },
  { keywords: ['hue', 'thua thien hue'], coords: [16.4637, 107.5909], country: 'Việt Nam' },
  { keywords: ['quang tri', 'dong ha', 'lao bao'], coords: [16.7504, 107.1855], country: 'Việt Nam' },
  { keywords: ['quang binh', 'dong hoi'], coords: [17.4689, 106.6223], country: 'Việt Nam' },
  { keywords: ['ha tinh'], coords: [18.3428, 105.9057], country: 'Việt Nam' },
  { keywords: ['tp vinh', 'vinh', 'nghe an'], coords: [18.6796, 105.6813], country: 'Việt Nam' },
  { keywords: ['thanh hoa'], coords: [19.8067, 105.7852], country: 'Việt Nam' },
  { keywords: ['ninh binh'], coords: [20.2506, 105.9745], country: 'Việt Nam' },
  { keywords: ['nam dinh'], coords: [20.4388, 106.1621], country: 'Việt Nam' },
  { keywords: ['phu ly', 'ha nam'], coords: [20.5411, 105.9229], country: 'Việt Nam' },

  // Hanoi metro & North Vietnam
  { keywords: ['thuong tin'], coords: [20.8692, 105.8581], country: 'Việt Nam' },
  { keywords: ['thanh tri'], coords: [20.9410, 105.8562], country: 'Việt Nam' },
  { keywords: ['hoang mai', 'quan hoang mai'], coords: [20.9754, 105.8573], country: 'Việt Nam' },
  { keywords: ['ha dong'], coords: [20.9714, 105.7788], country: 'Việt Nam' },
  { keywords: ['thanh xuan'], coords: [20.9937, 105.8050], country: 'Việt Nam' },
  { keywords: ['hai ba trung'], coords: [21.0063, 105.8572], country: 'Việt Nam' },
  { keywords: ['dong da', 'quan dong da'], coords: [21.0190, 105.8290], country: 'Việt Nam' },
  { keywords: ['hoan kiem'], coords: [21.0285, 105.8542], country: 'Việt Nam' },
  { keywords: ['ba dinh'], coords: [21.0362, 105.8260], country: 'Việt Nam' },
  { keywords: ['cau giay'], coords: [21.0362, 105.7906], country: 'Việt Nam' },
  { keywords: ['nam tu liem', 'my dinh'], coords: [21.0154, 105.7634], country: 'Việt Nam' },
  { keywords: ['bac tu liem'], coords: [21.0734, 105.7662], country: 'Việt Nam' },
  { keywords: ['tay ho'], coords: [21.0695, 105.8239], country: 'Việt Nam' },
  { keywords: ['long bien'], coords: [21.0365, 105.8932], country: 'Việt Nam' },
  { keywords: ['gia lam'], coords: [21.0221, 105.9383], country: 'Việt Nam' },
  { keywords: ['dong anh'], coords: [21.1370, 105.8473], country: 'Việt Nam' },
  { keywords: ['me linh'], coords: [21.1753, 105.7145], country: 'Việt Nam' },
  { keywords: ['soc son', 'noi bai', 'han'], coords: [21.2187, 105.8042], country: 'Việt Nam' },
  { keywords: ['ha noi', 'hanoi'], coords: [21.0285, 105.8542], country: 'Việt Nam', tier: 1 },
  { keywords: ['hung yen'], coords: [20.6464, 106.0511], country: 'Việt Nam' },
  { keywords: ['hai duong'], coords: [20.9373, 106.3146], country: 'Việt Nam' },
  { keywords: ['hai phong'], coords: [20.8449, 106.6881], country: 'Việt Nam' },
  { keywords: ['ha long', 'quang ninh'], coords: [20.9511, 107.0748], country: 'Việt Nam' },
  { keywords: ['bac ninh'], coords: [21.1861, 106.0763], country: 'Việt Nam' },
  { keywords: ['bac giang'], coords: [21.2731, 106.1946], country: 'Việt Nam' },
  { keywords: ['vinh phuc', 'vinh yen'], coords: [21.3089, 105.6049], country: 'Việt Nam' },
  { keywords: ['thai nguyen'], coords: [21.5942, 105.8482], country: 'Việt Nam' },
  { keywords: ['lang son', 'huu nghi', 'dong dang'], coords: [21.8537, 106.7615], country: 'Việt Nam' },
  { keywords: ['lao cai'], coords: [22.4856, 103.9707], country: 'Việt Nam' },

  // Regional / international road & air hubs
  { keywords: ['phnom penh', 'campuchia', 'cambodia'], coords: [11.5564, 104.9282], country: 'Campuchia' },
  { keywords: ['siem reap'], coords: [13.3671, 103.8448], country: 'Campuchia' },
  { keywords: ['vientiane', 'vien chan', 'laos', 'lao'], coords: [17.9757, 102.6331], country: 'Lào' },
  { keywords: ['savannakhet'], coords: [16.5703, 104.7622], country: 'Lào' },
  { keywords: ['bangkok', 'thai lan', 'thailand', 'suvarnabhumi'], coords: [13.7563, 100.5018], country: 'Thái Lan' },
  { keywords: ['kuala lumpur', 'malaysia'], coords: [3.1390, 101.6869], country: 'Malaysia' },
  { keywords: ['singapore', 'changi', 'kranji'], coords: [1.3521, 103.8198], country: 'Singapore' },
  { keywords: ['jakarta', 'indonesia'], coords: [-6.2088, 106.8456], country: 'Indonesia' },
  { keywords: ['nanning', 'quang tay'], coords: [22.8170, 108.3665], country: 'Trung Quốc' },
  { keywords: ['kunming', 'van nam'], coords: [24.8801, 102.8329], country: 'Trung Quốc' },
];

export function normalizeLocationKey(value?: string | null): string {
  if (!value) return '';
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripCountrySuffix(normalized: string): string {
  return normalized.replace(/\b(viet nam|vietnam|vn)\b/g, ' ').replace(/\s+/g, ' ').trim();
}

export function areSameLocations(a?: string | null, b?: string | null): boolean {
  const na = normalizeLocationKey(a);
  const nb = normalizeLocationKey(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const sa = stripCountrySuffix(na);
  const sb = stripCountrySuffix(nb);
  return Boolean(sa && sb && sa === sb);
}

function matchesKeyword(normalizedText: string, kw: string): boolean {
  if (!kw) return false;
  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\s)${escaped}(?:$|\\s)`).test(normalizedText);
}

export function resolveLocationCoords(locationText?: string | null): { coords: [number, number] | null; country: string } {
  const normalized = normalizeLocationKey(locationText);
  if (!normalized) return { coords: null, country: 'Việt Nam' };

  let best: { entry: CoordEntry; score: number } | null = null;
  for (const entry of LOCATION_COORDS) {
    const tier = entry.tier ?? 2;
    for (const kw of entry.keywords) {
      if (matchesKeyword(normalized, kw)) {
        const score = tier * 1000 + kw.length;
        if (!best || score > best.score) {
          best = { entry, score };
        }
      }
    }
  }

  if (best) {
    return { coords: best.entry.coords, country: best.entry.country };
  }

  return { coords: null, country: 'Việt Nam' };
}

export function haversineKm(a: [number, number], b: [number, number]): number {
  const [lat1, lon1] = a;
  const [lat2, lon2] = b;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function averageCoords(points: Array<[number, number]>): [number, number] | null {
  if (points.length === 0) return null;
  const sum = points.reduce(
    (acc, [lat, lng]) => [acc[0] + lat, acc[1] + lng],
    [0, 0] as [number, number],
  );
  return [sum[0] / points.length, sum[1] / points.length];
}

function isGreaterHcmCoords([lat, lng]: [number, number]): boolean {
  return lat >= 10.5 && lat <= 11.2 && lng >= 106.3 && lng <= 107.0;
}

function isGreaterHanoiCoords([lat, lng]: [number, number]): boolean {
  return lat >= 20.75 && lat <= 21.35 && lng >= 105.5 && lng <= 106.1;
}

function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr];
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const sub of permutations(rest)) {
      result.push([arr[i], ...sub]);
    }
  }
  return result;
}

interface LocationGroup {
  location: string;
  shipmentIds: number[];
  requestCodes: string[];
  coords: [number, number] | null;
  country: string;
  originalIndex: number;
}

function groupUniqueLocations(
  items: Array<{ location: string; shipmentId: number; requestCode: string }>,
): LocationGroup[] {
  const groups: LocationGroup[] = [];
  for (const item of items) {
    const clean = String(item.location || '').trim();
    if (!clean) continue;
    const existing = groups.find((g) => areSameLocations(g.location, clean));
    if (existing) {
      if (!existing.shipmentIds.includes(item.shipmentId)) {
        existing.shipmentIds.push(item.shipmentId);
      }
      if (!existing.requestCodes.includes(item.requestCode)) {
        existing.requestCodes.push(item.requestCode);
      }
    } else {
      const resolved = resolveLocationCoords(clean);
      groups.push({
        location: clean,
        shipmentIds: [item.shipmentId],
        requestCodes: [item.requestCode],
        coords: resolved.coords,
        country: resolved.country,
        originalIndex: groups.length,
      });
    }
  }
  return groups;
}

function orderLocationGroups(
  groups: LocationGroup[],
  anchor: [number, number] | null,
  mode: 'towards_anchor' | 'away_from_anchor',
): LocationGroup[] {
  if (groups.length <= 1 || !anchor) return groups;
  const allHaveCoords = groups.every((g) => g.coords !== null);
  if (!allHaveCoords) return groups;

  if (groups.length > 6) {
    return [...groups].sort((a, b) => {
      const da = haversineKm(a.coords!, anchor);
      const db = haversineKm(b.coords!, anchor);
      return mode === 'towards_anchor' ? db - da : da - db;
    });
  }

  let bestOrder = groups;
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestAnchorEdge = mode === 'towards_anchor' ? -1 : Number.POSITIVE_INFINITY;

  for (const perm of permutations(groups)) {
    let total = 0;
    for (let i = 0; i < perm.length - 1; i++) {
      total += haversineKm(perm[i].coords!, perm[i + 1].coords!);
    }
    const anchorEdge =
      mode === 'towards_anchor'
        ? haversineKm(perm[perm.length - 1].coords!, anchor)
        : haversineKm(anchor, perm[0].coords!);
    total += anchorEdge;

    const firstAnchorDist =
      mode === 'towards_anchor'
        ? haversineKm(perm[0].coords!, anchor)
        : haversineKm(anchor, perm[0].coords!);

    const epsilon = 0.05;
    const isStrictlyBetter = total < bestDistance - epsilon;
    const isTieBetter =
      Math.abs(total - bestDistance) <= epsilon &&
      (mode === 'towards_anchor'
        ? firstAnchorDist > bestAnchorEdge
        : firstAnchorDist < bestAnchorEdge);

    if (isStrictlyBetter || isTieBetter) {
      bestDistance = total;
      bestOrder = perm;
      bestAnchorEdge = firstAnchorDist;
    }
  }

  return bestOrder;
}

function resolveAnchorAfterPickups(
  origins: LocationGroup[],
  corridorCoords: Array<[number, number]>,
  destinations: LocationGroup[],
): [number, number] | null {
  if (corridorCoords.length > 0) return corridorCoords[0];

  const originCoords = origins.map((o) => o.coords).filter((c): c is [number, number] => Boolean(c));
  const destCentroid = averageCoords(
    destinations.map((d) => d.coords).filter((c): c is [number, number] => Boolean(c)),
  );
  if (!destCentroid) return null;

  // Metro corridor trunk gateways when no intermediate corridor stop is defined yet:
  // Leaving Greater HCMC heading Central/North exits eastward along QL1A/CT01 toward Dong Nai / Phan Thiet.
  if (originCoords.length > 0 && originCoords.every(isGreaterHcmCoords) && destCentroid[0] >= 11.5) {
    return [10.95, 107.30];
  }
  // Leaving Greater Hanoi heading Central/South exits southward along CT01/QL1A toward Phu Ly.
  if (originCoords.length > 0 && originCoords.every(isGreaterHanoiCoords) && destCentroid[0] <= 20.5) {
    return [20.65, 105.92];
  }

  return destCentroid;
}

function resolveAnchorBeforeDropoffs(
  destinations: LocationGroup[],
  corridorCoords: Array<[number, number]>,
  orderedOrigins: LocationGroup[],
): [number, number] | null {
  if (corridorCoords.length > 0) return corridorCoords[corridorCoords.length - 1];

  const destCoords = destinations.map((d) => d.coords).filter((c): c is [number, number] => Boolean(c));
  const originTail =
    [...orderedOrigins].reverse().find((o) => o.coords)?.coords ||
    averageCoords(orderedOrigins.map((o) => o.coords).filter((c): c is [number, number] => Boolean(c)));
  if (!originTail) return null;

  // Entering Greater Hanoi from South/Central arrives via southern CT01 gateway (Phu Ly).
  if (destCoords.length > 0 && destCoords.every(isGreaterHanoiCoords) && originTail[0] <= 20.5) {
    return [20.65, 105.92];
  }
  // Entering Greater HCMC from North/Central arrives via eastern QL1A/CT01 gateway.
  if (destCoords.length > 0 && destCoords.every(isGreaterHcmCoords) && originTail[0] >= 11.4) {
    return [10.95, 107.30];
  }

  return originTail;
}

function normalizeStopType(raw?: string | null): SequencedStopItem['stopType'] {
  const val = String(raw || '').trim().toLowerCase();
  if (
    val === 'rest' ||
    val === 'quarantine' ||
    val === 'refuel' ||
    val === 'border_check' ||
    val === 'transfer_hub' ||
    val === 'other'
  ) {
    return val;
  }
  return 'rest';
}

export function buildConsolidatedRoadItinerary(params: {
  shipments: ConsolidatedShipmentEndpoint[];
  corridorStops?: CorridorStopInput[];
}): ConsolidatedRoadItinerary {
  const shipments = params.shipments || [];
  const rawCorridorStops = (params.corridorStops || []).filter(
    (s) => String(s.stopType || '').toLowerCase() !== 'transfer_hub',
  );

  // Deduplicate corridor transit stops in chronological sequence
  const corridorStops: CorridorStopInput[] = [];
  for (const s of rawCorridorStops) {
    const cleanName = String(s.locationName || '').trim();
    if (!cleanName) continue;
    if (!corridorStops.some((existing) => areSameLocations(existing.locationName, cleanName))) {
      corridorStops.push({ ...s, locationName: cleanName });
    }
  }

  const originGroups = groupUniqueLocations(
    shipments.map((s) => ({
      location: s.originLocation,
      shipmentId: s.shipmentId,
      requestCode: s.requestCode || `REQ-${String(s.shipmentId).padStart(3, '0')}`,
    })),
  );
  const destGroups = groupUniqueLocations(
    shipments.map((s) => ({
      location: s.destinationLocation,
      shipmentId: s.shipmentId,
      requestCode: s.requestCode || `REQ-${String(s.shipmentId).padStart(3, '0')}`,
    })),
  );

  const corridorCoords = corridorStops
    .map((s) => resolveLocationCoords(s.locationName).coords)
    .filter((c): c is [number, number] => Boolean(c));

  const pickupAnchor = resolveAnchorAfterPickups(originGroups, corridorCoords, destGroups);
  const orderedOrigins = orderLocationGroups(originGroups, pickupAnchor, 'towards_anchor');

  const dropoffAnchor = resolveAnchorBeforeDropoffs(destGroups, corridorCoords, orderedOrigins);
  const orderedDestinations = orderLocationGroups(destGroups, dropoffAnchor, 'away_from_anchor');

  const canonicalOrigin = orderedOrigins[0]?.location || shipments[0]?.originLocation || '';
  const canonicalDestination =
    orderedDestinations[orderedDestinations.length - 1]?.location ||
    shipments[0]?.destinationLocation ||
    '';

  const pickupWaypoints = orderedOrigins.slice(1);
  const dropoffWaypoints = orderedDestinations.slice(0, -1);

  const sequencedStops: SequencedStopItem[] = [];
  let seq = 1;

  for (const pickup of pickupWaypoints) {
    sequencedStops.push({
      sequenceNo: seq++,
      stopType: 'transfer_hub',
      stopRole: 'pickup',
      locationName: pickup.location,
      country: pickup.country,
      shipmentIds: pickup.shipmentIds,
      requestCodes: pickup.requestCodes,
      notes: `Điểm đón ghép chuyến (${pickup.requestCodes.map((c) => `#${c}`).join(', ')})`,
    });
  }

  for (const transit of corridorStops) {
    const resolved = resolveLocationCoords(transit.locationName);
    sequencedStops.push({
      sequenceNo: seq++,
      stopType: normalizeStopType(transit.stopType),
      stopRole: 'transit',
      locationName: transit.locationName,
      country: transit.country || resolved.country || 'Việt Nam',
      shipmentIds: [],
      requestCodes: [],
      plannedArrival: transit.plannedArrival ?? null,
      plannedDeparture: transit.plannedDeparture ?? null,
      notes: transit.notes ?? null,
    });
  }

  for (const dropoff of dropoffWaypoints) {
    sequencedStops.push({
      sequenceNo: seq++,
      stopType: 'transfer_hub',
      stopRole: 'dropoff',
      locationName: dropoff.location,
      country: dropoff.country,
      shipmentIds: dropoff.shipmentIds,
      requestCodes: dropoff.requestCodes,
      notes: `Điểm trả ghép chuyến (${dropoff.requestCodes.map((c) => `#${c}`).join(', ')})`,
    });
  }

  return {
    canonicalOrigin,
    canonicalDestination,
    orderedOrigins: orderedOrigins.map(({ location, shipmentIds, requestCodes }) => ({
      location,
      shipmentIds,
      requestCodes,
    })),
    orderedDestinations: orderedDestinations.map(({ location, shipmentIds, requestCodes }) => ({
      location,
      shipmentIds,
      requestCodes,
    })),
    stops: sequencedStops,
    isConsolidatedMultiPoint: pickupWaypoints.length > 0 || dropoffWaypoints.length > 0,
  };
}
