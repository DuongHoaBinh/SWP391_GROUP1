/**
 * Bộ lập tuyến đa phương thức (hàm thuần, không I/O) trên mạng lưới vận tải ĐNA + Trung Quốc.
 *
 * Nguyên tắc nghiệp vụ:
 * - Đường bộ: đồ thị gồm điểm đi/đến, trạm nghỉ thú y và cửa khẩu nhận động vật sống. Hai nút chỉ nối nhau
 *   khi cùng khối đất liền, có chung quốc gia (cửa khẩu thuộc 2 quốc gia) và cách nhau ≤ MAX_HOP_KM, nên tuyến
 *   bám theo chuỗi trạm dọc hành lang thật (QL1A, AH1, AH2, R3A...). Chuyến nội địa không được đi nhờ nước khác.
 *   Trạm dừng nghỉ được chọn sao cho mỗi đoạn lái ≤ maxDriveHoursBeforeRest; qua cửa khẩu coi như đã nghỉ.
 * - Đường biển, tàu chuyên dụng (vessel-only, không hỗ trợ phà RoRo): xe ra cảng quốc tế cùng nước → hải trình
 *   theo bảng sea_route (có thể ghé cảng trung chuyển, phạt 12h/lần ghé, tối đa 168h) → xe từ cảng đến điểm giao.
 * - Hàng không: sân bay có ram dốc ngựa cùng nước với điểm đi/đến (chuyến quốc tế cần trạm cách ly).
 *   Sân bay 'regional' chỉ bay thẳng tới 'hub'; còn lại nối chuyến qua hub gần nhất (nội địa: qua sân bay lớn trong nước).
 */
import {
  LatLng,
  NetworkAirport,
  NetworkBorderCrossing,
  NetworkSeaLane,
  NetworkSeaport,
  PlanRouteInput,
  PlannedEndpoint,
  PlannedLeg,
  PlannedRoute,
  PlannedStop,
  PlannedWaypoint,
  RouteMessage,
  RoutePlanningError,
  RouteSuggestion,
  SeaMode,
  TransportNetwork,
} from './route-network.types';
import { countryName, haversine, landmassOf, toCountryCode } from './route-network.geo';

export const ROUTE_NETWORK_DEFAULTS = {
  maxDriveHoursBeforeRest: 8,
  roadSpeedKmh: 50,
  /** Hệ số quy đổi đường chim bay → đường bộ */
  roadFactor: 1.3,
  /** Khoảng cách chim bay tối đa giữa 2 nút liền kề trên hành lang đường bộ */
  maxHopKm: 420,
  restStopHours: 1,
  /** Phạt mỗi lần tàu ghé cảng trung chuyển */
  portCallPenaltyHours: 12,
  flightGroundHours: 2,
  transitLayoverHours: 3,
  flightSpeedKmh: 750,
  /** Thời gian hành trình biển tối đa cho ngựa đua sống (7 ngày = 168h) */
  maxVesselHours: 168,
  /** Bán kính tìm cảng/sân bay quanh điểm đi/đến (chim bay) */
  hubSearchKm: 900,
};

type Opts = typeof ROUTE_NETWORK_DEFAULTS;

interface Endpoint {
  name: string;
  coords: LatLng;
  cc: string;
  landmass: string;
}

interface RoadNode {
  key: string;
  kind: 'origin' | 'destination' | 'gate' | 'rest' | 'hub';
  name: string;
  code: string | null;
  coords: LatLng;
  countries: string[];
  landmass: string;
  clearanceHours: number;
  restCapable: boolean;
  stopType?: 'rest' | 'quarantine';
  hasVet?: boolean;
  gate?: NetworkBorderCrossing;
}

interface RoadEdge {
  from: RoadNode;
  to: RoadNode;
  kind: 'road';
  km: number;
  hours: number;
}

interface RoadPath {
  nodes: RoadNode[];
  edges: RoadEdge[];
  hours: number;
}

// ---------------------------------------------------------------------------------------------
// Tiện ích
// ---------------------------------------------------------------------------------------------

const round1 = (v: number) => Math.round(v * 10) / 10;
const msg = (code: string, vi: string, en: string): RouteMessage => ({ code, vi, en });

function shareCountry(a: string[], b: string[]): boolean {
  return a.some((c) => c && b.includes(c));
}

/** Suy ra quốc gia khi client không gửi: lấy quốc gia của nút mạng lưới gần nhất (≤ 250 km). */
export function inferCountryCode(net: TransportNetwork, coords: LatLng): string {
  let best = '';
  let bestKm = 250;
  const consider = (cc: string, lat: number, lng: number) => {
    if (!cc) return;
    const km = haversine(coords, [lat, lng]);
    if (km < bestKm) {
      bestKm = km;
      best = cc;
    }
  };
  net.restStops.forEach((s) => consider(s.countryCode, s.lat, s.lng));
  net.airports.forEach((a) => consider(a.countryCode, a.lat, a.lng));
  net.seaports.forEach((p) => consider(p.countryCode, p.lat, p.lng));
  return best;
}

function toEndpoint(net: TransportNetwork, input: PlanRouteInput['origin'], fallbackName: string): Endpoint {
  const coords: LatLng = [Number(input.lat), Number(input.lng)];
  const cc = toCountryCode(input.country, input.countryCode) || inferCountryCode(net, coords);
  return { name: (input.label || '').trim() || fallbackName, coords, cc, landmass: landmassOf(coords) };
}

// ---------------------------------------------------------------------------------------------
// Đồ thị đường bộ
// ---------------------------------------------------------------------------------------------

function endpointNode(ep: Endpoint, kind: 'origin' | 'destination' | 'hub', code: string | null = null): RoadNode {
  return {
    key: `${kind}:${code ?? ep.name}`,
    kind,
    name: ep.name,
    code,
    coords: ep.coords,
    countries: ep.cc ? [ep.cc] : [],
    landmass: ep.landmass,
    clearanceHours: 0,
    restCapable: false,
  };
}

