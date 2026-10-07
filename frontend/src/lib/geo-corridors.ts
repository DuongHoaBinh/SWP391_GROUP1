/**
 * Geo-Corridors & Intelligent Equine Route Planning Engine
 * Supports arbitrary custom locations across Vietnam and international destinations.
 * Compliant with IATA Live Animals Regulations (LAR) and ASEAN Veterinary Transit.
 */

export interface KnownLocation {
  id: string;
  name: string;
  country: string;
  isVietnam: boolean;
  coords: [number, number]; // [lat, lng]
  keywords: string[];
  nearestAirport: {
    name: string;
    coords: [number, number];
    country: string;
  };
}

export interface Waypoint {
  name: string;
  type: 'origin' | 'checkpoint' | 'rest' | 'airport' | 'destination';
  coords: [number, number];
  label: string;
  country: string;
  details: string;
}

export interface RouteCalculationResult {
  origin: KnownLocation;
  destination: KnownLocation;
  isDomestic: boolean;
  mode: 'air' | 'road';
  distanceKm: number;
  durationHours: number;
  customsCount: number;
  waypoints: Waypoint[];
  summaryNote: string;
}

/**
 * Remove Vietnamese accents and special characters for robust fuzzy matching
 */
export function normalizeVietnamese(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Great-circle distance using Haversine formula (km)
 */
export function calculateHaversine(coord1: [number, number], coord2: [number, number]): number {
  const [lat1, lon1] = coord1;
  const [lat2, lon2] = coord2;
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Master Dictionary of Cities, Turf Clubs, and Equine Hubs
 */
export const KNOWN_LOCATIONS: KnownLocation[] = [
  // --- VIỆT NAM (MIỀN NAM) ---
  {
    id: 'vn-hcm-cuchi',
    name: 'Trang trại Củ Chi, TP. Hồ Chí Minh',
    country: 'Việt Nam',
    isVietnam: true,
    coords: [11.0067, 106.5136],
    keywords: ['cu chi', 'trang trai cu chi', 'hcm', 'ho chi minh', 'sai gon', 'tphcm', 'quan 1', 'quan 7', 'thu duc'],
    nearestAirport: {
      name: 'Sân bay Tân Sơn Nhất (SGN Cargo)',
      coords: [10.8185, 106.6588],
      country: 'Việt Nam',
    },
  },
  {
    id: 'vn-binhduong',
    name: 'Bình Dương (Khu Đua ngựa Đại Nam)',
    country: 'Việt Nam',
    isVietnam: true,
    coords: [11.0315, 106.6343],
    keywords: ['binh duong', 'dai nam', 'thu dau mot', 'di an', 'ben cat'],
    nearestAirport: {
      name: 'Sân bay Tân Sơn Nhất (SGN Cargo)',
      coords: [10.8185, 106.6588],
      country: 'Việt Nam',
    },
  },
  {
    id: 'vn-dongnai',
    name: 'Đồng Nai (Biên Hòa / Long Thành)',
    country: 'Việt Nam',
    isVietnam: true,
    coords: [10.9574, 106.8427],
    keywords: ['dong nai', 'bien hoa', 'long thanh'],
    nearestAirport: {
      name: 'Sân bay Tân Sơn Nhất (SGN Cargo)',
      coords: [10.8185, 106.6588],
      country: 'Việt Nam',
    },
  },
  {
    id: 'vn-tayninh',
    name: 'Tây Ninh (Khu vực Cửa khẩu Mộc Bài)',
    country: 'Việt Nam',
    isVietnam: true,
    coords: [11.0743, 106.1821],
    keywords: ['tay ninh', 'moc bai', 'trang bang'],
    nearestAirport: {
      name: 'Sân bay Tân Sơn Nhất (SGN Cargo)',
      coords: [10.8185, 106.6588],
      country: 'Việt Nam',
    },
  },
  {
    id: 'vn-cantho',
    name: 'Cần Thơ (Đồng bằng Sông Cửu Long)',
    country: 'Việt Nam',
    isVietnam: true,
    coords: [10.0452, 105.7469],
    keywords: ['can tho', 'ninh kieu', 'cai rang', 'mekong'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Cần Thơ (VCA Cargo)',
      coords: [10.0851, 105.7119],
      country: 'Việt Nam',
    },
  },
  {
    id: 'vn-vungtau',
    name: 'Bà Rịa - Vũng Tàu (Trường đua Lam Sơn)',
    country: 'Việt Nam',
    isVietnam: true,
    coords: [10.346, 107.0843],
    keywords: ['vung tau', 'ba ria', 'lam son'],
    nearestAirport: {
      name: 'Sân bay Tân Sơn Nhất (SGN Cargo)',
      coords: [10.8185, 106.6588],
      country: 'Việt Nam',
    },
  },
  {
    id: 'vn-angiang',
    name: 'An Giang (Châu Đốc / Long Xuyên)',
    country: 'Việt Nam',
    isVietnam: true,
    coords: [10.3759, 105.4185],
    keywords: ['an giang', 'long xuyen', 'chau doc', 'tinh bien'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Cần Thơ (VCA Cargo)',
      coords: [10.0851, 105.7119],
      country: 'Việt Nam',
    },
  },
  {
    id: 'vn-kiengiang',
    name: 'Kiên Giang (Rạch Giá / Phú Quốc)',
    country: 'Việt Nam',
    isVietnam: true,
    coords: [10.0125, 105.0809],
    keywords: ['kien giang', 'rach gia', 'phu quoc', 'ha tien'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Cần Thơ (VCA Cargo)',
      coords: [10.0851, 105.7119],
      country: 'Việt Nam',
    },
  },
  {
    id: 'vn-camau',
    name: 'Cà Mau',
    country: 'Việt Nam',
    isVietnam: true,
    coords: [9.1769, 105.1524],
    keywords: ['ca mau', 'nam can'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Cần Thơ (VCA Cargo)',
      coords: [10.0851, 105.7119],
      country: 'Việt Nam',
    },
  },

  // --- VIỆT NAM (MIỀN TRUNG & TÂY NGUYÊN) ---
  {
    id: 'vn-danang',
    name: 'Đà Nẵng (Khu liên hợp Thể thao Hòa Xuân)',
    country: 'Việt Nam',
    isVietnam: true,
    coords: [16.0544, 108.2022],
    keywords: ['da nang', 'hoa xuan', 'son tra', 'hai chau', 'ngu hanh son'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Đà Nẵng (DAD Cargo Hub)',
      coords: [16.0439, 108.1994],
      country: 'Việt Nam',
    },
  },
  {
    id: 'vn-hue',
    name: 'Thừa Thiên Huế',
    country: 'Việt Nam',
    isVietnam: true,
    coords: [16.4637, 107.5909],
    keywords: ['hue', 'thua thien hue', 'phu bai'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Đà Nẵng (DAD Cargo Hub)',
      coords: [16.0439, 108.1994],
      country: 'Việt Nam',
    },
  },
  {
    id: 'vn-nhatrang',
    name: 'Khánh Hòa (Nha Trang / Cam Ranh)',
    country: 'Việt Nam',
    isVietnam: true,
    coords: [12.2388, 109.1967],
    keywords: ['nha trang', 'khanh hoa', 'cam ranh'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Cam Ranh (CXR Cargo)',
      coords: [11.9982, 109.2194],
      country: 'Việt Nam',
    },
  },
  {
    id: 'vn-quynhon',
    name: 'Bình Định (Quy Nhơn)',
    country: 'Việt Nam',
    isVietnam: true,
    coords: [13.783, 109.2197],
    keywords: ['quy nhon', 'binh dinh', 'phu cat'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Đà Nẵng (DAD Cargo Hub)',
      coords: [16.0439, 108.1994],
      country: 'Việt Nam',
    },
  },
  {
    id: 'vn-dalat',
    name: 'Lâm Đồng (Đà Lạt / Đơn Dương)',
    country: 'Việt Nam',
    isVietnam: true,
    coords: [11.9404, 108.4583],
    keywords: ['da lat', 'lam dong', 'lien khuong', 'don duong'],
    nearestAirport: {
      name: 'Sân bay Liên Khương (DLI Cargo)',
      coords: [11.7503, 108.3711],
      country: 'Việt Nam',
    },
  },
  {
    id: 'vn-buonmathuot',
    name: 'Đắk Lắk (Buôn Ma Thuột)',
    country: 'Việt Nam',
    isVietnam: true,
    coords: [12.6667, 108.05],
    keywords: ['buon ma thuot', 'dak lak', 'tay nguyen'],
    nearestAirport: {
      name: 'Sân bay Buôn Ma Thuột (BMV)',
      coords: [12.6683, 108.12],
      country: 'Việt Nam',
    },
  },
  {
    id: 'vn-nghean',
    name: 'Nghệ An (Thành phố Vinh)',
    country: 'Việt Nam',
    isVietnam: true,
    coords: [18.6796, 105.6813],
    keywords: ['nghe an', 'vinh', 'cua lo'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Vinh (VII Cargo)',
      coords: [18.7278, 105.6706],
      country: 'Việt Nam',
    },
  },

  // --- VIỆT NAM (MIỀN BẮC) ---
  {
    id: 'vn-hanoi-socson',
    name: 'Trang trại Ngựa Thể thao Sóc Sơn, Hà Nội',
    country: 'Việt Nam',
    isVietnam: true,
    coords: [21.2833, 105.85],
    keywords: ['ha noi', 'soc son', 'noi bai', 'hoan kiem', 'cau giay', 'my dinh', 'ba dinh', 'tay ho'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Nội Bài (HAN Cargo Hub)',
      coords: [21.2212, 105.8072],
      country: 'Việt Nam',
    },
  },
  {
    id: 'vn-haiphong',
    name: 'Hải Phòng (Khu liên hợp Đồ Sơn / Cát Bi)',
    country: 'Việt Nam',
    isVietnam: true,
    coords: [20.8449, 106.6881],
    keywords: ['hai phong', 'do son', 'cat bi', 'thuy nguyen'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Cát Bi (HPH Cargo)',
      coords: [20.8194, 106.7247],
      country: 'Việt Nam',
    },
  },
  {
    id: 'vn-quangninh',
    name: 'Quảng Ninh (Hạ Long / Móng Cái)',
    country: 'Việt Nam',
    isVietnam: true,
    coords: [20.9505, 107.0734],
    keywords: ['quang ninh', 'ha long', 'mong cai', 'van don'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Vân Đồn (VDO)',
      coords: [21.1189, 107.4144],
      country: 'Việt Nam',
    },
  },
  {
    id: 'vn-langson',
    name: 'Lạng Sơn (Cửa khẩu Quốc tế Hữu Nghị)',
    country: 'Việt Nam',
    isVietnam: true,
    coords: [21.8537, 106.7622],
    keywords: ['lang son', 'huu nghi', 'dong dang'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Nội Bài (HAN Cargo Hub)',
      coords: [21.2212, 105.8072],
      country: 'Việt Nam',
    },
  },
  {
    id: 'vn-laocai',
    name: 'Lào Cai (Cửa khẩu Quốc tế Lào Cai - Sa Pa)',
    country: 'Việt Nam',
    isVietnam: true,
    coords: [22.4856, 103.9707],
    keywords: ['lao cai', 'sa pa', 'sapa'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Nội Bài (HAN Cargo Hub)',
      coords: [21.2212, 105.8072],
      country: 'Việt Nam',
    },
  },

  // --- QUỐC TẾ: SINGAPORE ---
  {
    id: 'intl-singapore',
    name: 'Singapore Turf Club (Kranji Facility, Singapore)',
    country: 'Singapore',
    isVietnam: false,
    coords: [1.4228, 103.7618],
    keywords: ['singapore', 'sing', 'singapor', 'kranji', 'turf club', 'tuas', 'woodlands', 'changi'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Changi (SIN Live Animal Cargo Hub)',
      coords: [1.3644, 103.9915],
      country: 'Singapore',
    },
  },

  // --- QUỐC TẾ: MALAYSIA ---
  {
    id: 'intl-malaysia-selangor',
    name: 'Selangor Turf Club (Kuala Lumpur, Malaysia)',
    country: 'Malaysia',
    isVietnam: false,
    coords: [3.045, 101.7139],
    keywords: ['malaysia', 'selangor', 'kuala lumpur', 'kl', 'klia', 'sunai besi', 'putrajaya'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Kuala Lumpur (KLIA Cargo Hub)',
      coords: [2.7456, 101.7072],
      country: 'Malaysia',
    },
  },
  {
    id: 'intl-malaysia-penang',
    name: 'Penang Turf Club (Batu Gantang, Malaysia)',
    country: 'Malaysia',
    isVietnam: false,
    coords: [5.4128, 100.3015],
    keywords: ['penang', 'george town', 'perak'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Penang (PEN Cargo)',
      coords: [5.2971, 100.2769],
      country: 'Malaysia',
    },
  },

  // --- QUỐC TẾ: THÁI LAN ---
  {
    id: 'intl-thailand-bangkok',
    name: 'Royal Bangkok Sports Club (Bangkok, Thái Lan)',
    country: 'Thái Lan',
    isVietnam: false,
    coords: [13.7388, 100.5367],
    keywords: ['bangkok', 'thai lan', 'thailand', 'bkk', 'suvarnabhumi', 'royal bangkok', 'sports club'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Suvarnabhumi (BKK Cargo Hub)',
      coords: [13.69, 100.7501],
      country: 'Thái Lan',
    },
  },
  {
    id: 'intl-thailand-chiangmai',
    name: 'Chiang Mai Equestrian Club (Thái Lan)',
    country: 'Thái Lan',
    isVietnam: false,
    coords: [18.7883, 98.9853],
    keywords: ['chiang mai', 'chiangmai'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Chiang Mai (CNX Cargo)',
      coords: [18.7668, 98.9626],
      country: 'Thái Lan',
    },
  },

  // --- QUỐC TẾ: CAMPUCHIA ---
  {
    id: 'intl-cambodia-phnompenh',
    name: 'Phnom Penh Equestrian Club (Campuchia)',
    country: 'Campuchia',
    isVietnam: false,
    coords: [11.5564, 104.9282],
    keywords: ['campuchia', 'cambodia', 'phnom penh', 'phnompenh', 'bavet', 'siem reap'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Phnom Penh (PNH Cargo)',
      coords: [11.5466, 104.8441],
      country: 'Campuchia',
    },
  },

  // --- QUỐC TẾ: LÀO ---
  {
    id: 'intl-laos-vientiane',
    name: 'Vientiane Equestrian Center (Lào)',
    country: 'Lào',
    isVietnam: false,
    coords: [17.9757, 102.6331],
    keywords: ['lao', 'laos', 'vientiane', 'vieng chan'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Wattay (VTE Cargo)',
      coords: [17.9883, 102.5633],
      country: 'Lào',
    },
  },

  // --- QUỐC TẾ: HONG KONG ---
  {
    id: 'intl-hongkong',
    name: 'Sha Tin Racecourse (Hong Kong Jockey Club)',
    country: 'Hong Kong',
    isVietnam: false,
    coords: [22.4003, 114.2046],
    keywords: ['hong kong', 'hongkong', 'sha tin', 'happy valley', 'jockey club'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Hong Kong (HKG Cargo Hub)',
      coords: [22.308, 113.9185],
      country: 'Hong Kong',
    },
  },

  // --- QUỐC TẾ: NHẬT BẢN ---
  {
    id: 'intl-japan-tokyo',
    name: 'Tokyo Racecourse (JRA Fuchu, Nhật Bản)',
    country: 'Nhật Bản',
    isVietnam: false,
    coords: [35.6631, 139.4851],
    keywords: ['nhat ban', 'japan', 'tokyo', 'fuchu', 'narita', 'haneda'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Narita (NRT Equine Quarantine)',
      coords: [35.772, 140.3929],
      country: 'Nhật Bản',
    },
  },

  // --- QUỐC TẾ: HÀN QUỐC ---
  {
    id: 'intl-korea-seoul',
    name: 'Seoul Racecourse (KRA LetsRun Park, Hàn Quốc)',
    country: 'Hàn Quốc',
    isVietnam: false,
    coords: [37.4411, 127.0169],
    keywords: ['han quoc', 'korea', 'seoul', 'incheon', 'letsrun'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Incheon (ICN Cargo Hub)',
      coords: [37.4602, 126.4407],
      country: 'Hàn Quốc',
    },
  },

  // --- QUỐC TẾ: UAE / DUBAI ---
  {
    id: 'intl-dubai',
    name: 'Meydan Racecourse (Dubai, UAE)',
    country: 'UAE',
    isVietnam: false,
    coords: [25.156, 55.302],
    keywords: ['dubai', 'uae', 'meydan', 'abu dhabi'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Dubai (DXB Live Animal Facility)',
      coords: [25.2532, 55.3657],
      country: 'UAE',
    },
  },

  // --- QUỐC TẾ: ÚC ---
  {
    id: 'intl-australia-melbourne',
    name: 'Flemington Racecourse (Melbourne, Úc)',
    country: 'Úc',
    isVietnam: false,
    coords: [-37.7892, 144.9125],
    keywords: ['uc', 'australia', 'melbourne', 'sydney', 'flemington'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Melbourne (MEL Equine Terminal)',
      coords: [-37.669, 144.841],
      country: 'Úc',
    },
  },
];

/**
 * Resolve any arbitrary input text to a KnownLocation using fuzzy keyword matching
 */
export function resolveLocation(rawText: string, fallbackDefaultId = 'vn-hcm-cuchi'): KnownLocation {
  if (!rawText || !rawText.trim()) {
    return KNOWN_LOCATIONS.find((l) => l.id === fallbackDefaultId)!;
  }

  const normalized = normalizeVietnamese(rawText);

  // 1. Direct keyword score matching
  let bestMatch: KnownLocation | null = null;
  let highestScore = 0;

  for (const loc of KNOWN_LOCATIONS) {
    for (const kw of loc.keywords) {
      if (normalized.includes(kw)) {
        const score = kw.length; // Longer matching keywords take priority
        if (score > highestScore) {
          highestScore = score;
          bestMatch = loc;
        }
      }
    }
  }

  if (bestMatch) {
    return {
      ...bestMatch,
      name: rawText.length > 3 ? `${rawText} (${bestMatch.country})` : bestMatch.name,
    };
  }

  // 2. Fallback heuristic: check if contains country words
  const isForeign =
    normalized.includes('international') ||
    normalized.includes('nuoc ngoai') ||
    normalized.includes('air') ||
    normalized.includes('flight');

  if (isForeign) {
    const defaultForeign = KNOWN_LOCATIONS.find((l) => l.id === 'intl-singapore')!;
    return {
      ...defaultForeign,
      name: rawText,
    };
  }

  // Default to Vietnam HCM Stable with custom label
  const defaultVn = KNOWN_LOCATIONS.find((l) => l.id === fallbackDefaultId)!;
  return {
    ...defaultVn,
    name: rawText,
  };
}

/**
 * Intelligent Equine Route Builder
 * Produces real waypoints, flight paths or road transit checkpoints dynamically
 */
export function buildEquineRoute(
  originText: string,
  destinationText: string,
  preferredMode: 'air' | 'road' = 'air',
  explicitTransportType?: 'International' | 'Domestic'
): RouteCalculationResult {
  const origin = resolveLocation(originText, 'vn-hcm-cuchi');
  const destination = resolveLocation(destinationText, 'intl-singapore');

  const isDomestic =
    explicitTransportType === 'Domestic' ||
    (origin.isVietnam && destination.isVietnam && explicitTransportType !== 'International');

  const directDistanceKm = Math.round(calculateHaversine(origin.coords, destination.coords));

  const waypoints: Waypoint[] = [];
  let mode = preferredMode;
  let distanceKm = 0;
  let durationHours = 0;

  if (isDomestic) {
    // DOMESTIC VIETNAM ROUTE
    if (mode === 'air') {
      const originAirport = origin.nearestAirport;
      const destAirport = destination.nearestAirport;

      waypoints.push({
        name: origin.name,
        type: 'origin',
        coords: origin.coords,
        label: 'Điểm xuất phát (Trang trại)',
        country: origin.country,
        details: 'Kiểm tra tình trạng thể lực, đối chiếu vi mạch Microchip và sổ tiêm chủng Cục Thú Y.',
      });

      waypoints.push({
        name: originAirport.name,
        type: 'airport',
        coords: originAirport.coords,
        label: 'Trạm kiểm dịch sân bay đi',
        country: origin.country,
        details: 'Chi cục Thú y vùng cấp giấy kiểm dịch vận chuyển nội địa, đưa vào Air Stall chuyên dụng.',
      });

      waypoints.push({
        name: destAirport.name,
        type: 'airport',
        coords: destAirport.coords,
        label: 'Sân bay đến & Kiểm tra thú y',
        country: destination.country,
        details: 'Kiểm tra lâm sàng thân nhiệt và trạng thái căng thẳng (stress log) sau chuyến bay.',
      });

      waypoints.push({
        name: destination.name,
        type: 'destination',
        coords: destination.coords,
        label: 'Điểm đến nội địa',
        country: destination.country,
        details: 'Bàn giao cho quản lý trang trại/trường đua đích, đưa vào chuồng dưỡng sức.',
      });

      distanceKm = Math.max(120, Math.round(directDistanceKm * 1.15));
      durationHours = Math.max(4, Math.round(distanceKm / 450 + 3.5));
    } else {
      // Domestic Road
      waypoints.push({
        name: origin.name,
        type: 'origin',
        coords: origin.coords,
        label: 'Điểm xuất phát (Trang trại)',
        country: origin.country,
        details: 'Khởi hành xe chuyên dụng thùng điều hòa kháng chấn tiêu chuẩn thú y.',
      });

      // Insert veterinary rest stops if distance is long (>300km)
      if (directDistanceKm > 350) {
        // North-South stops: Nha Trang & Da Nang
        if (origin.coords[0] < 14 && destination.coords[0] > 18) {
          // South to North
          waypoints.push({
            name: 'Trạm kiểm dịch động vật Cam Ranh / Nha Trang',
            type: 'rest',
            coords: [11.9982, 109.155],
            label: 'Trạm dừng nghỉ & Kiểm tra nước uống (6h)',
            country: 'Việt Nam',
            details: 'Cho ngựa uống điện giải, ăn cỏ khô alfalfa, kiểm tra nhịp thở và đệm lót.',
          });
          waypoints.push({
            name: 'Trạm kiểm dịch thú y Quốc lộ 1A - Đà Nẵng',
            type: 'rest',
            coords: [16.0544, 108.2022],
            label: 'Trạm dừng nghỉ & Bác sĩ thú y (8h)',
            country: 'Việt Nam',
            details: 'Bác sĩ thú y kiểm tra mạch đập, thay đổi tài xế phụ trách, nghỉ qua đêm.',
          });
          waypoints.push({
            name: 'Trạm thú y kiểm soát dịch bệnh Vinh (Nghệ An)',
            type: 'rest',
            coords: [18.6796, 105.6813],
            label: 'Trạm kiểm tra sức khỏe chặng cuối',
            country: 'Việt Nam',
            details: 'Kiểm tra thân nhiệt lần cuối trước khi tiến vào vùng đích.',
          });
        } else if (origin.coords[0] > 18 && destination.coords[0] < 14) {
          // North to South
          waypoints.push({
            name: 'Trạm thú y kiểm soát dịch bệnh Vinh (Nghệ An)',
            type: 'rest',
            coords: [18.6796, 105.6813],
            label: 'Trạm dừng nghỉ & Tiếp nước',
            country: 'Việt Nam',
            details: 'Cho ngựa nghỉ ngơi sau chặng đèo dốc miền Trung.',
          });
          waypoints.push({
            name: 'Trạm kiểm dịch thú y Quốc lộ 1A - Đà Nẵng',
            type: 'rest',
            coords: [16.0544, 108.2022],
            label: 'Trạm dừng nghỉ miền Trung (8h)',
            country: 'Việt Nam',
            details: 'Kiểm tra móng và trạng thái tim mạch của ngựa.',
          });
        } else {
          // Regional stop
          const midLat = (origin.coords[0] + destination.coords[0]) / 2;
          const midLng = (origin.coords[1] + destination.coords[1]) / 2;
          waypoints.push({
            name: 'Trạm kiểm dịch thú y liên tỉnh (Vet Rest Stop)',
            type: 'rest',
            coords: [midLat, midLng],
            label: 'Trạm dừng nghỉ thú y giữa chặng',
            country: 'Việt Nam',
            details: 'Dừng nghỉ bắt buộc theo quy định phúc lợi động vật (6h nghỉ ngơi).',
          });
        }
      }

      waypoints.push({
        name: destination.name,
        type: 'destination',
        coords: destination.coords,
        label: 'Điểm đến (Destination)',
        country: destination.country,
        details: 'Hoàn tất bàn giao, đưa ngựa vào khu chuồng kiểm dịch tiếp nhận.',
      });

      distanceKm = Math.max(80, Math.round(directDistanceKm * 1.35));
      durationHours = Math.max(3, Math.round((distanceKm / 55) * 1.35));
    }
  } else {
    // INTERNATIONAL CROSS-BORDER ROUTE
    if (mode === 'air') {
      const originAirport = origin.nearestAirport;
      const destAirport = destination.nearestAirport;

      waypoints.push({
        name: origin.name,
        type: 'origin',
        coords: origin.coords,
        label: 'Điểm xuất phát (Stable)',
        country: origin.country,
        details: 'Kiểm tra hồ sơ FEI Passport, vi mạch microchip và giấy xuất cảnh Cục Thú Y cấp.',
      });

      waypoints.push({
        name: originAirport.name,
        type: 'airport',
        coords: originAirport.coords,
        label: 'Hải quan xuất cảnh & Kiểm dịch sân bay',
        country: origin.country,
        details: 'Bác sĩ thú y quốc tế kiểm tra lâm sàng, xếp vào chuồng hàng không IATA (Air Stall).',
      });

      waypoints.push({
        name: destAirport.name,
        type: 'airport',
        coords: destAirport.coords,
        label: 'Cảng hàng không nhập cảnh & Kiểm dịch',
        country: destination.country,
        details: 'Cơ quan Thú y nước sở tại đối soát giấy phép CITES/Health Certificate, kiểm dịch tại cảng.',
      });

      waypoints.push({
        name: destination.name,
        type: 'destination',
        coords: destination.coords,
        label: 'Trường đua đích (Racecourse / Stable)',
        country: destination.country,
        details: 'Đưa vào khu cách ly theo dõi 14 ngày theo quy chuẩn đua quốc tế.',
      });

      distanceKm = Math.max(650, Math.round(directDistanceKm * 1.1));
      durationHours = Math.max(5, Math.round(distanceKm / 700 + 4.5));
    } else {
      // International Overland Road Route
      waypoints.push({
        name: origin.name,
        type: 'origin',
        coords: origin.coords,
        label: 'Điểm xuất phát (Stable)',
        country: origin.country,
        details: 'Khởi hành xe chuyên dụng thùng điều hòa kháng chấn.',
      });

      waypoints.push({
        name: 'Cửa khẩu Quốc tế Mộc Bài (Tây Ninh)',
        type: 'checkpoint',
        coords: [11.0743, 106.1821],
        label: 'Cửa khẩu xuất cảnh & Hải quan Việt Nam',
        country: 'Việt Nam',
        details: 'Thực hiện thủ tục hải quan xuất cảnh cho gia súc đua, kiểm tra giấy kiểm dịch.',
      });

      waypoints.push({
        name: 'Trạm dừng nghỉ & Thú y Phnom Penh',
        type: 'rest',
        coords: [11.5564, 104.9282],
        label: 'Trạm kiểm tra sức khỏe quá cảnh (6h)',
        country: 'Campuchia',
        details: 'Bác sĩ thú y kiểm tra thân nhiệt, cho ngựa uống điện giải và nghỉ ngơi.',
      });

      waypoints.push({
        name: 'Cửa khẩu Quốc tế Poipet - Aranyaprathet',
        type: 'checkpoint',
        coords: [13.6558, 102.5516],
        label: 'Cửa khẩu quá cảnh Campuchia - Thái Lan',
        country: 'Thái Lan',
        details: 'Khử trùng lốp xe vận chuyển, làm thủ tục hải quan quá cảnh ASEAN Transit.',
      });

      // If heading further south to Malaysia or Singapore
      const destLat = destination.coords[0];
      if (destLat < 10) {
        waypoints.push({
          name: 'Trạm dừng chân Surat Thani Equine Rest',
          type: 'rest',
          coords: [9.1382, 99.3217],
          label: 'Trạm nghỉ ngơi & Kiểm tra móng ngựa',
          country: 'Thái Lan',
          details: 'Thay đệm rơm chuồng xe, kiểm tra tình trạng căng thẳng (stress log).',
        });

        waypoints.push({
          name: 'Cửa khẩu Quốc tế Sadao - Bukit Kayu Hitam',
          type: 'checkpoint',
          coords: [6.5167, 100.4167],
          label: 'Cửa khẩu biên giới Thái Lan - Malaysia',
          country: 'Malaysia',
          details: 'Kiểm tra giấy phép DVS Malaysia, kiểm dịch thú y biên giới.',
        });
      }

      waypoints.push({
        name: destination.name,
        type: 'destination',
        coords: destination.coords,
        label: 'Điểm đến bàn giao (Final Destination)',
        country: destination.country,
        details: 'Bàn giao ngựa cho chủ sở hữu, đưa vào chuồng cách ly theo dõi.',
      });

      distanceKm = Math.max(900, Math.round(directDistanceKm * 1.45));
      durationHours = Math.max(18, Math.round((distanceKm / 55) * 1.35));
    }
  }

  const customsCount = waypoints.filter((w) => w.type === 'checkpoint' || w.type === 'airport').length;

  const summaryNote = `${isDomestic ? 'Nội địa' : 'Xuyên biên giới'}: ${origin.name} ➔ ${destination.name} (${mode === 'air' ? 'Hàng không' : 'Đường bộ'})`;

  return {
    origin,
    destination,
    isDomestic,
    mode,
    distanceKm,
    durationHours,
    customsCount,
    waypoints,
    summaryNote,
  };
}