function buildRoadNodes(net: TransportNetwork, allowed?: Set<string>): RoadNode[] {
  const ok = (countries: string[]) => !allowed || countries.every((c) => allowed.has(c));
  const nodes: RoadNode[] = [];
  for (const g of net.borderCrossings) {
    if (!g.allowsLiveAnimals) continue;
    const countries = [g.countryA, g.countryB];
    if (!ok(countries)) continue;
    const coords: LatLng = [g.lat, g.lng];
    nodes.push({
      key: `gate:${g.code}`,
      kind: 'gate',
      name: g.name,
      code: g.code,
      coords,
      countries,
      landmass: landmassOf(coords),
      clearanceHours: g.clearanceHours,
      restCapable: false,
      gate: g,
    });
  }
  for (const s of net.restStops) {
    if (!s.hasStalls || !(s.stopType === 'rest' || s.stopType === 'quarantine') || !s.countryCode) continue;
    if (!ok([s.countryCode])) continue;
    const coords: LatLng = [s.lat, s.lng];
    nodes.push({
      key: `rest:${s.code ?? s.id}`,
      kind: 'rest',
      name: s.name,
      code: s.code,
      coords,
      countries: [s.countryCode],
      landmass: landmassOf(coords),
      clearanceHours: 0,
      restCapable: true,
      stopType: s.stopType,
      hasVet: s.hasVeterinarian,
    });
  }
  return nodes;
}

/**
 * Dijkstra trên đồ thị đường bộ.
 */
function findRoadPath(
  net: TransportNetwork,
  from: RoadNode,
  to: RoadNode,
  opts: Opts,
  config: { allowed?: Set<string> } = {},
): RoadPath | null {
  const nodes = [from, to, ...buildRoadNodes(net, config.allowed)];

  const roadHours = (km: number) => km / opts.roadSpeedKmh;

  // Điểm đầu/cuối ở xa mọi trạm (> maxHop): cho phép nối tới 3 nút gần nhất để không bị cô lập
  const fallbackNeighbors = new Map<string, Set<string>>();
  for (const ep of [from, to]) {
    const candidates = nodes
      .filter((n) => n !== ep && n.landmass === ep.landmass && shareCountry(n.countries, ep.countries))
      .map((n) => ({ n, km: haversine(ep.coords, n.coords) }))
      .sort((a, b) => a.km - b.km);
    if (candidates.length && candidates[0].km > opts.maxHopKm) {
      fallbackNeighbors.set(ep.key, new Set(candidates.slice(0, 3).map((c) => c.n.key)));
    }
  }

  const neighbors = (u: RoadNode): RoadEdge[] => {
    const out: RoadEdge[] = [];
    for (const v of nodes) {
      if (v === u) continue;
      if (v.landmass !== u.landmass || !shareCountry(u.countries, v.countries)) continue;
      const hav = haversine(u.coords, v.coords);
      const isDirectEndpoints = (u === from && v === to) || (u === to && v === from);
      const fallback = fallbackNeighbors.get(u.key)?.has(v.key) || fallbackNeighbors.get(v.key)?.has(u.key);
      let km = hav * opts.roadFactor;
      if (hav > opts.maxHopKm) {
        if (isDirectEndpoints) km *= 1.15; // vẫn cho đi thẳng nhưng ưu tiên chuỗi trạm hành lang
        else if (!fallback) continue;
      }
      out.push({ from: u, to: v, kind: 'road', km, hours: roadHours(km) + (v.kind === 'gate' ? v.clearanceHours : 0) });
    }
    return out;
  };

  const dist = new Map<string, number>();
  const prev = new Map<string, { node: RoadNode; edge: RoadEdge }>();
  const open = new Map<string, RoadNode>();
  dist.set(from.key, 0);
  open.set(from.key, from);
  let reached: RoadNode | null = null;

  while (open.size) {
    let cur: RoadNode | null = null;
    let best = Infinity;
    for (const n of open.values()) {
      const d = dist.get(n.key)!;
      if (d < best) {
        best = d;
        cur = n;
      }
    }
    if (!cur) break;
    open.delete(cur.key);
    if (cur === to) {
      reached = cur;
      break;
    }
    for (const e of neighbors(cur)) {
      const nk = e.to.key;
      const nd = best + e.hours;
      if (nd < (dist.get(nk) ?? Infinity)) {
        dist.set(nk, nd);
        prev.set(nk, { node: cur, edge: e });
        open.set(nk, e.to);
      }
    }
  }
  if (!reached) return null;

  const edges: RoadEdge[] = [];
  let k = reached.key;
  while (prev.has(k)) {
    const p = prev.get(k)!;
    edges.unshift(p.edge);
    k = p.node.key;
  }
  const pathNodes = [from, ...edges.map((e) => e.to)];
  return { nodes: pathNodes, edges, hours: dist.get(reached.key)! };
}

// ---------------------------------------------------------------------------------------------
// Ghép đường đi thành các chặng + chọn trạm dừng nghỉ
// ---------------------------------------------------------------------------------------------

interface LegBuild {
  legs: PlannedLeg[];
  gates: RoadNode[];
  warnings: RouteMessage[];
}

const ROAD_LABEL = { vi: 'Xe chuyên dụng chở ngựa', en: 'Equine transport truck' };

function roadPathToLegs(path: RoadPath, opts: Opts, firstSeq: number): LegBuild {
  const legs: PlannedLeg[] = [];
  const gates: RoadNode[] = [];
  const warnings: RouteMessage[] = [];
  const maxLegKm = opts.maxDriveHoursBeforeRest * opts.roadSpeedKmh;
  let seq = firstSeq;

  let legNodes: RoadNode[] = [path.nodes[0]];
  let legEdges: RoadEdge[] = [];

  const closeRoadLeg = () => {
    if (!legEdges.length) return;
    const first = legNodes[0];
    const last = legNodes[legNodes.length - 1];
    const km = legEdges.reduce((s, e) => s + e.km, 0);
    // Chọn trạm dừng: đi tiếp đoạn sau sẽ vượt giới hạn lái → dừng tại trạm hiện tại
    const stops: PlannedStop[] = [];
    let acc = 0;
    for (let i = 0; i < legEdges.length; i++) {
      const seg = legEdges[i].km;
      if (seg > maxLegKm) {
        warnings.push(
          msg(
            'REST_STOP_GAP',
            `Đoạn ${legEdges[i].from.name} → ${legEdges[i].to.name} dài ~${Math.round(seg)} km, chưa có trạm nghỉ đối tác ở giữa; cần bố trí điểm dừng cho ngựa uống nước.`,
            `Segment ${legEdges[i].from.name} → ${legEdges[i].to.name} is ~${Math.round(seg)} km without a partner rest station; plan a watering stop.`,
          ),
        );
      }
      acc += seg;
      const node = legEdges[i].to;
      const nextSeg = legEdges[i + 1]?.km ?? 0;
      if (i < legEdges.length - 1 && node.restCapable && acc + nextSeg > maxLegKm) {
        stops.push({
          code: node.code,
          name: node.name,
          type: node.stopType === 'quarantine' ? 'quarantine' : 'rest',
          coords: node.coords,
          countryCode: node.countries[0] ?? '',
          hasVeterinarian: Boolean(node.hasVet),
        });
        acc = 0;
      }
    }
    const endsAtGate = last.kind === 'gate';
    const clearance = endsAtGate ? last.clearanceHours : 0;
    const hours = km / opts.roadSpeedKmh + stops.length * opts.restStopHours + clearance;
    const countries = Array.from(new Set(legNodes.flatMap((n) => (n.kind === 'gate' ? [] : n.countries)).filter(Boolean)));
    if (!countries.length && first.countries[0]) countries.push(first.countries[0]);
    const stopText = stops.length ? ` Dừng nghỉ tại ${stops.length} trạm thú y.` : '';
    const stopTextEn = stops.length ? ` ${stops.length} veterinary rest stop(s).` : '';
    legs.push({
      sequenceNo: seq++,
      type: 'road',
      fromName: first.name,
      toName: last.name,
      fromCode: first.code,
      toCode: last.code,
      fromCoords: first.coords,
      toCoords: last.coords,
      distanceKm: Math.round(km),
      durationHours: round1(hours),
      countryCodes: countries,
      geometry: legNodes.map((n) => n.coords),
      stops,
      borderCrossingCount: endsAtGate ? 1 : 0,
      vehicleLabelVi: ROAD_LABEL.vi,
      vehicleLabelEn: ROAD_LABEL.en,
      noteVi: `Chặng đường bộ trong ${countries.map((c) => countryName(c)).join(', ') || 'khu vực'}.${stopText}${endsAtGate ? ` Thông quan & kiểm dịch tại cửa khẩu (~${clearance}h).` : ''}`,
      noteEn: `Road leg within ${countries.map((c) => countryName(c, 'en')).join(', ') || 'the region'}.${stopTextEn}${endsAtGate ? ` Customs & veterinary clearance at the border (~${clearance}h).` : ''}`,
    });
    if (endsAtGate) gates.push(last);
  };

  for (const edge of path.edges) {
    legEdges.push(edge);
    legNodes.push(edge.to);
    if (edge.to.kind === 'gate') {
      closeRoadLeg();
      legNodes = [edge.to];
      legEdges = [];
    }
  }
  closeRoadLeg();
  return { legs, gates, warnings };
}

// ---------------------------------------------------------------------------------------------
// Lập tuyến theo từng phương thức
// ---------------------------------------------------------------------------------------------

interface PartialPlan {
  legs: PlannedLeg[];
  warnings: RouteMessage[];
  notices: RouteMessage[];
  transitStops: number;
}

function roadSegment(
  net: TransportNetwork,
  from: RoadNode,
  to: RoadNode,
  opts: Opts,
  seq: number,
  config: { allowed?: Set<string> } = {},
): LegBuild | null {
  if (haversine(from.coords, to.coords) < 1.5) return { legs: [], gates: [], warnings: [] };
  const path = findRoadPath(net, from, to, opts, config);
  if (!path) return null;
  return roadPathToLegs(path, opts, seq);
}

function planRoad(net: TransportNetwork, o: Endpoint, d: Endpoint, opts: Opts): PartialPlan {
  const domestic = Boolean(o.cc) && o.cc === d.cc;
  const built = roadSegment(net, endpointNode(o, 'origin'), endpointNode(d, 'destination'), opts, 1, {
    allowed: domestic ? new Set([o.cc]) : undefined,
  });
  if (!built) {
    if (o.landmass !== d.landmass) {
      throw new RoutePlanningError(
        'ROAD_DIFFERENT_LANDMASS',
        'Điểm đi và điểm đến không cùng khối đất liền (cách biển), xe chở ngựa không thể chạy thẳng. Hãy chọn Đường thủy (tàu biển chuyên dụng) hoặc Hàng không.',
        'Origin and destination are separated by sea; a horse truck cannot drive there. Choose Sea (dedicated vessel) or Air.',
      );
    }
    throw new RoutePlanningError(
      'ROAD_NO_CORRIDOR',
      'Chưa có hành lang đường bộ/cửa khẩu nhận động vật sống nối hai địa điểm này. Hãy chọn Hàng không hoặc Đường thủy.',
      'No road corridor or live-animal border crossing connects these locations. Choose Air or Sea.',
    );
  }
  return { legs: built.legs, warnings: built.warnings, notices: [], transitStops: 0 };
}

function hubNode(name: string, code: string, coords: LatLng, cc: string): RoadNode {
  return {
    key: `hub:${code}`,
    kind: 'hub',
    name,
    code,
    coords,
    countries: [cc],
    landmass: landmassOf(coords),
    clearanceHours: 0,
    restCapable: false,
  };
}

function selectAirport(net: TransportNetwork, ep: Endpoint, international: boolean, opts: Opts): NetworkAirport | null {
  const candidates = net.airports
    .filter((a) => a.hasEquineRamp && a.countryCode === ep.cc && (!international || a.hasQuarantine))
    .filter((a) => landmassOf([a.lat, a.lng]) === ep.landmass)
    .map((a) => ({ a, km: haversine(ep.coords, [a.lat, a.lng]) }))
    .filter((c) => c.km <= opts.hubSearchKm * 1.5)
    .sort((x, y) => x.km - y.km);
  return candidates[0]?.a ?? null;
}

function flightLeg(seq: number, from: NetworkAirport, to: NetworkAirport, opts: Opts, isConnection: boolean, transitVia: boolean): PlannedLeg {
  const km = Math.max(150, Math.round(haversine([from.lat, from.lng], [to.lat, to.lng]) * 1.05));
  const hours = km / opts.flightSpeedKmh + opts.flightGroundHours + (isConnection ? opts.transitLayoverHours : 0);
  return {
    sequenceNo: seq,
    type: 'air',
    fromName: from.name,
    toName: to.name,
    fromCode: from.code,
    toCode: to.code,
    fromCoords: [from.lat, from.lng],
    toCoords: [to.lat, to.lng],
    distanceKm: km,
    durationHours: round1(hours),
    countryCodes: Array.from(new Set([from.countryCode, to.countryCode])),
    geometry: [
      [from.lat, from.lng],
      [to.lat, to.lng],
    ],
    stops: [],
    borderCrossingCount: 0,
    vehicleLabelVi: isConnection ? 'Chuyến bay nối chuyến' : 'Chuyến bay chở ngựa',
    vehicleLabelEn: isConnection ? 'Connecting equine flight' : 'Equine cargo flight',
    noteVi: isConnection
      ? `Nối chuyến tại ${from.code}: ngựa ở khu chờ có thú y giám sát (~${opts.transitLayoverHours}h) rồi bay tiếp tới ${to.code}.`
      : `Ngựa xếp vào chuồng bay (jet stall) ${from.code} → ${to.code}${transitVia ? ', tới sân bay trung chuyển' : ''}.`,
    noteEn: isConnection
      ? `Connection at ${from.code}: horses wait in a vet-supervised holding area (~${opts.transitLayoverHours}h), then fly on to ${to.code}.`
      : `Horses loaded into jet stalls ${from.code} → ${to.code}${transitVia ? ' (to the transit hub)' : ''}.`,
  };
}

function planAir(net: TransportNetwork, o: Endpoint, d: Endpoint, opts: Opts): PartialPlan | 'same_hub' {
  const international = o.cc !== d.cc;
  const dep = selectAirport(net, o, international, opts);
  const arr = selectAirport(net, d, international, opts);
  if (!dep || !arr) {
    const side = !dep ? o : d;
    throw new RoutePlanningError(
      'AIR_NO_AIRPORT',
      `Không có sân bay nhận ngựa${international ? ' (có trạm cách ly kiểm dịch)' : ''} gần ${side.name} trong cùng quốc gia. Hãy chọn Đường bộ hoặc Đường thủy.`,
      `No horse-capable airport${international ? ' with a quarantine facility' : ''} near ${side.name} in the same country. Choose Road or Sea.`,
    );
  }
  if (dep.id === arr.id) return 'same_hub';

  const legs: PlannedLeg[] = [];
  const warnings: RouteMessage[] = [];
  const notices: RouteMessage[] = [];
  let seq = 1;
  const domesticAllowed = (cc: string) => (cc ? new Set([cc]) : undefined);

  const toAirport = roadSegment(net, endpointNode(o, 'origin'), hubNode(dep.name, dep.code, [dep.lat, dep.lng], dep.countryCode), opts, seq, {
    allowed: domesticAllowed(o.cc),
  });
  if (toAirport) {
    legs.push(...toAirport.legs);
    warnings.push(...toAirport.warnings);
    seq += toAirport.legs.length;
  }

  // Nội địa bay thẳng. Quốc tế: sân bay regional chỉ bay thẳng tới hub, còn lại nối chuyến qua hub gần nhất
  const directOk =
    !international || dep.airRole === 'hub' || arr.airRole === 'hub' || (dep.airRole !== 'regional' && arr.airRole !== 'regional');
  let transitStops = 0;
  if (directOk) {
    legs.push(flightLeg(seq++, dep, arr, opts, false, false));
  } else {
    const pool = net.airports.filter((a) => a.id !== dep.id && a.id !== arr.id && a.hasEquineRamp && a.airRole === 'hub');
    const hub = pool
      .map((h) => ({ h, km: haversine([dep.lat, dep.lng], [h.lat, h.lng]) + haversine([h.lat, h.lng], [arr.lat, arr.lng]) }))
      .sort((a, b) => a.km - b.km)[0]?.h;
    if (!hub) {
      legs.push(flightLeg(seq++, dep, arr, opts, false, false));
      warnings.push(msg('AIR_NO_TRANSIT_HUB', 'Không tìm thấy sân bay trung chuyển phù hợp; tạm tính bay thẳng.', 'No suitable transit hub found; estimating a direct flight.'));
    } else {
      legs.push(flightLeg(seq++, dep, hub, opts, false, true));
      legs.push(flightLeg(seq++, hub, arr, opts, true, false));
      transitStops = 1;
      notices.push(
        msg(
          'AIR_TRANSIT',
          `${dep.code} và ${arr.code} chưa có chuyến bay chở ngựa thẳng; nối chuyến qua ${hub.code} (${hub.city}).`,
          `No direct equine flight between ${dep.code} and ${arr.code}; connecting via ${hub.code} (${hub.city}).`,
        ),
      );
    }
  }

  const fromAirport = roadSegment(net, hubNode(arr.name, arr.code, [arr.lat, arr.lng], arr.countryCode), endpointNode(d, 'destination'), opts, seq, {
    allowed: domesticAllowed(d.cc),
  });
  if (fromAirport) {
    legs.push(...fromAirport.legs);
    warnings.push(...fromAirport.warnings);
  }
  return { legs, warnings, notices, transitStops };
}

function seaportCandidates(net: TransportNetwork, ep: Endpoint, international: boolean, opts: Opts): NetworkSeaport[] {
  return net.seaports
    .filter((p) => p.supportsVessel && p.countryCode === ep.cc && (!international || (p.isInternational && p.hasQuarantine)))
    .filter((p) => landmassOf([p.lat, p.lng]) === ep.landmass)
    .map((p) => ({ p, km: haversine(ep.coords, [p.lat, p.lng]) }))
    .filter((c) => c.km <= opts.hubSearchKm)
    .sort((a, b) => a.km - b.km)
    .slice(0, 3)
    .map((c) => c.p);
}

function planVessel(net: TransportNetwork, o: Endpoint, d: Endpoint, opts: Opts): PartialPlan | 'same_hub' {
  const international = o.cc !== d.cc;
  const depPorts = seaportCandidates(net, o, international, opts);
  const arrPorts = seaportCandidates(net, d, international, opts);
  if (!depPorts.length || !arrPorts.length) {
    const side = !depPorts.length ? o : d;
    throw new RoutePlanningError(
      'SEA_NO_PORT',
      `Không có cảng biển tiếp nhận tàu chở ngựa${international ? ' (có kiểm dịch quốc tế)' : ''} gần ${side.name}. Hãy chọn Đường bộ hoặc Hàng không.`,
      `No seaport handling livestock vessels${international ? ' with international quarantine' : ''} near ${side.name}. Choose Road or Air.`,
    );
  }
  const est = (a: LatLng, b: LatLng) => (haversine(a, b) * opts.roadFactor) / opts.roadSpeedKmh;
  const vesselLanes = net.seaLanes.filter((l) => l.seaMode === 'vessel');
  const portById = new Map(net.seaports.map((p) => [p.id, p]));

  // Dijkstra đa nguồn trên mạng tuyến biển; mỗi lần ghé cảng trung chuyển bị phạt thời gian
  const dist = new Map<number, number>();
  const prev = new Map<number, { lane: NetworkSeaLane; from: number; reversed: boolean }>();
  const startOf = new Map<number, number>();
  const open = new Set<number>();
  for (const p of depPorts) {
    dist.set(p.id, est(o.coords, [p.lat, p.lng]));
    startOf.set(p.id, p.id);
    open.add(p.id);
  }
  while (open.size) {
    let cur = -1;
    let best = Infinity;
    for (const id of open) {
      const v = dist.get(id)!;
      if (v < best) {
        best = v;
        cur = id;
      }
    }
    open.delete(cur);
    const isStart = depPorts.some((p) => p.id === cur);
    for (const lane of vesselLanes) {
      const forward = lane.fromPortId === cur;
      const backward = lane.toPortId === cur;
      if (!forward && !backward) continue;
      const next = forward ? lane.toPortId : lane.fromPortId;
      if (!portById.has(next)) continue;
      const nd = best + lane.typicalHours + (isStart ? 0 : opts.portCallPenaltyHours);
      if (nd < (dist.get(next) ?? Infinity)) {
        dist.set(next, nd);
        prev.set(next, { lane, from: cur, reversed: !forward });
        startOf.set(next, startOf.get(cur)!);
        open.add(next);
      }
    }
  }

  let bestArr: NetworkSeaport | null = null;
  let bestTotal = Infinity;
  for (const p of arrPorts) {
    const base = dist.get(p.id);
    if (base === undefined) continue;
    const total = base + est([p.lat, p.lng], d.coords);
    if (total < bestTotal) {
      bestTotal = total;
      bestArr = p;
    }
  }
  if (!bestArr) {
    throw new RoutePlanningError(
      'SEA_NO_LANE',
      'Chưa có tuyến tàu biển chở ngựa nối các cảng gần điểm đi và điểm đến. Hãy chọn Hàng không hoặc Đường bộ.',
      'No livestock vessel lane connects ports near the origin and destination. Choose Air or Road.',
    );
  }
  const depId = startOf.get(bestArr.id)!;
  if (depId === bestArr.id) return 'same_hub';
  const dep = portById.get(depId)!;

  const hops: Array<{ lane: NetworkSeaLane; from: NetworkSeaport; to: NetworkSeaport; reversed: boolean }> = [];
  let cursor = bestArr.id;
  while (cursor !== depId) {
    const p = prev.get(cursor)!;
    hops.unshift({ lane: p.lane, from: portById.get(p.from)!, to: portById.get(cursor)!, reversed: p.reversed });
    cursor = p.from;
  }

  const totalSeaHours = hops.reduce(
    (sum, h, idx) => sum + h.lane.typicalHours + (idx > 0 ? opts.portCallPenaltyHours : 0),
    0,
  );
  if (totalSeaHours > opts.maxVesselHours) {
    throw new RoutePlanningError(
      'SEA_DURATION_EXCEEDED',
      `Hành trình tàu biển dự kiến ~${Math.round(totalSeaHours)}h vượt giới hạn phúc lợi ngựa đua sống (${opts.maxVesselHours}h / 7 ngày). Vui lòng chọn Hàng không.`,
      `Estimated sea voyage (~${Math.round(totalSeaHours)}h) exceeds the live thoroughbred welfare limit (${opts.maxVesselHours}h / 7 days). Please choose Air.`,
    );
  }

  const legs: PlannedLeg[] = [];
  const warnings: RouteMessage[] = [];
  const notices: RouteMessage[] = [];
  let seq = 1;
  const toPort = roadSegment(net, endpointNode(o, 'origin'), hubNode(dep.name, dep.code, [dep.lat, dep.lng], dep.countryCode), opts, seq, {
    allowed: o.cc ? new Set([o.cc]) : undefined,
  });
  if (toPort) {
    legs.push(...toPort.legs);
    warnings.push(...toPort.warnings);
    seq += toPort.legs.length;
  }
  hops.forEach((h, idx) => {
    const via = h.reversed ? [...h.lane.viaPoints].reverse() : h.lane.viaPoints;
    const isTransship = idx > 0;
    legs.push({
      sequenceNo: seq++,
      type: 'sea',
      seaMode: 'vessel',
      fromName: h.from.name,
      toName: h.to.name,
      fromCode: h.from.code,
      toCode: h.to.code,
      fromCoords: [h.from.lat, h.from.lng],
      toCoords: [h.to.lat, h.to.lng],
      distanceKm: Math.round(h.lane.distanceKm),
      durationHours: round1(h.lane.typicalHours + (isTransship ? opts.portCallPenaltyHours : 0)),
      countryCodes: Array.from(new Set([h.from.countryCode, h.to.countryCode])),
      geometry: [[h.from.lat, h.from.lng], ...via, [h.to.lat, h.to.lng]],
      stops: [],
      borderCrossingCount: 0,
      vehicleLabelVi: 'Tàu biển chuyên dụng',
      vehicleLabelEn: 'Dedicated livestock vessel',
      noteVi: `${h.lane.notes ?? 'Hải trình'}${isTransship ? ' – ghé cảng trung chuyển, ngựa ở lại trên tàu' : ''}. Ngựa ở ô chuồng cố định, thú y theo dõi mỗi 6h.`,
      noteEn: `${h.lane.notes ?? 'Sea voyage'}${isTransship ? ' – port call, horses stay on board' : ''}. Horses in fixed pens, vet checks every 6h.`,
    });
  });
  if (hops.length > 1) {
    notices.push(
      msg(
        'SEA_PORT_CALL',
        `Chưa có tuyến tàu thẳng; tàu ghé ${hops.length - 1} cảng trung chuyển (${hops.slice(1).map((h) => h.from.code).join(', ')}).`,
        `No direct sailing; the vessel calls at ${hops.length - 1} intermediate port(s) (${hops.slice(1).map((h) => h.from.code).join(', ')}).`,
      ),
    );
  }
  const fromPort = roadSegment(net, hubNode(bestArr.name, bestArr.code, [bestArr.lat, bestArr.lng], bestArr.countryCode), endpointNode(d, 'destination'), opts, seq, {
    allowed: d.cc ? new Set([d.cc]) : undefined,
  });
  if (fromPort) {
    legs.push(...fromPort.legs);
    warnings.push(...fromPort.warnings);
  }
  notices.push(
    msg(
      'SEA_VESSEL_HEALTH',
      'Tàu biển rẻ hơn nhưng lâu hơn và rủi ro sức khỏe cao hơn (say sóng, mất nước). Ngựa thi đấu nên đi hàng không.',
      'Sea freight is cheaper but slower with higher health risks (motion stress, dehydration). Competition horses should fly.',
    ),
  );
  return { legs, warnings, notices, transitStops: Math.max(0, hops.length - 1) };
}

// ---------------------------------------------------------------------------------------------
// Ghép kết quả
// ---------------------------------------------------------------------------------------------

function buildWaypoints(legs: PlannedLeg[], o: Endpoint, d: Endpoint, net: TransportNetwork): PlannedWaypoint[] {
  const gateByCode = new Map(net.borderCrossings.map((g) => [g.code, g]));
  const airportCodes = new Set(net.airports.map((a) => a.code));
  const portCodes = new Set(net.seaports.map((p) => p.code));
  const wps: PlannedWaypoint[] = [];
  const push = (wp: PlannedWaypoint) => {
    const last = wps[wps.length - 1];
    if (last && haversine(last.coords, wp.coords) < 0.5 && last.type === wp.type) return;
    wps.push(wp);
  };
  const domestic = o.cc === d.cc;

  push({
    code: null,
    name: o.name,
    type: 'origin',
    coords: o.coords,
    countryCode: o.cc,
    labelVi: 'Điểm xuất phát',
    labelEn: 'Origin',
    detailsVi: domestic
      ? 'Kiểm tra thể trạng, đối chiếu microchip và sổ tiêm chủng trước khi lên xe.'
      : 'Kiểm tra hộ chiếu ngựa (FEI/Passport), microchip và giấy chứng nhận kiểm dịch xuất khẩu.',
    detailsEn: domestic
      ? 'Fitness check, microchip and vaccination record verified before loading.'
      : 'Horse passport, microchip and export health certificate verified.',
  });

  legs.forEach((leg, idx) => {
    for (const s of leg.stops) {
      push({
        code: s.code,
        name: s.name,
        type: 'rest',
        coords: s.coords,
        countryCode: s.countryCode,
        labelVi: s.type === 'quarantine' ? 'Trạm kiểm dịch & nghỉ' : 'Trạm nghỉ thú y',
        labelEn: s.type === 'quarantine' ? 'Quarantine & rest station' : 'Veterinary rest stop',
        detailsVi: `Dừng ~1h: cho ngựa uống nước điện giải, kiểm tra thân nhiệt, nhịp thở, đệm lót${s.hasVeterinarian ? '; có bác sĩ thú y trực' : ''}.`,
        detailsEn: `~1h stop: electrolytes, temperature, breathing and bedding check${s.hasVeterinarian ? '; on-site veterinarian' : ''}.`,
      });
    }
    const isLast = idx === legs.length - 1;
    if (isLast) return;
    const code = leg.toCode ?? '';
    const next = legs[idx + 1];
    if (gateByCode.has(code)) {
      const g = gateByCode.get(code)!;
      push({
        code,
        name: g.name,
        type: 'checkpoint',
        coords: leg.toCoords,
        countryCode: g.countryA,
        labelVi: `Cửa khẩu ${countryName(g.countryA)} – ${countryName(g.countryB)}`,
        labelEn: `Border ${countryName(g.countryA, 'en')} – ${countryName(g.countryB, 'en')}`,
        detailsVi: `Thông quan xuất/nhập cảnh, kiểm dịch động vật sống, khử trùng bánh xe (~${g.clearanceHours}h). Giờ mở cửa: ${g.openingHours ?? 'theo thông báo'}.`,
        detailsEn: `Exit/entry customs, live-animal veterinary inspection, wheel disinfection (~${g.clearanceHours}h). Hours: ${g.openingHours ?? 'as announced'}.`,
      });
    } else if (airportCodes.has(code)) {
      const transit = leg.type === 'air' && next?.type === 'air';
      push({
        code,
        name: leg.toName,
        type: transit ? 'transit' : 'airport',
        coords: leg.toCoords,
        countryCode: leg.countryCodes[leg.countryCodes.length - 1] ?? '',
        labelVi: transit ? 'Sân bay trung chuyển' : leg.type === 'road' ? 'Sân bay đi & kiểm dịch' : 'Sân bay đến & kiểm dịch',
        labelEn: transit ? 'Transit airport' : leg.type === 'road' ? 'Departure airport & inspection' : 'Arrival airport & inspection',
        detailsVi: transit
          ? 'Ngựa ở khu chờ có kiểm soát sinh học, thú y kiểm tra trước khi bay tiếp.'
          : leg.type === 'road'
            ? 'Thú y kiểm tra lâm sàng, xếp ngựa vào chuồng bay trước giờ cất cánh.'
            : 'Cơ quan thú y nước sở tại đối soát hồ sơ, kiểm dịch nhập khẩu và thông quan.',
        detailsEn: transit
          ? 'Horses rest in a bio-secure holding area and are checked before the onward flight.'
          : leg.type === 'road'
            ? 'Clinical inspection, horses loaded into jet stalls before departure.'
            : 'Local veterinary authority verifies documents, import quarantine and customs clearance.',
      });
    } else if (portCodes.has(code)) {
      const transship = leg.type === 'sea' && next?.type === 'sea';
      push({
        code,
        name: leg.toName,
        type: transship ? 'transit' : 'seaport',
        coords: leg.toCoords,
        countryCode: leg.countryCodes[leg.countryCodes.length - 1] ?? '',
        labelVi: transship ? 'Cảng ghé trung chuyển' : leg.type === 'road' ? 'Cảng đi' : 'Cảng đến',
        labelEn: transship ? 'Port call' : leg.type === 'road' ? 'Departure port' : 'Arrival port',
        detailsVi: transship
          ? 'Tàu ghé cảng, ngựa ở lại trên tàu, tiếp nước và thức ăn.'
          : leg.type === 'road'
            ? 'Làm thủ tục cảng, đưa ngựa vào ô chuồng cố định trên tàu.'
            : 'Thú y và hải quan cảng đến đối soát chứng từ, kiểm dịch nhập cảnh.',
        detailsEn: transship
          ? 'Port call; horses stay aboard and are re-supplied with water and feed.'
          : leg.type === 'road'
            ? 'Port formalities; horses loaded into fixed pens on board.'
            : 'Veterinary and customs clearance at the arrival port.',
      });
    }
  });

  push({
    code: null,
    name: d.name,
    type: 'destination',
    coords: d.coords,
    countryCode: d.cc,
    labelVi: 'Điểm đến',
    labelEn: 'Destination',
    detailsVi: domestic
      ? 'Bàn giao ngựa đúng địa chỉ, kiểm tra sức khỏe khi đến nơi.'
      : 'Bàn giao ngựa và hoàn tất cách ly theo dõi sau nhập khẩu theo quy định nước đến.',
    detailsEn: domestic
      ? 'Handover at the exact address with an arrival health check.'
      : 'Handover and post-arrival quarantine according to destination rules.',
  });
  return wps;
}

function finalize(
  requestedMode: PlanRouteInput['mode'],
  mode: PlanRouteInput['mode'],
  seaMode: SeaMode | null,
  o: Endpoint,
  d: Endpoint,
  partial: PartialPlan,
  net: TransportNetwork,
  opts: Opts,
): PlannedRoute {
  const legs = partial.legs.map((l, i) => ({ ...l, sequenceNo: i + 1 }));
  const roadLegs = legs.filter((l) => l.type === 'road');
  const borderCrossings = roadLegs.reduce((s, l) => s + l.borderCrossingCount, 0);
  const roadKm = roadLegs.reduce((s, l) => s + l.distanceKm, 0);
  const roadHours = roadLegs.reduce((s, l) => s + l.durationHours, 0);
  const notices = [...partial.notices];
  const warnings = [...partial.warnings];
  const isDomestic = Boolean(o.cc) && o.cc === d.cc;

  if (borderCrossings > 0) {
    notices.push(
      msg(
        'BORDER_CROSSINGS',
        `Tuyến qua ${borderCrossings} cửa khẩu đường bộ: cần giấy phép quá cảnh động vật sống và chứng nhận kiểm dịch của từng nước.`,
        `Route crosses ${borderCrossings} land border(s): live-animal transit permits and health certificates required for each country.`,
      ),
    );
  }
  if (!isDomestic && d.cc === 'CN') {
    notices.push(
      msg(
        'CN_DESIGNATED_ENTRY',
        'Ngựa nhập khẩu vào Trung Quốc đại lục phải qua cửa khẩu/sân bay chỉ định có khu cách ly và có giấy phép kiểm dịch của Tổng cục Hải quan Trung Quốc (GACC) trước khi khởi hành.',
        'Horses entering mainland China must use a designated port with quarantine facilities and hold a GACC import quarantine permit before departure.',
      ),
    );
  }
  if (roadHours > 24) {
    notices.push(
      msg(
        'ROAD_OVER_24H',
        `Tổng thời gian đường bộ ~${Math.round(roadHours)}h > 24h: bắt buộc dỡ ngựa nghỉ tối thiểu 24h giữa hành trình (tham chiếu EU 1/2005).`,
        `Total road time ~${Math.round(roadHours)}h > 24h: horses must be unloaded for at least 24h mid-journey (EU 1/2005 reference).`,
      ),
    );
  }
  // Bỏ cảnh báo trùng lặp
  const uniq = (list: RouteMessage[]) => list.filter((m, i) => list.findIndex((x) => x.code === m.code && x.vi === m.vi) === i);

  const endpoint = (e: Endpoint): PlannedEndpoint => ({ name: e.name, coords: e.coords, countryCode: e.cc, landmass: e.landmass });
  return {
    requestedMode,
    mode,
    seaMode,
    isDomestic,
    origin: endpoint(o),
    destination: endpoint(d),
    legs,
    waypoints: buildWaypoints(legs, o, d, net),
    totals: {
      distanceKm: legs.reduce((s, l) => s + l.distanceKm, 0),
      durationHours: round1(legs.reduce((s, l) => s + l.durationHours, 0)),
      roadKm,
      roadHours: round1(roadHours),
      airKm: legs.filter((l) => l.type === 'air').reduce((s, l) => s + l.distanceKm, 0),
      seaKm: legs.filter((l) => l.type === 'sea').reduce((s, l) => s + l.distanceKm, 0),
      borderCrossings,
      ferryCrossings: 0,
      restStops: legs.reduce((s, l) => s + l.stops.length, 0),
      transitStops: partial.transitStops,
    },
    notices: uniq(notices),
    warnings: uniq(warnings),
  };
}

function planOnce(net: TransportNetwork, input: PlanRouteInput, o: Endpoint, d: Endpoint, opts: Opts): PlannedRoute {
  if (haversine(o.coords, d.coords) < 1) {
    throw new RoutePlanningError('SAME_LOCATION', 'Điểm đi và điểm đến trùng nhau.', 'Origin and destination are the same place.');
  }
  if (input.mode === 'sea' && input.seaMode && (input.seaMode as string) !== 'vessel') {
    throw new RoutePlanningError(
      'FERRY_NOT_SUPPORTED',
      'Phương thức đường thủy chỉ hỗ trợ tàu biển chuyên dụng (vessel), không hỗ trợ phà RoRo.',
      'Sea transport only supports dedicated livestock vessels; RoRo ferries are not supported.',
    );
  }
  const seaMode: SeaMode | null = input.mode === 'sea' ? 'vessel' : null;

  if (input.mode === 'road') {
    return finalize('road', 'road', null, o, d, planRoad(net, o, d, opts), net, opts);
  }

  const partial = input.mode === 'air' ? planAir(net, o, d, opts) : planVessel(net, o, d, opts);
  if (partial === 'same_hub') {
    // Hai đầu dùng chung sân bay/cảng gần nhất → đi thẳng đường bộ nếu được
    const road = planRoad(net, o, d, opts);
    const isAir = input.mode === 'air';
    road.notices.unshift(
      msg(
        isAir ? 'AIR_SAME_AIRPORT' : 'SEA_SAME_PORT',
        isAir
          ? 'Điểm đi và điểm đến dùng chung một sân bay gần nhất, hệ thống chuyển sang xe chuyên dụng đi thẳng.'
          : 'Điểm đi và điểm đến dùng chung một cảng biển gần nhất, hệ thống chuyển sang xe chuyên dụng đi thẳng.',
        isAir
          ? 'Origin and destination share the same nearest airport; switched to a direct horse truck.'
          : 'Origin and destination share the same nearest seaport; switched to a direct horse truck.',
      ),
    );
    return finalize(input.mode, 'road', null, o, d, road, net, opts);
  }
  return finalize(input.mode, input.mode, seaMode, o, d, partial, net, opts);
}

/**
 * Lập tuyến theo phương thức yêu cầu. Thất bại → RoutePlanningError kèm danh sách phương thức thay thế
 * đã được kiểm chứng là lập được tuyến.
 */
export function planNetworkRoute(net: TransportNetwork, input: PlanRouteInput): PlannedRoute {
  const opts: Opts = {
    ...ROUTE_NETWORK_DEFAULTS,
    maxDriveHoursBeforeRest: input.maxDriveHoursBeforeRest ?? ROUTE_NETWORK_DEFAULTS.maxDriveHoursBeforeRest,
    roadSpeedKmh: input.roadSpeedKmh ?? ROUTE_NETWORK_DEFAULTS.roadSpeedKmh,
  };
  const o = toEndpoint(net, input.origin, 'Điểm xuất phát');
  const d = toEndpoint(net, input.destination, 'Điểm đến');
  try {
    return planOnce(net, input, o, d, opts);
  } catch (err) {
    if (!(err instanceof RoutePlanningError) || err.code === 'SAME_LOCATION') throw err;
    const alternatives: RouteSuggestion[] = [
      { mode: 'road' },
      { mode: 'air' },
      { mode: 'sea', seaMode: 'vessel' },
    ];
    const suggestions = alternatives.filter((alt) => {
      if (alt.mode === input.mode && (alt.mode !== 'sea' || alt.seaMode === (input.seaMode ?? 'vessel'))) return false;
      try {
        const p = planOnce(net, { ...input, mode: alt.mode, seaMode: alt.seaMode }, o, d, opts);
        return p.mode === alt.mode;
      } catch {
        return false;
      }
    });
    throw new RoutePlanningError(err.code, err.vi, err.en, suggestions);
  }
}
