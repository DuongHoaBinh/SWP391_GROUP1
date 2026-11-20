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

export interface RouteLegPreview {
  sequenceNo: number;
  type: 'road' | 'air';
  vehicleLabelVi: string;
  vehicleLabelEn: string;
  fromName: string;
  toName: string;
  fromCoords: [number, number];
  toCoords: [number, number];
  distanceKm: number;
  durationHours: number;
  noteVi: string;
  noteEn: string;
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
  legs: RouteLegPreview[];
  airFallbackNotice?: { vi: string; en: string } | null;
  summaryNote: string;
}

const AIRPORT_TEXT_PATTERNS = [
  'san bay',
  'airport',
  'cargo terminal',
  'tan son nhat',
  'noi bai',
  'da nang international airport',
  'cam ranh airport',
  'lien khuong',
  'phu bai airport',
  'cat bi',
  'van don airport',
  'phu cat',
  'tho xuan airport',
  'chu lai airport',
  'phu quoc airport',
  'changi',
  'suvarnabhumi',
  'don mueang',
  'klia',
  'narita',
  'haneda',
  'kansai airport',
  'incheon',
  'heathrow',
  'stansted',
  'charles de gaulle',
  'syamsudin noor',
  'soekarno hatta',
  'hamad international',
  'kingsford smith',
  'tullamarine',
];

const AIRPORT_IATA_TOKENS = [
  'sgn', 'han', 'dad', 'cxr', 'pqc', 'vca', 'hph', 'vdo', 'hui', 'vii', 'dli',
  'uih', 'thd', 'bmv', 'pxu', 'vcl', 'tbb', 'vdh', 'vcs', 'cah', 'vkg', 'din',
  'sin', 'kul', 'pen', 'jhb', 'bki', 'kch', 'bkk', 'dmk', 'cnx', 'hkt', 'hdy', 'uth', 'utp',
  'pnh', 'sai', 'kos', 'vte', 'lpq', 'pkz', 'mnl', 'ceb', 'dvo', 'rgn', 'bwn',
  'hkg', 'tpe', 'khh', 'pek', 'pvg', 'can', 'szx', 'ctu', 'ckg', 'kmg', 'xiy', 'hgh', 'nng',
  'nrt', 'hnd', 'kix', 'ngo', 'fuk', 'cts', 'oka', 'icn', 'pus', 'cju',
  'bdj', 'cgk', 'dps', 'sub', 'kno', 'bpn', 'pnk', 'upg', 'yia',
  'del', 'bom', 'blr', 'maa', 'hyd', 'ccu',
  'dxb', 'auh', 'doh', 'ruh', 'jed', 'kwi', 'bah', 'mct',
  'syd', 'mel', 'bne', 'per', 'adl', 'akl', 'chc',
  'lhr', 'stn', 'man', 'edi', 'dub', 'cdg', 'lys', 'nce', 'fra', 'muc', 'ber', 'ham',
  'ams', 'bru', 'lgg', 'mxp', 'fco', 'mad', 'bcn', 'zrh', 'vie', 'ist',
  'jfk', 'lax', 'sdf', 'ord', 'mia', 'dfw', 'sfo', 'sea', 'atl', 'bos', 'iad', 'yyz', 'yvr', 'yul',
];

export function isAirportLocationText(text?: string | null): boolean {
  if (!text) return false;
  const rawLower = text.toLowerCase();
  if (AIRPORT_IATA_TOKENS.some((code) => rawLower.includes(`(${code})`))) {
    return true;
  }
  const normalized = normalizeVietnamese(text);
  if (AIRPORT_TEXT_PATTERNS.some((kw) => normalized.includes(kw))) {
    return true;
  }
  return AIRPORT_IATA_TOKENS.some((code) => new RegExp(`\\b${code}\\s+cargo\\b`).test(normalized));
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
    id: 'vn-tiengiang',
    name: 'Tiền Giang (Mỹ Tho / Cai Lậy / Trại thực nghiệm)',
    country: 'Việt Nam',
    isVietnam: true,
    coords: [10.3544, 106.3653],
    keywords: ['tien giang', 'my tho', 'cai lay', 'cai be', 'go cong', 'cho gao', 'chau thanh tien giang', 'trai thuc nghiem'],
    nearestAirport: {
      name: 'Sân bay Tân Sơn Nhất (SGN Cargo)',
      coords: [10.8185, 106.6588],
      country: 'Việt Nam',
    },
  },
  {
    id: 'vn-longan',
    name: 'Long An (Tân An / Bến Lức / Đức Hòa)',
    country: 'Việt Nam',
    isVietnam: true,
    coords: [10.5333, 106.4167],
    keywords: ['long an', 'tan an', 'duc hoa', 'ben luc', 'can giuoc', 'can duoc'],
    nearestAirport: {
      name: 'Sân bay Tân Sơn Nhất (SGN Cargo)',
      coords: [10.8185, 106.6588],
      country: 'Việt Nam',
    },
  },
  {
    id: 'vn-bentre',
    name: 'Bến Tre (Mỏ Cày / Ba Tri)',
    country: 'Việt Nam',
    isVietnam: true,
    coords: [10.2415, 106.3758],
    keywords: ['ben tre', 'mo cay', 'ba tri', 'binh dai', 'giong trom'],
    nearestAirport: {
      name: 'Sân bay Tân Sơn Nhất (SGN Cargo)',
      coords: [10.8185, 106.6588],
      country: 'Việt Nam',
    },
  },
  {
    id: 'vn-dongthap',
    name: 'Đồng Tháp (Cao Lãnh / Sa Đéc)',
    country: 'Việt Nam',
    isVietnam: true,
    coords: [10.4578, 105.6328],
    keywords: ['dong thap', 'cao lanh', 'sa dec', 'hong ngu', 'thap muoi'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Cần Thơ (VCA Cargo)',
      coords: [10.0851, 105.7119],
      country: 'Việt Nam',
    },
  },
  {
    id: 'vn-vinhlong',
    name: 'Vĩnh Long',
    country: 'Việt Nam',
    isVietnam: true,
    coords: [10.2537, 105.9722],
    keywords: ['vinh long', 'binh minh', 'tra on'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Cần Thơ (VCA Cargo)',
      coords: [10.0851, 105.7119],
      country: 'Việt Nam',
    },
  },
  {
    id: 'vn-travinh',
    name: 'Trà Vinh',
    country: 'Việt Nam',
    isVietnam: true,
    coords: [9.9348, 106.3455],
    keywords: ['tra vinh', 'cau ke', 'duyen hai'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Cần Thơ (VCA Cargo)',
      coords: [10.0851, 105.7119],
      country: 'Việt Nam',
    },
  },
  {
    id: 'vn-haugiang',
    name: 'Hậu Giang (Vị Thanh)',
    country: 'Việt Nam',
    isVietnam: true,
    coords: [9.7844, 105.4701],
    keywords: ['hau giang', 'vi thanh', 'nga bay'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Cần Thơ (VCA Cargo)',
      coords: [10.0851, 105.7119],
      country: 'Việt Nam',
    },
  },
  {
    id: 'vn-soctrang',
    name: 'Sóc Trăng',
    country: 'Việt Nam',
    isVietnam: true,
    coords: [9.6035, 105.9724],
    keywords: ['soc trang', 'nga nam', 'vinh chau'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Cần Thơ (VCA Cargo)',
      coords: [10.0851, 105.7119],
      country: 'Việt Nam',
    },
  },
  {
    id: 'vn-baclieu',
    name: 'Bạc Liêu',
    country: 'Việt Nam',
    isVietnam: true,
    coords: [9.2941, 105.7278],
    keywords: ['bac lieu', 'gia rai'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Cần Thơ (VCA Cargo)',
      coords: [10.0851, 105.7119],
      country: 'Việt Nam',
    },
  },
  {
    id: 'vn-binhphuoc',
    name: 'Bình Phước (Đồng Xoài / Chơn Thành)',
    country: 'Việt Nam',
    isVietnam: true,
    coords: [11.5333, 106.8833],
    keywords: ['binh phuoc', 'dong xoai', 'chon thanh', 'binh long'],
    nearestAirport: {
      name: 'Sân bay Tân Sơn Nhất (SGN Cargo)',
      coords: [10.8185, 106.6588],
      country: 'Việt Nam',
    },
  },
  {
    id: 'vn-binhthuan',
    name: 'Bình Thuận (Phan Thiết / La Gi)',
    country: 'Việt Nam',
    isVietnam: true,
    coords: [10.9274, 108.0995],
    keywords: ['binh thuan', 'phan thiet', 'la gi', 'ham thuan'],
    nearestAirport: {
      name: 'Sân bay Cam Ranh (CXR Cargo)',
      coords: [11.9982, 109.2194],
      country: 'Việt Nam',
    },
  },
  {
    id: 'vn-ninhthuan',
    name: 'Ninh Thuận (Phan Rang - Tháp Chàm)',
    country: 'Việt Nam',
    isVietnam: true,
    coords: [11.5683, 108.9858],
    keywords: ['ninh thuan', 'phan rang', 'thap cham'],
    nearestAirport: {
      name: 'Sân bay Cam Ranh (CXR Cargo)',
      coords: [11.9982, 109.2194],
      country: 'Việt Nam',
    },
  },
  {
    id: 'vn-quangnam',
    name: 'Quảng Nam (Hội An / Tam Kỳ)',
    country: 'Việt Nam',
    isVietnam: true,
    coords: [15.5847, 108.4754],
    keywords: ['quang nam', 'hoi an', 'tam ky', 'chu lai'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Đà Nẵng (DAD Cargo Hub)',
      coords: [16.0439, 108.1994],
      country: 'Việt Nam',
    },
  },
  {
    id: 'vn-thanhhoa',
    name: 'Thanh Hóa (Thọ Xuân)',
    country: 'Việt Nam',
    isVietnam: true,
    coords: [19.8067, 105.7852],
    keywords: ['thanh hoa', 'tho xuan', 'sam son', 'bim son'],
    nearestAirport: {
      name: 'Sân bay Thọ Xuân (THD)',
      coords: [19.9015, 105.4674],
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
    name: 'Kiên Giang (Rạch Giá / Hà Tiên)',
    country: 'Việt Nam',
    isVietnam: true,
    coords: [10.0125, 105.0809],
    keywords: ['kien giang', 'rach gia', 'ha tien'],
    nearestAirport: {
      name: 'Sân bay Rạch Giá (VKG Cargo)',
      coords: [9.9597, 105.1322],
      country: 'Việt Nam',
    },
  },
  {
    id: 'vn-phuquoc',
    name: 'Phú Quốc, Kiên Giang',
    country: 'Việt Nam',
    isVietnam: true,
    coords: [10.227, 103.957],
    keywords: ['phu quoc', 'duong dong', 'an thoi'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Phú Quốc (PQC Cargo)',
      coords: [10.1698, 103.9931],
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
      name: 'Sân bay Cà Mau (CAH Cargo)',
      coords: [9.1756, 105.1794],
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
      name: 'Sân bay Quốc tế Phú Bài (HUI Cargo)',
      coords: [16.4008, 107.7031],
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
      name: 'Sân bay Phù Cát - Quy Nhơn (UIH Cargo)',
      coords: [13.955, 109.0422],
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
  {
    id: 'vn-bacninh',
    name: 'Bắc Ninh (Từ Sơn / Tiên Du / Yên Phong)',
    country: 'Việt Nam',
    isVietnam: true,
    coords: [21.1861, 106.0763],
    keywords: ['bac ninh', 'tu son', 'yen phong', 'que vo', 'thuan thanh', 'tien du', 'gia binh', 'luong tai'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Nội Bài (HAN Cargo Hub)',
      coords: [21.2212, 105.8072],
      country: 'Việt Nam',
    },
  },
  {
    id: 'vn-bacgiang',
    name: 'Bắc Giang (Việt Yên / Lục Ngạn)',
    country: 'Việt Nam',
    isVietnam: true,
    coords: [21.2731, 106.1946],
    keywords: ['bac giang', 'viet yen', 'luc ngan', 'hiep hoa', 'lang giang'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Nội Bài (HAN Cargo Hub)',
      coords: [21.2212, 105.8072],
      country: 'Việt Nam',
    },
  },
  {
    id: 'vn-haiduong',
    name: 'Hải Dương (Chí Linh / Cẩm Giàng)',
    country: 'Việt Nam',
    isVietnam: true,
    coords: [20.9405, 106.333],
    keywords: ['hai duong', 'chi linh', 'kinh mon', 'cam giang'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Cát Bi (HPH Cargo)',
      coords: [20.8194, 106.7247],
      country: 'Việt Nam',
    },
  },
  {
    id: 'vn-hungyen',
    name: 'Hưng Yên (Mỹ Hào / Văn Giang / Phố Nối)',
    country: 'Việt Nam',
    isVietnam: true,
    coords: [20.6464, 106.0511],
    keywords: ['hung yen', 'my hao', 'van giang', 'pho noi', 'khoai chau'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Nội Bài (HAN Cargo Hub)',
      coords: [21.2212, 105.8072],
      country: 'Việt Nam',
    },
  },
  {
    id: 'vn-thainguyen',
    name: 'Thái Nguyên (Sông Công / Phổ Yên)',
    country: 'Việt Nam',
    isVietnam: true,
    coords: [21.5928, 105.8442],
    keywords: ['thai nguyen', 'song cong', 'pho yen', 'dai tu'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Nội Bài (HAN Cargo Hub)',
      coords: [21.2212, 105.8072],
      country: 'Việt Nam',
    },
  },
  {
    id: 'vn-vinhphuc',
    name: 'Vĩnh Phúc (Vĩnh Yên / Phúc Yên / Tam Đảo)',
    country: 'Việt Nam',
    isVietnam: true,
    coords: [21.3089, 105.6049],
    keywords: ['vinh phuc', 'vinh yen', 'phuc yen', 'tam dao', 'binh xuyen'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Nội Bài (HAN Cargo Hub)',
      coords: [21.2212, 105.8072],
      country: 'Việt Nam',
    },
  },
  {
    id: 'vn-phutho',
    name: 'Phú Thọ (Việt Trì / Đền Hùng)',
    country: 'Việt Nam',
    isVietnam: true,
    coords: [21.3228, 105.4019],
    keywords: ['phu tho', 'viet tri', 'den hung'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Nội Bài (HAN Cargo Hub)',
      coords: [21.2212, 105.8072],
      country: 'Việt Nam',
    },
  },
  {
    id: 'vn-ninhbinh',
    name: 'Ninh Bình (Tam Điệp / Tràng An)',
    country: 'Việt Nam',
    isVietnam: true,
    coords: [20.2506, 105.9745],
    keywords: ['ninh binh', 'tam diep', 'trang an'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Nội Bài (HAN Cargo Hub)',
      coords: [21.2212, 105.8072],
      country: 'Việt Nam',
    },
  },
  {
    id: 'vn-namdinh',
    name: 'Nam Định',
    country: 'Việt Nam',
    isVietnam: true,
    coords: [20.42, 106.1683],
    keywords: ['nam dinh', 'y yen', 'hai hau'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Cát Bi (HPH Cargo)',
      coords: [20.8194, 106.7247],
      country: 'Việt Nam',
    },
  },
  {
    id: 'vn-hanam',
    name: 'Hà Nam (Phủ Lý / Đồng Văn)',
    country: 'Việt Nam',
    isVietnam: true,
    coords: [20.5453, 105.9122],
    keywords: ['ha nam', 'phu ly', 'dong van'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Nội Bài (HAN Cargo Hub)',
      coords: [21.2212, 105.8072],
      country: 'Việt Nam',
    },
  },
  {
    id: 'vn-thaibinh',
    name: 'Thái Bình',
    country: 'Việt Nam',
    isVietnam: true,
    coords: [20.4463, 106.3366],
    keywords: ['thai binh', 'tien hai', 'dong hung'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Cát Bi (HPH Cargo)',
      coords: [20.8194, 106.7247],
      country: 'Việt Nam',
    },
  },
  {
    id: 'vn-hoabinh',
    name: 'Hòa Bình (Lương Sơn / Mai Châu)',
    country: 'Việt Nam',
    isVietnam: true,
    coords: [20.8172, 105.3376],
    keywords: ['hoa binh', 'luong son', 'mai chau'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Nội Bài (HAN Cargo Hub)',
      coords: [21.2212, 105.8072],
      country: 'Việt Nam',
    },
  },
  {
    id: 'vn-hatinh',
    name: 'Hà Tĩnh (Kỳ Anh / Vũng Áng)',
    country: 'Việt Nam',
    isVietnam: true,
    coords: [18.3559, 105.9059],
    keywords: ['ha tinh', 'hong linh', 'ky anh', 'vung ang'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Vinh (VII Cargo)',
      coords: [18.7278, 105.6706],
      country: 'Việt Nam',
    },
  },
  {
    id: 'vn-quangbinh',
    name: 'Quảng Bình (Đồng Hới / Phong Nha)',
    country: 'Việt Nam',
    isVietnam: true,
    coords: [17.4709, 106.6225],
    keywords: ['quang binh', 'dong hoi', 'phong nha'],
    nearestAirport: {
      name: 'Sân bay Đồng Hới (VDH Cargo)',
      coords: [17.5153, 106.5906],
      country: 'Việt Nam',
    },
  },
  {
    id: 'vn-quangtri',
    name: 'Quảng Trị (Đông Hà / Lao Bảo)',
    country: 'Việt Nam',
    isVietnam: true,
    coords: [16.8163, 107.1004],
    keywords: ['quang tri', 'dong ha', 'lao bao'],
    nearestAirport: {
      name: 'Sân bay Phú Bài (HUI Cargo)',
      coords: [16.4008, 107.7031],
      country: 'Việt Nam',
    },
  },
  {
    id: 'vn-quangngai',
    name: 'Quảng Ngãi (Dung Quất)',
    country: 'Việt Nam',
    isVietnam: true,
    coords: [15.1205, 108.7923],
    keywords: ['quang ngai', 'dung quat'],
    nearestAirport: {
      name: 'Sân bay Chu Lai (VCL Cargo)',
      coords: [15.4061, 108.7056],
      country: 'Việt Nam',
    },
  },
  {
    id: 'vn-phuyen',
    name: 'Phú Yên (Tuy Hòa)',
    country: 'Việt Nam',
    isVietnam: true,
    coords: [13.0882, 109.3083],
    keywords: ['phu yen', 'tuy hoa', 'song cau'],
    nearestAirport: {
      name: 'Sân bay Tuy Hòa (TBB)',
      coords: [13.0489, 109.3339],
      country: 'Việt Nam',
    },
  },
  {
    id: 'vn-gialai',
    name: 'Gia Lai (Pleiku)',
    country: 'Việt Nam',
    isVietnam: true,
    coords: [13.9833, 108.0],
    keywords: ['gia lai', 'pleiku', 'an khe'],
    nearestAirport: {
      name: 'Sân bay Pleiku (PXU)',
      coords: [14.0044, 108.0169],
      country: 'Việt Nam',
    },
  },
  {
    id: 'vn-kontum',
    name: 'Kon Tum (Cửa khẩu Bờ Y)',
    country: 'Việt Nam',
    isVietnam: true,
    coords: [14.35, 108.0],
    keywords: ['kon tum', 'dak ha', 'ngoc hoi', 'bo y'],
    nearestAirport: {
      name: 'Sân bay Pleiku (PXU)',
      coords: [14.0044, 108.0169],
      country: 'Việt Nam',
    },
  },
  {
    id: 'vn-daknong',
    name: 'Đắk Nông (Gia Nghĩa)',
    country: 'Việt Nam',
    isVietnam: true,
    coords: [12.0, 107.6833],
    keywords: ['dak nong', 'gia nghia'],
    nearestAirport: {
      name: 'Sân bay Buôn Ma Thuột (BMV)',
      coords: [12.6683, 108.12],
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
    keywords: ['singapore', 'sing', 'singapor', 'kranji', 'singapore turf club', 'tuas', 'woodlands', 'changi'],
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
    keywords: ['bangkok', 'thai lan', 'thailand', 'bkk', 'suvarnabhumi', 'royal bangkok', 'royal bangkok sports club'],
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
    keywords: ['nuoc lao', 'laos', 'vientiane', 'vieng chan'],
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
    country: 'Hồng Kông',
    isVietnam: false,
    coords: [22.4003, 114.2046],
    keywords: ['hong kong', 'hongkong', 'sha tin', 'happy valley', 'hong kong jockey club'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Hồng Kông (HKG Equine Center)',
      coords: [22.308, 113.9185],
      country: 'Hồng Kông',
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
      name: 'Sân bay Quốc tế Haneda (HND Cargo), Tokyo',
      coords: [35.5494, 139.7798],
      country: 'Nhật Bản',
    },
  },
  {
    id: 'intl-japan-osaka',
    name: 'Hanshin / Osaka Equestrian Hub (Nhật Bản)',
    country: 'Nhật Bản',
    isVietnam: false,
    coords: [34.6937, 135.5023],
    keywords: ['osaka', 'kansai', 'hanshin', 'kyoto'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Kansai (KIX Cargo), Osaka',
      coords: [34.4347, 135.244],
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
      name: 'Sân bay Quốc tế Incheon (ICN Cargo)',
      coords: [37.4602, 126.4407],
      country: 'Hàn Quốc',
    },
  },

  // --- QUỐC TẾ: UAE / QATAR / Ả RẬP XÊ ÚT ---
  {
    id: 'intl-dubai',
    name: 'Meydan Racecourse (Dubai, UAE)',
    country: 'UAE',
    isVietnam: false,
    coords: [25.156, 55.302],
    keywords: ['dubai', 'uae', 'meydan', 'abu dhabi'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Dubai (DXB Equine Cargo Terminal)',
      coords: [25.2532, 55.3657],
      country: 'UAE',
    },
  },
  {
    id: 'intl-qatar-doha',
    name: 'Al Shaqab / Doha Racing Club (Qatar)',
    country: 'Qatar',
    isVietnam: false,
    coords: [25.2854, 51.531],
    keywords: ['doha', 'qatar', 'al shaqab'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Hamad (DOH Equine Cargo), Doha',
      coords: [25.2731, 51.6081],
      country: 'Qatar',
    },
  },
  {
    id: 'intl-saudi-riyadh',
    name: 'King Abdulaziz Racecourse (Riyadh, Ả Rập Xê Út)',
    country: 'Ả Rập Xê Út',
    isVietnam: false,
    coords: [24.7136, 46.6753],
    keywords: ['riyadh', 'saudi', 'saudi arabia', 'saudi cup'],
    nearestAirport: {
      name: 'Sân bay Quốc tế King Khalid (RUH Cargo), Riyadh',
      coords: [24.9576, 46.6988],
      country: 'Ả Rập Xê Út',
    },
  },

  // --- QUỐC TẾ: ÚC ---
  {
    id: 'intl-australia-melbourne',
    name: 'Flemington Racecourse (Melbourne, Úc)',
    country: 'Úc',
    isVietnam: false,
    coords: [-37.7892, 144.9125],
    keywords: ['nuoc uc', 'chau uc', 'australia', 'melbourne', 'flemington', 'adelaide'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Melbourne (MEL Cargo), Úc',
      coords: [-37.669, 144.841],
      country: 'Úc',
    },
  },
  {
    id: 'intl-australia-sydney',
    name: 'Royal Randwick Racecourse (Sydney, Úc)',
    country: 'Úc',
    isVietnam: false,
    coords: [-33.9089, 151.2292],
    keywords: ['sydney', 'randwick', 'rosehill'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Sydney (SYD Equine Cargo), Úc',
      coords: [-33.9399, 151.1753],
      country: 'Úc',
    },
  },
  {
    id: 'intl-australia-brisbane',
    name: 'Eagle Farm Racecourse (Brisbane, Úc)',
    country: 'Úc',
    isVietnam: false,
    coords: [-27.4317, 153.0686],
    keywords: ['brisbane', 'eagle farm', 'gold coast'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Brisbane (BNE Cargo), Úc',
      coords: [-27.3842, 153.1175],
      country: 'Úc',
    },
  },
  {
    id: 'intl-australia-perth',
    name: 'Ascot Racecourse (Perth, Úc)',
    country: 'Úc',
    isVietnam: false,
    coords: [-31.9333, 115.9267],
    keywords: ['perth', 'ascot perth'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Perth (PER Cargo), Úc',
      coords: [-31.9403, 115.9669],
      country: 'Úc',
    },
  },

  // --- QUỐC TẾ: ẤN ĐỘ (INDIA) ---
  {
    id: 'intl-india-mumbai',
    name: 'Mahalaxmi Racecourse (Mumbai, Ấn Độ)',
    country: 'Ấn Độ',
    isVietnam: false,
    coords: [18.9827, 72.8223],
    keywords: ['india', 'an do', 'mumbai', 'bangalore', 'mahalaxmi', 'kolkata', 'hyderabad', 'chennai', 'pune'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Chhatrapati Shivaji (BOM Live Animal Facility), Mumbai',
      coords: [19.0896, 72.8656],
      country: 'Ấn Độ',
    },
  },
  {
    id: 'intl-india-delhi',
    name: 'Delhi Race Club (New Delhi, Ấn Độ)',
    country: 'Ấn Độ',
    isVietnam: false,
    coords: [28.6139, 77.209],
    keywords: ['delhi', 'new delhi'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Indira Gandhi (DEL Cargo), New Delhi',
      coords: [28.5562, 77.1],
      country: 'Ấn Độ',
    },
  },

  // --- QUỐC TẾ: BỈ (BELGIUM) ---
  {
    id: 'intl-belgium-brussels',
    name: 'Brussels Hippodrome / Wellington (Bỉ)',
    country: 'Bỉ',
    isVietnam: false,
    coords: [50.8503, 4.3517],
    keywords: ['belgium', 'nuoc bi', 'brussels', 'bruxelles', 'ostend', 'waregem', 'gent', 'antwerp'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Brussels (BRU Live Animal Cargo Hub)',
      coords: [50.901, 4.4856],
      country: 'Bỉ',
    },
  },

  // --- QUỐC TẾ: PHÁP (FRANCE) ---
  {
    id: 'intl-france-paris',
    name: 'Hippodrome de Longchamp (Paris, Pháp)',
    country: 'Pháp',
    isVietnam: false,
    coords: [48.8584, 2.2355],
    keywords: ['france', 'phap', 'paris', 'longchamp', 'chantilly', 'deauville'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Charles de Gaulle (CDG Cargo), Pháp',
      coords: [49.0097, 2.5479],
      country: 'Pháp',
    },
  },

  // --- QUỐC TẾ: ANH QUỐC (UK) ---
  {
    id: 'intl-uk-newmarket',
    name: 'Newmarket Racecourse (Anh Quốc)',
    country: 'Vương quốc Anh',
    isVietnam: false,
    coords: [52.2458, 0.4037],
    keywords: ['england', 'britain', 'nuoc anh', 'vuong quoc anh', 'london', 'newmarket', 'ascot', 'heathrow', 'stansted'],
    nearestAirport: {
      name: 'Sân bay Quốc tế London Stansted (STN Equine Hub), Anh',
      coords: [51.886, 0.2389],
      country: 'Vương quốc Anh',
    },
  },

  // --- QUỐC TẾ: MỸ (USA) ---
  {
    id: 'intl-usa-kentucky',
    name: 'Churchill Downs (Louisville, Kentucky, Mỹ)',
    country: 'Hoa Kỳ',
    isVietnam: false,
    coords: [38.2031, -85.7699],
    keywords: ['nuoc my', 'hoa ky', 'united states', 'america', 'kentucky', 'louisville', 'lexington', 'california', 'new york'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Louisville (SDF Worldport Cargo), Mỹ',
      coords: [38.1744, -85.736],
      country: 'Hoa Kỳ',
    },
  },

  // --- QUỐC TẾ: TRUNG QUỐC (CHINA) ---
  {
    id: 'intl-china-shanghai',
    name: 'Trung tâm Đua ngựa Quốc tế Thượng Hải (Trung Quốc)',
    country: 'Trung Quốc',
    isVietnam: false,
    coords: [31.2304, 121.4737],
    keywords: ['china', 'trung quoc', 'shanghai', 'thuong hai', 'hong kong border'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Phố Đông Thượng Hải (PVG Cargo)',
      coords: [31.1443, 121.8083],
      country: 'Trung Quốc',
    },
  },
  {
    id: 'intl-china-beijing',
    name: 'Beijing Equestrian Center (Bắc Kinh, Trung Quốc)',
    country: 'Trung Quốc',
    isVietnam: false,
    coords: [39.9042, 116.4074],
    keywords: ['beijing', 'bac kinh'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Thủ Đô Bắc Kinh (PEK Cargo)',
      coords: [40.0799, 116.6031],
      country: 'Trung Quốc',
    },
  },
  {
    id: 'intl-china-guangzhou',
    name: 'Conghua Equine Center (Quảng Châu, Trung Quốc)',
    country: 'Trung Quốc',
    isVietnam: false,
    coords: [23.1291, 113.2644],
    keywords: ['guangzhou', 'quang chau', 'congshua', 'conghua'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Bạch Vân Quảng Châu (CAN Cargo)',
      coords: [23.3924, 113.2988],
      country: 'Trung Quốc',
    },
  },

  // --- QUỐC TẾ: INDONESIA ---
  {
    id: 'intl-indonesia-kalimantan',
    name: 'Khu Quản lý Vận chuyển Ngựa Kalimantan (Indonesia)',
    country: 'Indonesia',
    isVietnam: false,
    coords: [-1.4996, 113.2903],
    keywords: ['kalimantan', 'borneo', 'tengah', 'selatan', 'timur', 'barat', 'banjarmasin', 'samarinda', 'balikpapan', 'palangkaraya', 'pontianak'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Syamsudin Noor (BDJ Cargo), Kalimantan',
      coords: [-3.4474, 114.7578],
      country: 'Indonesia',
    },
  },
  {
    id: 'intl-indonesia-jakarta',
    name: 'Trường đua Jakarta International Equestrian Park (Indonesia)',
    country: 'Indonesia',
    isVietnam: false,
    coords: [-6.1837, 106.8833],
    keywords: ['indonesia', 'jakarta', 'pulomas', 'java', 'bali', 'surabaya', 'medan', 'bandung', 'indo'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Soekarno-Hatta (CGK Cargo), Jakarta',
      coords: [-6.1256, 106.6559],
      country: 'Indonesia',
    },
  },
];

/**
 * Helper to match keyword with whole-word boundary check for short terms (<= 4 chars)
 * Prevents "thực nghiệm" matching "uc", "mỹ tho" matching "my" (Mỹ), "biên hòa" matching "bi" (Bỉ)
 */
function matchesKeyword(text: string, kw: string): boolean {
  if (kw.length <= 4) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(^|[\\s.,;/-])${escaped}([\\s.,;/-]|$)`, 'i');
    return regex.test(text);
  }
  return text.includes(kw);
}

function matchBestLocation(text: string, candidateLocations: KnownLocation[]): KnownLocation | null {
  if (!text) return null;
  let bestMatch: KnownLocation | null = null;
  let highestScore = 0;

  for (const loc of candidateLocations) {
    for (const kw of loc.keywords) {
      if (matchesKeyword(text, kw)) {
        const score = kw.length; // Longer matching keywords take priority within the same segment
        if (score > highestScore) {
          highestScore = score;
          bestMatch = loc;
        }
      }
    }
  }

  return bestMatch;
}

/**
 * Resolve any arbitrary input text to a KnownLocation using fuzzy keyword matching
 */
export function resolveLocation(
  rawText: string,
  fallbackDefaultId = 'vn-hcm-cuchi',
  forceDomesticOnly = false
): KnownLocation {
  if (!rawText || !rawText.trim()) {
    return KNOWN_LOCATIONS.find((l) => l.id === fallbackDefaultId)!;
  }

  const normalized = normalizeVietnamese(rawText);

  // If user selected domestic scope, only search among Vietnam locations
  const candidateLocations = KNOWN_LOCATIONS.filter((loc) => {
    if (forceDomesticOnly) return loc.isVietnam;
    return true;
  });

  // 1. Prioritize earlier comma-separated segments ("City, Province/Country") before full text
  const segments = rawText
    .split(',')
    .map((s) => normalizeVietnamese(s))
    .filter(Boolean);

  let bestMatch: KnownLocation | null = null;
  for (const seg of segments) {
    bestMatch = matchBestLocation(seg, candidateLocations);
    if (bestMatch) break;
  }
  if (!bestMatch) {
    bestMatch = matchBestLocation(normalized, candidateLocations);
  }

  if (bestMatch) {
    return {
      ...bestMatch,
      name: formatLocationDisplayName(rawText, bestMatch.country),
    };
  }

  // 2. Fallback heuristic: check if contains country words (only when not forced domestic)
  if (!forceDomesticOnly) {
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
  }

  // Default to Vietnam Stable with custom label
  const defaultVn =
    candidateLocations.find((l) => l.id === fallbackDefaultId) ||
    candidateLocations[0] ||
    KNOWN_LOCATIONS.find((l) => l.id === 'vn-hcm-cuchi')!;

  return {
    ...defaultVn,
    name: formatLocationDisplayName(rawText, defaultVn.country),
  };
}

export interface GeocodedLocation {
  coords: [number, number];
  displayName: string;
  country: string;
  countryCode?: string;
  state?: string;
}

export interface AddressSuggestion {
  id: string;
  primaryLabel: string;
  secondaryLabel: string;
  fullAddress: string;
  category: 'city' | 'address' | 'airport' | 'place';
  geo: GeocodedLocation;
}

export function formatLocationDisplayName(rawText: string, country?: string): string {
  const trimmed = String(rawText || '').trim();
  if (!trimmed) return country || '';
  if (!country) return trimmed;

  const normText = normalizeVietnamese(trimmed);
  const normCountry = normalizeVietnamese(country);
  if (normCountry && normText.includes(normCountry)) {
    return trimmed;
  }

  const countryAliases: Record<string, string[]> = {
    'viet nam': ['vietnam', 'viet nam'],
    'hoa ky': ['usa', 'united states', 'america'],
    'vuong quoc anh': ['uk', 'united kingdom', 'england', 'britain'],
    'trung quoc': ['china'],
    'nhat ban': ['japan'],
    'han quoc': ['korea', 'south korea'],
    'thai lan': ['thailand'],
    'campuchia': ['cambodia'],
    'lao': ['laos'],
    'an do': ['india'],
    'uc': ['australia'],
    'phap': ['france'],
    'duc': ['germany', 'deutschland'],
    'ha lan': ['netherlands'],
    'bi': ['belgium'],
    'y': ['italy'],
    'tay ban nha': ['spain'],
    'thuy si': ['switzerland'],
    'ao': ['austria'],
    'tho nhi ky': ['turkey', 'turkiye'],
    'a rap xe ut': ['saudi arabia'],
    'hong kong': ['hong kong'],
    'dai loan': ['taiwan'],
  };

  const aliases = countryAliases[normCountry] || [];
  if (aliases.some((alias) => matchesKeyword(normText, alias))) {
    return trimmed;
  }

  return `${trimmed} (${country})`;
}

/**
 * Standardize international country names into friendly Vietnamese conventions
 */
export function normalizeCountryName(countryName?: string, countryCode?: string): string {
  const code = (countryCode || '').toUpperCase();
  const c = (countryName || '').toLowerCase().trim();

  if (code === 'VN' || c.includes('vietnam') || c.includes('việt nam') || c === 'việt nam') return 'Việt Nam';
  if (code === 'MY' || c.includes('malaysia')) return 'Malaysia';
  if (code === 'SG' || c.includes('singapore')) return 'Singapore';
  if (code === 'TH' || c.includes('thailand') || c.includes('thái lan')) return 'Thái Lan';
  if (code === 'KH' || c.includes('cambodia') || c.includes('campuchia')) return 'Campuchia';
  if (code === 'LA' || c.includes('laos') || c.includes('lào')) return 'Lào';
  if (code === 'MM' || c.includes('myanmar') || c.includes('burma')) return 'Myanmar';
  if (code === 'BN' || c.includes('brunei')) return 'Brunei';
  if (code === 'ID' || c.includes('indonesia')) return 'Indonesia';
  if (code === 'PH' || c.includes('philippines')) return 'Philippines';
  if (code === 'HK' || c.includes('hong kong') || c.includes('hồng kông')) return 'Hồng Kông';
  if (code === 'TW' || c.includes('taiwan') || c.includes('đài loan')) return 'Đài Loan';
  if (code === 'CN' || c.includes('china') || c.includes('trung quốc') || c.includes('trung quoc')) return 'Trung Quốc';
  if (code === 'JP' || c.includes('japan') || c.includes('nhật bản')) return 'Nhật Bản';
  if (code === 'KR' || c.includes('korea') || c.includes('hàn quốc')) return 'Hàn Quốc';
  if (code === 'IN' || c.includes('india') || c.includes('ấn độ')) return 'Ấn Độ';
  if (code === 'AE' || c === 'uae' || c.includes('united arab emirates') || c.includes('tiểu vương quốc ả rập')) return 'UAE';
  if (code === 'QA' || c.includes('qatar')) return 'Qatar';
  if (code === 'SA' || c.includes('saudi arabia') || c.includes('ả rập xê út')) return 'Ả Rập Xê Út';
  if (code === 'KW' || c.includes('kuwait')) return 'Kuwait';
  if (code === 'BH' || c.includes('bahrain')) return 'Bahrain';
  if (code === 'OM' || c.includes('oman')) return 'Oman';
  if (code === 'AU' || c.includes('australia') || c === 'úc' || c.includes('nước úc')) return 'Úc';
  if (code === 'NZ' || c.includes('new zealand')) return 'New Zealand';
  if (code === 'GB' || c.includes('united kingdom') || c === 'anh' || c.includes('vương quốc anh')) return 'Vương quốc Anh';
  if (code === 'IE' || c.includes('ireland') || c.includes('ai-len')) return 'Ireland';
  if (code === 'FR' || c.includes('france') || c.includes('pháp')) return 'Pháp';
  if (code === 'DE' || c.includes('germany') || c === 'đức' || c.includes('nước đức') || c.includes('deutschland')) return 'Đức';
  if (code === 'NL' || c.includes('netherlands') || c.includes('hà lan') || c.includes('nederland')) return 'Hà Lan';
  if (code === 'BE' || c.includes('belgium') || c === 'bỉ' || c.includes('nước bỉ') || c.includes('belgique')) return 'Bỉ';
  if (code === 'IT' || c.includes('italy') || c === 'ý' || c.includes('italia')) return 'Ý';
  if (code === 'ES' || c.includes('spain') || c.includes('tây ban nha') || c.includes('españa')) return 'Tây Ban Nha';
  if (code === 'CH' || c.includes('switzerland') || c.includes('thụy sĩ') || c.includes('schweiz')) return 'Thụy Sĩ';
  if (code === 'AT' || c.includes('austria') || c === 'áo' || c.includes('österreich')) return 'Áo';
  if (code === 'TR' || c.includes('turkey') || c.includes('türkiye') || c.includes('thổ nhĩ kỳ')) return 'Thổ Nhĩ Kỳ';
  if (code === 'US' || c.includes('united states') || c.includes('hoa kỳ') || c === 'mỹ') return 'Hoa Kỳ';
  if (code === 'CA' || c.includes('canada')) return 'Canada';

  return countryName || 'Quốc tế';
}

export interface EquineAirportHub {
  name: string;
  coords: [number, number];
  country: string;
  code?: string;
  isInternational?: boolean;
  isIsland?: boolean;
  islandKeywords?: string[];
}

export const VIETNAM_AIRPORTS: EquineAirportHub[] = [
  // International Airports
  { name: 'Sân bay Quốc tế Tân Sơn Nhất (SGN Cargo)', coords: [10.8185, 106.6588], country: 'Việt Nam', code: 'SGN', isInternational: true },
  { name: 'Sân bay Quốc tế Nội Bài (HAN Cargo)', coords: [21.2212, 105.8072], country: 'Việt Nam', code: 'HAN', isInternational: true },
  { name: 'Sân bay Quốc tế Đà Nẵng (DAD Cargo)', coords: [16.0439, 108.1994], country: 'Việt Nam', code: 'DAD', isInternational: true },
  { name: 'Sân bay Quốc tế Cam Ranh (CXR Cargo)', coords: [11.9982, 109.2194], country: 'Việt Nam', code: 'CXR', isInternational: true },
  { name: 'Sân bay Quốc tế Phú Quốc (PQC Cargo)', coords: [10.1698, 103.9931], country: 'Việt Nam', code: 'PQC', isInternational: true, isIsland: true, islandKeywords: ['phu quoc', 'duong dong', 'an thoi'] },
  { name: 'Sân bay Quốc tế Cần Thơ (VCA Cargo)', coords: [10.0851, 105.7119], country: 'Việt Nam', code: 'VCA', isInternational: true },
  { name: 'Sân bay Quốc tế Cát Bi - Hải Phòng (HPH Cargo)', coords: [20.8194, 106.7247], country: 'Việt Nam', code: 'HPH', isInternational: true },
  { name: 'Sân bay Quốc tế Vân Đồn - Quảng Ninh (VDO)', coords: [21.1189, 107.4144], country: 'Việt Nam', code: 'VDO', isInternational: true },
  { name: 'Sân bay Quốc tế Phú Bài - Huế (HUI Cargo)', coords: [16.4008, 107.7031], country: 'Việt Nam', code: 'HUI', isInternational: true },
  { name: 'Sân bay Quốc tế Vinh (VII Cargo)', coords: [18.7278, 105.6706], country: 'Việt Nam', code: 'VII', isInternational: true },
  { name: 'Sân bay Liên Khương - Đà Lạt (DLI Cargo)', coords: [11.7503, 108.3711], country: 'Việt Nam', code: 'DLI', isInternational: true },
  // Domestic Airports
  { name: 'Sân bay Phù Cát - Quy Nhơn (UIH)', coords: [13.955, 109.0422], country: 'Việt Nam', code: 'UIH', isInternational: false },
  { name: 'Sân bay Thọ Xuân - Thanh Hóa (THD)', coords: [19.9015, 105.4674], country: 'Việt Nam', code: 'THD', isInternational: false },
  { name: 'Sân bay Buôn Ma Thuột (BMV)', coords: [12.6683, 108.12], country: 'Việt Nam', code: 'BMV', isInternational: false },
  { name: 'Sân bay Pleiku (PXU)', coords: [14.0044, 108.0169], country: 'Việt Nam', code: 'PXU', isInternational: false },
  { name: 'Sân bay Chu Lai - Quảng Nam (VCL)', coords: [15.4061, 108.7056], country: 'Việt Nam', code: 'VCL', isInternational: false },
  { name: 'Sân bay Tuy Hòa - Phú Yên (TBB)', coords: [13.0489, 109.3339], country: 'Việt Nam', code: 'TBB', isInternational: false },
  { name: 'Sân bay Đồng Hới - Quảng Bình (VDH)', coords: [17.515, 106.5906], country: 'Việt Nam', code: 'VDH', isInternational: false },
  { name: 'Sân bay Côn Đảo (VCS)', coords: [8.7319, 106.6289], country: 'Việt Nam', code: 'VCS', isInternational: false, isIsland: true, islandKeywords: ['con dao', 'co ong'] },
  { name: 'Sân bay Cà Mau (CAH)', coords: [9.1756, 105.1794], country: 'Việt Nam', code: 'CAH', isInternational: false },
  { name: 'Sân bay Rạch Giá - Kiên Giang (VKG)', coords: [9.9597, 105.1322], country: 'Việt Nam', code: 'VKG', isInternational: false },
  { name: 'Sân bay Điện Biên Phủ (DIN)', coords: [21.3975, 103.0081], country: 'Việt Nam', code: 'DIN', isInternational: false },
];

export const INTERNATIONAL_EQUINE_AIRPORTS: EquineAirportHub[] = [
  // --- INDONESIA ---
  { name: 'Sân bay Quốc tế Syamsudin Noor (BDJ Cargo), Kalimantan', coords: [-3.4474, 114.7578], country: 'Indonesia', code: 'BDJ' },
  { name: 'Sân bay Quốc tế Sultan Aji Muhammad Sulaiman (BPN Cargo), Balikpapan', coords: [-1.2683, 116.8944], country: 'Indonesia', code: 'BPN' },
  { name: 'Sân bay Supadio (PNK Cargo), Pontianak', coords: [-0.1507, 109.4039], country: 'Indonesia', code: 'PNK' },
  { name: 'Sân bay Quốc tế Soekarno-Hatta (CGK Cargo), Jakarta', coords: [-6.1256, 106.6559], country: 'Indonesia', code: 'CGK' },
  { name: 'Sân bay Quốc tế Ngurah Rai (DPS Cargo), Bali', coords: [-8.7482, 115.1672], country: 'Indonesia', code: 'DPS' },
  { name: 'Sân bay Quốc tế Juanda (SUB Cargo), Surabaya', coords: [-7.3798, 112.7876], country: 'Indonesia', code: 'SUB' },
  { name: 'Sân bay Quốc tế Kualanamu (KNO Cargo), Medan', coords: [3.6422, 98.8853], country: 'Indonesia', code: 'KNO' },
  { name: 'Sân bay Quốc tế Sultan Hasanuddin (UPG Cargo), Makassar', coords: [-5.0616, 119.554], country: 'Indonesia', code: 'UPG' },
  { name: 'Sân bay Quốc tế Yogyakarta (YIA Cargo)', coords: [-7.9006, 110.0569], country: 'Indonesia', code: 'YIA' },
  // --- SINGAPORE ---
  { name: 'Sân bay Quốc tế Changi (SIN Live Animal Cargo Hub)', coords: [1.3644, 103.9915], country: 'Singapore', code: 'SIN' },
  // --- MALAYSIA ---
  { name: 'Sân bay Quốc tế Kuala Lumpur (KUL Cargo Hub)', coords: [2.7456, 101.7099], country: 'Malaysia', code: 'KUL' },
  { name: 'Sân bay Quốc tế Penang (PEN Cargo)', coords: [5.2971, 100.2768], country: 'Malaysia', code: 'PEN' },
  { name: 'Sân bay Quốc tế Senai (JHB Cargo), Johor Bahru', coords: [1.6413, 103.6696], country: 'Malaysia', code: 'JHB' },
  { name: 'Sân bay Quốc tế Kota Kinabalu (BKI Cargo)', coords: [5.9372, 116.0512], country: 'Malaysia', code: 'BKI' },
  { name: 'Sân bay Quốc tế Kuching (KCH Cargo)', coords: [1.4847, 110.3469], country: 'Malaysia', code: 'KCH' },
  // --- THÁI LAN ---
  { name: 'Sân bay Quốc tế Suvarnabhumi (BKK Cargo Hub)', coords: [13.69, 100.7501], country: 'Thái Lan', code: 'BKK' },
  { name: 'Sân bay Quốc tế Chiang Mai (CNX Cargo)', coords: [18.7668, 98.9626], country: 'Thái Lan', code: 'CNX' },
  { name: 'Sân bay Quốc tế Phuket (HKT Cargo)', coords: [8.1132, 98.3169], country: 'Thái Lan', code: 'HKT' },
  { name: 'Sân bay Quốc tế Hat Yai (HDY Cargo)', coords: [6.9332, 100.393], country: 'Thái Lan', code: 'HDY' },
  { name: 'Sân bay Quốc tế Udon Thani (UTH Cargo)', coords: [17.3864, 102.7883], country: 'Thái Lan', code: 'UTH' },
  { name: 'Sân bay Quốc tế U-Tapao (UTP Cargo), Pattaya', coords: [12.6799, 101.005], country: 'Thái Lan', code: 'UTP' },
  // --- CAMPUCHIA / LÀO / PHILIPPINES / MYANMAR / BRUNEI ---
  { name: 'Sân bay Quốc tế Phnom Penh (PNH Cargo)', coords: [11.5466, 104.8441], country: 'Campuchia', code: 'PNH' },
  { name: 'Sân bay Quốc tế Siem Reap Angkor (SAI Cargo)', coords: [13.3712, 104.2215], country: 'Campuchia', code: 'SAI' },
  { name: 'Sân bay Quốc tế Sihanoukville (KOS Cargo)', coords: [10.5797, 103.6368], country: 'Campuchia', code: 'KOS' },
  { name: 'Sân bay Quốc tế Wattay (VTE Cargo), Vientiane', coords: [17.9883, 102.5633], country: 'Lào', code: 'VTE' },
  { name: 'Sân bay Quốc tế Luang Prabang (LPQ Cargo)', coords: [19.8973, 102.1608], country: 'Lào', code: 'LPQ' },
  { name: 'Sân bay Quốc tế Pakse (PKZ Cargo)', coords: [15.1321, 105.7814], country: 'Lào', code: 'PKZ' },
  { name: 'Sân bay Quốc tế Ninoy Aquino (MNL Cargo), Manila', coords: [14.5086, 121.0194], country: 'Philippines', code: 'MNL' },
  { name: 'Sân bay Quốc tế Mactan-Cebu (CEB Cargo)', coords: [10.3075, 123.9794], country: 'Philippines', code: 'CEB' },
  { name: 'Sân bay Quốc tế Francisco Bangoy (DVO Cargo), Davao', coords: [7.1255, 125.6458], country: 'Philippines', code: 'DVO' },
  { name: 'Sân bay Quốc tế Yangon (RGN Cargo)', coords: [16.9073, 96.1332], country: 'Myanmar', code: 'RGN' },
  { name: 'Sân bay Quốc tế Brunei (BWN Cargo)', coords: [4.9442, 114.9284], country: 'Brunei', code: 'BWN' },
  // --- HỒNG KÔNG / ĐÀI LOAN / TRUNG QUỐC ---
  { name: 'Sân bay Quốc tế Hồng Kông (HKG Equine Center)', coords: [22.308, 113.9185], country: 'Hồng Kông', code: 'HKG' },
  { name: 'Sân bay Quốc tế Đào Viên (TPE Cargo), Đài Bắc', coords: [25.0797, 121.2342], country: 'Đài Loan', code: 'TPE' },
  { name: 'Sân bay Quốc tế Cao Hùng (KHH Cargo)', coords: [22.5771, 120.35], country: 'Đài Loan', code: 'KHH' },
  { name: 'Sân bay Quốc tế Thủ Đô Bắc Kinh (PEK Cargo)', coords: [40.0799, 116.6031], country: 'Trung Quốc', code: 'PEK' },
  { name: 'Sân bay Quốc tế Phố Đông Thượng Hải (PVG Cargo)', coords: [31.1443, 121.8083], country: 'Trung Quốc', code: 'PVG' },
  { name: 'Sân bay Quốc tế Bạch Vân Quảng Châu (CAN Cargo)', coords: [23.3924, 113.2988], country: 'Trung Quốc', code: 'CAN' },
  { name: 'Sân bay Quốc tế Bảo An Thâm Quyến (SZX Cargo)', coords: [22.6393, 113.8107], country: 'Trung Quốc', code: 'SZX' },
  { name: 'Sân bay Quốc tế Song Lưu Thành Đô (CTU Cargo)', coords: [30.5785, 103.9471], country: 'Trung Quốc', code: 'CTU' },
  { name: 'Sân bay Quốc tế Giang Bắc Trùng Khánh (CKG Cargo)', coords: [29.7192, 106.6417], country: 'Trung Quốc', code: 'CKG' },
  { name: 'Sân bay Quốc tế Trường Thủy Côn Minh (KMG Cargo)', coords: [25.1019, 102.9292], country: 'Trung Quốc', code: 'KMG' },
  { name: 'Sân bay Quốc tế Hàm Dương Tây An (XIY Cargo)', coords: [34.4471, 108.7516], country: 'Trung Quốc', code: 'XIY' },
  { name: 'Sân bay Quốc tế Tiêu Sơn Hàng Châu (HGH Cargo)', coords: [30.2295, 120.4344], country: 'Trung Quốc', code: 'HGH' },
  { name: 'Sân bay Quốc tế Ngô Vu Nam Ninh (NNG Cargo)', coords: [22.6083, 108.1724], country: 'Trung Quốc', code: 'NNG' },
  // --- NHẬT BẢN / HÀN QUỐC ---
  { name: 'Sân bay Quốc tế Narita (NRT Cargo), Tokyo', coords: [35.772, 140.3929], country: 'Nhật Bản', code: 'NRT' },
  { name: 'Sân bay Quốc tế Haneda (HND Cargo), Tokyo', coords: [35.5494, 139.7798], country: 'Nhật Bản', code: 'HND' },
  { name: 'Sân bay Quốc tế Kansai (KIX Cargo), Osaka', coords: [34.4347, 135.244], country: 'Nhật Bản', code: 'KIX' },
  { name: 'Sân bay Quốc tế Chubu Centrair (NGO Cargo), Nagoya', coords: [34.8584, 136.8054], country: 'Nhật Bản', code: 'NGO' },
  { name: 'Sân bay Quốc tế Fukuoka (FUK Cargo)', coords: [33.5859, 130.4507], country: 'Nhật Bản', code: 'FUK' },
  { name: 'Sân bay Quốc tế New Chitose (CTS Cargo), Sapporo', coords: [42.7752, 141.6923], country: 'Nhật Bản', code: 'CTS' },
  { name: 'Sân bay Naha (OKA Cargo), Okinawa', coords: [26.1958, 127.6459], country: 'Nhật Bản', code: 'OKA' },
  { name: 'Sân bay Quốc tế Incheon (ICN Cargo), Seoul', coords: [37.4602, 126.4407], country: 'Hàn Quốc', code: 'ICN' },
  { name: 'Sân bay Quốc tế Gimhae (PUS Cargo), Busan', coords: [35.1795, 128.9382], country: 'Hàn Quốc', code: 'PUS' },
  { name: 'Sân bay Quốc tế Jeju (CJU Cargo)', coords: [33.5113, 126.493], country: 'Hàn Quốc', code: 'CJU' },
  // --- ẤN ĐỘ ---
  { name: 'Sân bay Quốc tế Indira Gandhi (DEL Cargo), New Delhi', coords: [28.5562, 77.1], country: 'Ấn Độ', code: 'DEL' },
  { name: 'Sân bay Quốc tế Chhatrapati Shivaji (BOM Cargo), Mumbai', coords: [19.0896, 72.8656], country: 'Ấn Độ', code: 'BOM' },
  { name: 'Sân bay Quốc tế Kempegowda (BLR Cargo), Bengaluru', coords: [13.1986, 77.7066], country: 'Ấn Độ', code: 'BLR' },
  { name: 'Sân bay Quốc tế Chennai (MAA Cargo)', coords: [12.9941, 80.1709], country: 'Ấn Độ', code: 'MAA' },
  { name: 'Sân bay Quốc tế Rajiv Gandhi (HYD Cargo), Hyderabad', coords: [17.2403, 78.4294], country: 'Ấn Độ', code: 'HYD' },
  { name: 'Sân bay Quốc tế Netaji Subhas Chandra Bose (CCU Cargo), Kolkata', coords: [22.6547, 88.4467], country: 'Ấn Độ', code: 'CCU' },
  // --- TRUNG ĐÔNG ---
  { name: 'Sân bay Quốc tế Dubai (DXB Equine Cargo Terminal)', coords: [25.2532, 55.3657], country: 'UAE', code: 'DXB' },
  { name: 'Sân bay Quốc tế Zayed Abu Dhabi (AUH Cargo)', coords: [24.433, 54.6511], country: 'UAE', code: 'AUH' },
  { name: 'Sân bay Quốc tế Hamad (DOH Equine Cargo), Doha', coords: [25.2731, 51.6081], country: 'Qatar', code: 'DOH' },
  { name: 'Sân bay Quốc tế King Khalid (RUH Cargo), Riyadh', coords: [24.9576, 46.6988], country: 'Ả Rập Xê Út', code: 'RUH' },
  { name: 'Sân bay Quốc tế King Abdulaziz (JED Cargo), Jeddah', coords: [21.6796, 39.1565], country: 'Ả Rập Xê Út', code: 'JED' },
  { name: 'Sân bay Quốc tế Kuwait (KWI Cargo)', coords: [29.2266, 47.9689], country: 'Kuwait', code: 'KWI' },
  { name: 'Sân bay Quốc tế Bahrain (BAH Cargo)', coords: [26.2708, 50.6336], country: 'Bahrain', code: 'BAH' },
  { name: 'Sân bay Quốc tế Muscat (MCT Cargo)', coords: [23.5933, 58.2844], country: 'Oman', code: 'MCT' },
  // --- ÚC / NEW ZEALAND ---
  { name: 'Sân bay Quốc tế Sydney (SYD Equine Cargo), Úc', coords: [-33.9399, 151.1753], country: 'Úc', code: 'SYD' },
  { name: 'Sân bay Quốc tế Melbourne (MEL Cargo), Úc', coords: [-37.669, 144.841], country: 'Úc', code: 'MEL' },
  { name: 'Sân bay Quốc tế Brisbane (BNE Cargo), Úc', coords: [-27.3842, 153.1175], country: 'Úc', code: 'BNE' },
  { name: 'Sân bay Quốc tế Perth (PER Cargo), Úc', coords: [-31.9403, 115.9669], country: 'Úc', code: 'PER' },
  { name: 'Sân bay Quốc tế Adelaide (ADL Cargo), Úc', coords: [-34.945, 138.5306], country: 'Úc', code: 'ADL' },
  { name: 'Sân bay Quốc tế Auckland (AKL Cargo), New Zealand', coords: [-37.0082, 174.785], country: 'New Zealand', code: 'AKL' },
  { name: 'Sân bay Quốc tế Christchurch (CHC Cargo), New Zealand', coords: [-43.4894, 172.5322], country: 'New Zealand', code: 'CHC' },
  // --- CHÂU ÂU ---
  { name: 'Sân bay Quốc tế Heathrow (LHR Animal Reception Centre), Anh', coords: [51.47, -0.4543], country: 'Vương quốc Anh', code: 'LHR' },
  { name: 'Sân bay Quốc tế London Stansted (STN Equine Hub), Anh', coords: [51.886, 0.2389], country: 'Vương quốc Anh', code: 'STN' },
  { name: 'Sân bay Quốc tế Manchester (MAN Cargo), Anh', coords: [53.3537, -2.275], country: 'Vương quốc Anh', code: 'MAN' },
  { name: 'Sân bay Quốc tế Edinburgh (EDI Cargo), Anh', coords: [55.9508, -3.3615], country: 'Vương quốc Anh', code: 'EDI' },
  { name: 'Sân bay Quốc tế Dublin (DUB Equine Cargo), Ireland', coords: [53.4264, -6.2499], country: 'Ireland', code: 'DUB' },
  { name: 'Sân bay Quốc tế Charles de Gaulle (CDG Cargo), Paris, Pháp', coords: [49.0097, 2.5479], country: 'Pháp', code: 'CDG' },
  { name: 'Sân bay Lyon-Saint-Exupéry (LYS Cargo), Pháp', coords: [45.7256, 5.0811], country: 'Pháp', code: 'LYS' },
  { name: 'Sân bay Nice Côte d\'Azur (NCE Cargo), Pháp', coords: [43.6584, 7.2159], country: 'Pháp', code: 'NCE' },
  { name: 'Sân bay Quốc tế Frankfurt (FRA Animal Lounge Hub), Đức', coords: [50.0379, 8.5622], country: 'Đức', code: 'FRA' },
  { name: 'Sân bay Quốc tế Munich (MUC Cargo), Đức', coords: [48.3537, 11.775], country: 'Đức', code: 'MUC' },
  { name: 'Sân bay Quốc tế Berlin Brandenburg (BER Cargo), Đức', coords: [52.3667, 13.5033], country: 'Đức', code: 'BER' },
  { name: 'Sân bay Quốc tế Hamburg (HAM Cargo), Đức', coords: [53.6304, 9.9882], country: 'Đức', code: 'HAM' },
  { name: 'Sân bay Quốc tế Schiphol (AMS Animal Hotel), Amsterdam, Hà Lan', coords: [52.3105, 4.7683], country: 'Hà Lan', code: 'AMS' },
  { name: 'Sân bay Quốc tế Brussels (BRU Live Animal Cargo Hub), Bỉ', coords: [50.901, 4.4856], country: 'Bỉ', code: 'BRU' },
  { name: 'Sân bay Hàng hóa Liège (LGG Horse Inn), Bỉ', coords: [50.6374, 5.4432], country: 'Bỉ', code: 'LGG' },
  { name: 'Sân bay Quốc tế Milan Malpensa (MXP Cargo), Ý', coords: [45.6301, 8.7255], country: 'Ý', code: 'MXP' },
  { name: 'Sân bay Quốc tế Rome Fiumicino (FCO Cargo), Ý', coords: [41.8003, 12.2389], country: 'Ý', code: 'FCO' },
  { name: 'Sân bay Quốc tế Adolfo Suárez Madrid-Barajas (MAD Cargo), Tây Ban Nha', coords: [40.4983, -3.5676], country: 'Tây Ban Nha', code: 'MAD' },
  { name: 'Sân bay Quốc tế Barcelona-El Prat (BCN Cargo), Tây Ban Nha', coords: [41.2974, 2.0833], country: 'Tây Ban Nha', code: 'BCN' },
  { name: 'Sân bay Quốc tế Zurich (ZRH Cargo), Thụy Sĩ', coords: [47.4647, 8.5492], country: 'Thụy Sĩ', code: 'ZRH' },
  { name: 'Sân bay Quốc tế Vienna (VIE Cargo), Áo', coords: [48.1103, 16.5697], country: 'Áo', code: 'VIE' },
  { name: 'Sân bay Quốc tế Istanbul (IST Live Animal Hub), Thổ Nhĩ Kỳ', coords: [41.2753, 28.7519], country: 'Thổ Nhĩ Kỳ', code: 'IST' },
  // --- BẮC MỸ ---
  { name: 'Sân bay Quốc tế JFK The ARK Live Animals Hub, New York, Mỹ', coords: [40.6413, -73.7781], country: 'Hoa Kỳ', code: 'JFK' },
  { name: 'Sân bay Quốc tế Los Angeles (LAX Cargo), Mỹ', coords: [33.9416, -118.4085], country: 'Hoa Kỳ', code: 'LAX' },
  { name: 'Sân bay Quốc tế Louisville (SDF Worldport Cargo), Mỹ', coords: [38.1744, -85.736], country: 'Hoa Kỳ', code: 'SDF' },
  { name: 'Sân bay Quốc tế O\'Hare (ORD Cargo), Chicago, Mỹ', coords: [41.9742, -87.9073], country: 'Hoa Kỳ', code: 'ORD' },
  { name: 'Sân bay Quốc tế Miami (MIA Live Animal Cargo), Mỹ', coords: [25.7959, -80.287], country: 'Hoa Kỳ', code: 'MIA' },
  { name: 'Sân bay Quốc tế Dallas/Fort Worth (DFW Cargo), Mỹ', coords: [32.8998, -97.0403], country: 'Hoa Kỳ', code: 'DFW' },
  { name: 'Sân bay Quốc tế San Francisco (SFO Cargo), Mỹ', coords: [37.6213, -122.379], country: 'Hoa Kỳ', code: 'SFO' },
  { name: 'Sân bay Quốc tế Seattle-Tacoma (SEA Cargo), Mỹ', coords: [47.4502, -122.3088], country: 'Hoa Kỳ', code: 'SEA' },
  { name: 'Sân bay Quốc tế Hartsfield-Jackson (ATL Cargo), Atlanta, Mỹ', coords: [33.6407, -84.4277], country: 'Hoa Kỳ', code: 'ATL' },
  { name: 'Sân bay Quốc tế Logan (BOS Cargo), Boston, Mỹ', coords: [42.3656, -71.0096], country: 'Hoa Kỳ', code: 'BOS' },
  { name: 'Sân bay Quốc tế Dulles (IAD Cargo), Washington D.C., Mỹ', coords: [38.9531, -77.4565], country: 'Hoa Kỳ', code: 'IAD' },
  { name: 'Sân bay Quốc tế Toronto Pearson (YYZ Cargo), Canada', coords: [43.6777, -79.6248], country: 'Canada', code: 'YYZ' },
  { name: 'Sân bay Quốc tế Vancouver (YVR Cargo), Canada', coords: [49.1967, -123.1815], country: 'Canada', code: 'YVR' },
  { name: 'Sân bay Quốc tế Montréal-Trudeau (YUL Cargo), Canada', coords: [45.4706, -73.7408], country: 'Canada', code: 'YUL' },
];

const AIRPORT_KEYWORD_ALIASES: Array<{ keywords: string[]; code: string }> = [
  { keywords: ['tan son nhat'], code: 'SGN' },
  { keywords: ['noi bai'], code: 'HAN' },
  { keywords: ['da nang'], code: 'DAD' },
  { keywords: ['cam ranh'], code: 'CXR' },
  { keywords: ['phu quoc'], code: 'PQC' },
  { keywords: ['can tho'], code: 'VCA' },
  { keywords: ['cat bi'], code: 'HPH' },
  { keywords: ['van don'], code: 'VDO' },
  { keywords: ['phu bai'], code: 'HUI' },
  { keywords: ['lien khuong'], code: 'DLI' },
  { keywords: ['phu cat'], code: 'UIH' },
  { keywords: ['tho xuan'], code: 'THD' },
  { keywords: ['buon ma thuot'], code: 'BMV' },
  { keywords: ['pleiku'], code: 'PXU' },
  { keywords: ['chu lai'], code: 'VCL' },
  { keywords: ['tuy hoa'], code: 'TBB' },
  { keywords: ['dong hoi'], code: 'VDH' },
  { keywords: ['con dao'], code: 'VCS' },
  { keywords: ['rach gia'], code: 'VKG' },
  { keywords: ['changi'], code: 'SIN' },
  { keywords: ['suvarnabhumi'], code: 'BKK' },
  { keywords: ['klia'], code: 'KUL' },
  { keywords: ['narita'], code: 'NRT' },
  { keywords: ['haneda'], code: 'HND' },
  { keywords: ['kansai'], code: 'KIX' },
  { keywords: ['incheon'], code: 'ICN' },
  { keywords: ['heathrow'], code: 'LHR' },
  { keywords: ['stansted'], code: 'STN' },
  { keywords: ['charles de gaulle'], code: 'CDG' },
  { keywords: ['syamsudin noor'], code: 'BDJ' },
  { keywords: ['soekarno hatta'], code: 'CGK' },
  { keywords: ['hamad'], code: 'DOH' },
];

function findExplicitAirportInText(text?: string | null): EquineAirportHub | null {
  if (!isAirportLocationText(text)) return null;
  const rawLower = String(text || '').toLowerCase();
  const normalized = normalizeVietnamese(String(text || ''));
  const allAirports = [...VIETNAM_AIRPORTS, ...INTERNATIONAL_EQUINE_AIRPORTS];

  const byIata = allAirports.find((a) => {
    const code = a.code?.toLowerCase();
    return code && (rawLower.includes(`(${code})`) || new RegExp(`\\b${code}\\s+cargo\\b`).test(normalized));
  });
  if (byIata) return byIata;

  const alias = AIRPORT_KEYWORD_ALIASES.find((entry) =>
    entry.keywords.some((kw) => normalized.includes(kw))
  );
  if (alias) {
    return allAirports.find((a) => a.code === alias.code) ?? null;
  }
  return null;
}

/**
 * Automatically determine the nearest major equine cargo airport by coordinate and country
 */
export function getNearestAirportForCoords(
  coords: [number, number],
  country?: string,
  options?: { internationalOnly?: boolean; locationText?: string }
) {
  const [lat, lng] = coords;
  const normalizedCountry = country ? normalizeCountryName(country) : '';
  const normalizedText = normalizeVietnamese(options?.locationText || '');

  // 1. Vietnam: evaluate nearest airport among all Vietnam airports (with island guard)
  const isWithinVietnamBox = !normalizedCountry && lat >= 8.3 && lat <= 23.5 && lng >= 102.0 && lng <= 109.8;
  if (normalizedCountry === 'Việt Nam' || isWithinVietnamBox) {
    const modePool = options?.internationalOnly
      ? VIETNAM_AIRPORTS.filter((a) => a.isInternational)
      : VIETNAM_AIRPORTS;

    const searchPool = modePool.filter((a) => {
      if (!a.isIsland) return true;
      if (calculateHaversine(coords, a.coords) <= 30) return true;
      return Boolean(a.islandKeywords?.some((kw) => normalizedText.includes(kw)));
    });

    const candidates = searchPool.length > 0 ? searchPool : VIETNAM_AIRPORTS;
    let closest = candidates[0];
    let minDistance = calculateHaversine(coords, closest.coords);
    for (let i = 1; i < candidates.length; i++) {
      const dist = calculateHaversine(coords, candidates[i].coords);
      if (dist < minDistance) {
        minDistance = dist;
        closest = candidates[i];
      }
    }

    return {
      name: closest.name,
      coords: closest.coords,
      country: closest.country,
    };
  }

  // 2. Filter by normalized country first if specified
  const countryCandidates = normalizedCountry
    ? INTERNATIONAL_EQUINE_AIRPORTS.filter(
        (a) =>
          normalizeCountryName(a.country).toLowerCase() === normalizedCountry.toLowerCase() ||
          normalizedCountry.toLowerCase().includes(a.country.toLowerCase())
      )
    : [];

  const searchPool =
    countryCandidates.length > 0
      ? countryCandidates
      : [...INTERNATIONAL_EQUINE_AIRPORTS, ...VIETNAM_AIRPORTS.filter((a) => a.isInternational)];

  // 3. Find closest airport by Haversine distance
  let closest = searchPool[0];
  let minDistance = calculateHaversine(coords, closest.coords);

  for (let i = 1; i < searchPool.length; i++) {
    const dist = calculateHaversine(coords, searchPool[i].coords);
    if (dist < minDistance) {
      minDistance = dist;
      closest = searchPool[i];
    }
  }

  return {
    name: closest.name,
    coords: closest.coords,
    country: closest.country,
  };
}

/**
 * Dynamic OpenStreetMap / Photon Geocoding Service (Free, No API Key, CORS Enabled)
 * Discovers precise coordinates [lat, lng] and real country for any arbitrary address worldwide.
 */
export async function geocodeAddress(
  query: string,
  signal?: AbortSignal
): Promise<GeocodedLocation | null> {
  const trimmed = query?.trim();
  if (!trimmed || trimmed.length < 3) return null;

  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(trimmed)}&limit=1`;
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.features && data.features.length > 0) {
      const feat = data.features[0];
      const [lng, lat] = feat.geometry.coordinates;
      const props = feat.properties || {};

      const standardizedCountry = normalizeCountryName(props.country, props.countrycode);

      return {
        coords: [lat, lng],
        displayName: props.name || trimmed,
        country: standardizedCountry,
        countryCode: (props.countrycode || '').toUpperCase(),
        state: props.state,
      };
    }
  } catch {
    // Ignore network hiccups or aborts
  }
  return null;
}

/**
 * Autocomplete real-address suggestions via OpenStreetMap / Photon Search
 */
export async function searchAddressSuggestions(
  query: string,
  options?: { domesticOnly?: boolean; limit?: number; signal?: AbortSignal }
): Promise<AddressSuggestion[]> {
  const trimmed = query?.trim();
  if (!trimmed || trimmed.length < 2) return [];

  const limit = options?.limit ?? 6;
  const domesticOnly = Boolean(options?.domesticOnly);
  const normQuery = normalizeVietnamese(trimmed);
  const hasVietnamToken = normQuery.includes('vietnam') || normQuery.includes('viet nam');
  const searchQuery = domesticOnly && !hasVietnamToken ? `${trimmed}, Vietnam` : trimmed;

  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(searchQuery)}&limit=12`;
    const res = await fetch(url, { signal: options?.signal });
    if (!res.ok) return [];
    const data = await res.json();
    const features = Array.isArray(data?.features) ? data.features : [];

    const seenFull = new Set<string>();
    const seenMotorway = new Set<string>();
    const ranked: Array<{ score: number; item: AddressSuggestion }> = [];

    for (let idx = 0; idx < features.length; idx++) {
      const feat = features[idx];
      const coordsRaw = feat?.geometry?.coordinates;
      if (!Array.isArray(coordsRaw) || coordsRaw.length < 2) continue;
      const [lng, lat] = coordsRaw;
      const props = feat.properties || {};

      const standardizedCountry = normalizeCountryName(props.country, props.countrycode);
      if (domesticOnly && standardizedCountry !== 'Việt Nam') continue;

      const streetPart = [props.housenumber, props.street].filter(Boolean).join(' ').trim();
      const primaryLabel = String(
        props.name || streetPart || props.district || props.city || props.state || standardizedCountry
      ).trim();
      if (!primaryLabel) continue;

      const normPrimary = normalizeVietnamese(primaryLabel);
      const secondaryParts: string[] = [];
      const seenPart = new Set<string>([normPrimary]);

      for (const candidate of [
        streetPart,
        props.district || props.locality,
        props.city || props.county,
        props.state,
        standardizedCountry,
      ]) {
        const clean = String(candidate || '').trim();
        if (!clean) continue;
        const normPart = normalizeVietnamese(clean);
        if (!normPart || seenPart.has(normPart)) continue;
        seenPart.add(normPart);
        secondaryParts.push(clean);
      }

      const secondaryLabel = secondaryParts.join(', ');
      const fullAddress = secondaryLabel ? `${primaryLabel}, ${secondaryLabel}` : primaryLabel;
      const normFull = normalizeVietnamese(fullAddress);
      if (seenFull.has(normFull)) continue;

      const isMotorway = props.osm_key === 'highway' && props.osm_value === 'motorway';
      if (isMotorway) {
        if (seenMotorway.has(normPrimary)) continue;
        seenMotorway.add(normPrimary);
      }
      seenFull.add(normFull);

      const category: AddressSuggestion['category'] =
        props.osm_key === 'aeroway' || isAirportLocationText(fullAddress)
          ? 'airport'
          : ['city', 'town', 'village', 'district', 'county', 'state'].includes(String(props.type || ''))
            ? 'city'
            : props.housenumber || props.street
              ? 'address'
              : 'place';

      const baseScore =
        category === 'airport'
          ? 400
          : category === 'city'
            ? 300
            : category === 'address'
              ? 250
              : isMotorway
                ? 50
                : 200;
      const startsBonus = normPrimary.startsWith(normQuery) ? 40 : 0;

      ranked.push({
        score: baseScore + startsBonus - idx,
        item: {
          id: `${props.osm_type || 'x'}-${props.osm_id || idx}-${lat.toFixed(4)}-${lng.toFixed(4)}`,
          primaryLabel,
          secondaryLabel,
          fullAddress,
          category,
          geo: {
            coords: [lat, lng],
            displayName: primaryLabel,
            country: standardizedCountry,
            countryCode: String(props.countrycode || '').toUpperCase(),
            state: props.state,
          },
        },
      });
    }

    if (ranked.length > 0) {
      ranked.sort((a, b) => b.score - a.score);
      return ranked.slice(0, limit).map((r) => r.item);
    }
  } catch {
    // Fall back to airport hub catalog when offline or aborted
  }

  const airportPool = domesticOnly ? VIETNAM_AIRPORTS : [...VIETNAM_AIRPORTS, ...INTERNATIONAL_EQUINE_AIRPORTS];
  return airportPool
    .filter((a) => normalizeVietnamese(a.name).includes(normQuery) || a.code?.toLowerCase() === normQuery)
    .slice(0, limit)
    .map((a, idx) => ({
      id: `fallback-${a.code || idx}`,
      primaryLabel: a.name,
      secondaryLabel: a.country,
      fullAddress: a.name,
      category: 'airport' as const,
      geo: {
        coords: a.coords,
        displayName: a.name,
        country: a.country,
      },
    }));
}

/**
 * Intelligent Equine Route Builder
 * Produces real waypoints, flight paths or road transit checkpoints dynamically
 */
export function buildEquineRoute(
  originText: string,
  destinationText: string,
  preferredMode: 'air' | 'road' = 'air',
  explicitTransportType?: 'International' | 'Domestic',
  customOriginCoords?: [number, number] | null,
  customDestCoords?: [number, number] | null,
  customOriginGeo?: GeocodedLocation | null,
  customDestGeo?: GeocodedLocation | null
): RouteCalculationResult {
  const isForcedDomestic = explicitTransportType === 'Domestic';

  const explicitOriginAirport = findExplicitAirportInText(originText);
  const explicitDestAirport = findExplicitAirportInText(destinationText);

  const origin = resolveLocation(originText, 'vn-hcm-cuchi', isForcedDomestic);
  if (customOriginGeo) {
    origin.coords = customOriginGeo.coords;
    origin.country = normalizeCountryName(customOriginGeo.country, customOriginGeo.countryCode);
    origin.isVietnam = origin.country === 'Việt Nam';
    origin.name = formatLocationDisplayName(originText, origin.country);
  } else if (customOriginCoords) {
    origin.coords = customOriginCoords;
  } else if (explicitOriginAirport) {
    origin.coords = explicitOriginAirport.coords;
    origin.country = explicitOriginAirport.country;
    origin.isVietnam = explicitOriginAirport.country === 'Việt Nam';
  }

  const destination = resolveLocation(
    destinationText,
    isForcedDomestic ? 'vn-hanoi-socson' : 'intl-singapore',
    isForcedDomestic
  );
  if (customDestGeo) {
    destination.coords = customDestGeo.coords;
    destination.country = normalizeCountryName(customDestGeo.country, customDestGeo.countryCode);
    destination.isVietnam = destination.country === 'Việt Nam';
    destination.name = formatLocationDisplayName(destinationText, destination.country);
  } else if (customDestCoords) {
    destination.coords = customDestCoords;
  } else if (explicitDestAirport) {
    destination.coords = explicitDestAirport.coords;
    destination.country = explicitDestAirport.country;
    destination.isVietnam = explicitDestAirport.country === 'Việt Nam';
  }

  const isDomestic =
    explicitTransportType === 'Domestic' ||
    (origin.isVietnam && destination.isVietnam && explicitTransportType !== 'International');

  origin.nearestAirport = explicitOriginAirport
    ? { name: explicitOriginAirport.name, coords: explicitOriginAirport.coords, country: explicitOriginAirport.country }
    : getNearestAirportForCoords(origin.coords, origin.country, {
        internationalOnly: !isDomestic,
        locationText: originText,
      });

  destination.nearestAirport = explicitDestAirport
    ? { name: explicitDestAirport.name, coords: explicitDestAirport.coords, country: explicitDestAirport.country }
    : getNearestAirportForCoords(destination.coords, destination.country, {
        internationalOnly: !isDomestic,
        locationText: destinationText,
      });

  if (!customOriginGeo && !customOriginCoords && !explicitOriginAirport && isAirportLocationText(originText)) {
    origin.coords = origin.nearestAirport.coords;
  }
  if (!customDestGeo && !customDestCoords && !explicitDestAirport && isAirportLocationText(destinationText)) {
    destination.coords = destination.nearestAirport.coords;
  }

  const directDistanceKm = Math.round(calculateHaversine(origin.coords, destination.coords));

  const waypoints: Waypoint[] = [];
  const legs: RouteLegPreview[] = [];
  let mode: 'air' | 'road' = preferredMode;
  let airFallbackNotice: { vi: string; en: string } | null = null;
  let distanceKm = 0;
  let durationHours = 0;

  if (mode === 'air') {
    const originAirport = origin.nearestAirport;
    const destAirport = destination.nearestAirport;
    const isSameAirport =
      calculateHaversine(originAirport.coords, destAirport.coords) < 5 ||
      normalizeVietnamese(originAirport.name) === normalizeVietnamese(destAirport.name);

    if (isSameAirport) {
      mode = 'road';
      airFallbackNotice = {
        vi: 'Điểm xuất phát và điểm đến dùng chung một cảng hàng không gần nhất, hệ thống tự chuyển sang xe thùng chuyên dụng đi thẳng.',
        en: 'Origin and destination share the same nearest airport; automatically switched to direct horse transport truck.',
      };
    } else {
      const originIsAtAirport =
        isAirportLocationText(originText) &&
        (!customOriginGeo || calculateHaversine(origin.coords, originAirport.coords) < 8);
      const destIsAtAirport =
        isAirportLocationText(destinationText) &&
        (!customDestGeo || calculateHaversine(destination.coords, destAirport.coords) < 8);
      let seq = 1;

      if (!originIsAtAirport) {
        waypoints.push({
          name: origin.name,
          type: 'origin',
          coords: origin.coords,
          label: 'Điểm xuất phát',
          country: origin.country,
          details: isDomestic
            ? 'Kiểm tra tình trạng thể lực, đối chiếu vi mạch Microchip và sổ tiêm chủng Cục Thú Y.'
            : 'Kiểm tra hồ sơ FEI Passport, vi mạch microchip và giấy xuất cảnh Cục Thú Y cấp.',
        });

        const leg1RawKm = calculateHaversine(origin.coords, originAirport.coords);
        const leg1Dist = Math.max(8, Math.round(leg1RawKm * 1.3));
        const leg1Dur = Math.max(0.5, Math.round((leg1Dist / 50 + 0.5) * 10) / 10);
        legs.push({
          sequenceNo: seq++,
          type: 'road',
          vehicleLabelVi: 'Xe thùng chuyên dụng',
          vehicleLabelEn: 'Equine Transport Truck',
          fromName: origin.name,
          toName: originAirport.name,
          fromCoords: origin.coords,
          toCoords: originAirport.coords,
          distanceKm: leg1Dist,
          durationHours: leg1Dur,
          noteVi: 'Xe thùng đón ngựa tại điểm xuất phát và trung chuyển tới khu kiểm dịch sân bay đi.',
          noteEn: 'Specialized horse truck picks up at origin and transfers to departure airport cargo.',
        });
      }

      waypoints.push({
        name: originAirport.name,
        type: originIsAtAirport ? 'origin' : 'airport',
        coords: originAirport.coords,
        label: isDomestic ? 'Trạm kiểm dịch sân bay đi' : 'Hải quan xuất cảnh & Kiểm dịch sân bay',
        country: origin.country,
        details: isDomestic
          ? 'Chi cục Thú y vùng cấp giấy kiểm dịch vận chuyển nội địa, đưa vào chuồng hàng không chuyên dụng.'
          : 'Bác sĩ thú y kiểm tra lâm sàng, xếp vào chuồng hàng không chuyên dụng trước giờ cất cánh.',
      });

      const flightDist = Math.max(150, Math.round(calculateHaversine(originAirport.coords, destAirport.coords)));
      const flightDur = Math.max(1.5, Math.round((flightDist / 720 + (isDomestic ? 1.5 : 2.5)) * 10) / 10);
      legs.push({
        sequenceNo: seq++,
        type: 'air',
        vehicleLabelVi: 'Chuyến bay vận tải ngựa',
        vehicleLabelEn: 'Equine Cargo Flight',
        fromName: originAirport.name,
        toName: destAirport.name,
        fromCoords: originAirport.coords,
        toCoords: destAirport.coords,
        distanceKm: flightDist,
        durationHours: flightDur,
        noteVi: 'Ngựa được đưa vào chuồng hàng không chuyên dụng trên chuyến bay tới sân bay đích.',
        noteEn: 'Loaded into specialized equine air stalls for flight to the arrival airport.',
      });

      waypoints.push({
        name: destAirport.name,
        type: destIsAtAirport ? 'destination' : 'airport',
        coords: destAirport.coords,
        label: isDomestic ? 'Sân bay đến & Kiểm tra thú y' : 'Cảng hàng không nhập cảnh & Kiểm dịch',
        country: destination.country,
        details: isDomestic
          ? 'Kiểm tra lâm sàng thân nhiệt và trạng thái sức khỏe sau chuyến bay.'
          : 'Cơ quan Thú y nước sở tại đối soát hồ sơ kiểm dịch và làm thủ tục thông quan tại cảng.',
      });

      if (!destIsAtAirport) {
        const leg3RawKm = calculateHaversine(destAirport.coords, destination.coords);
        const leg3Dist = Math.max(8, Math.round(leg3RawKm * 1.3));
        const leg3Dur = Math.max(0.5, Math.round((leg3Dist / 50 + 0.5) * 10) / 10);
        legs.push({
          sequenceNo: seq++,
          type: 'road',
          vehicleLabelVi: 'Xe thùng chuyên dụng',
          vehicleLabelEn: 'Equine Transport Truck',
          fromName: destAirport.name,
          toName: destination.name,
          fromCoords: destAirport.coords,
          toCoords: destination.coords,
          distanceKm: leg3Dist,
          durationHours: leg3Dur,
          noteVi: 'Xe thùng tiếp nhận ngựa sau thông quan sân bay và đưa về đúng điểm đến.',
          noteEn: 'Specialized horse truck collects after airport clearance and delivers to destination.',
        });

        waypoints.push({
          name: destination.name,
          type: 'destination',
          coords: destination.coords,
          label: 'Điểm đến',
          country: destination.country,
          details: isDomestic
            ? 'Bàn giao ngựa đúng địa điểm khách yêu cầu, kiểm tra sức khỏe khi đến nơi.'
            : 'Bàn giao ngựa tại đúng địa chỉ tiếp nhận và hoàn tất quy trình cách ly theo dõi.',
        });
      }

      distanceKm = legs.reduce((sum, leg) => sum + leg.distanceKm, 0);
      durationHours = Math.max(3, Math.round(legs.reduce((sum, leg) => sum + leg.durationHours, 0) * 10) / 10);
    }
  }

  if (mode === 'road') {
    if (isDomestic) {
      // Domestic Road
      waypoints.push({
        name: origin.name,
        type: 'origin',
        coords: origin.coords,
        label: 'Điểm xuất phát',
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
        label: 'Điểm đến',
        country: destination.country,
        details: 'Hoàn tất bàn giao ngựa đúng địa chỉ tiếp nhận.',
      });

      distanceKm = Math.max(80, Math.round(directDistanceKm * 1.35));
      durationHours = Math.max(3, Math.round((distanceKm / 55) * 1.35));
    } else {
      // International Overland Road Route
      waypoints.push({
        name: origin.name,
        type: 'origin',
        coords: origin.coords,
        label: 'Điểm xuất phát',
        country: origin.country,
        details: 'Khởi hành xe chuyên dụng thùng điều hòa kháng chấn.',
      });

      // 1. Tuyến trực tiếp sang Campuchia
      if (destination.country === 'Campuchia') {
        waypoints.push({
          name: 'Cửa khẩu Quốc tế Mộc Bài (Tây Ninh) / Bavet',
          type: 'checkpoint',
          coords: [11.0743, 106.1821],
          label: 'Cửa khẩu biên giới Việt Nam - Campuchia',
          country: 'Việt Nam',
          details: 'Thực hiện thủ tục hải quan xuất cảnh Việt Nam và kiểm dịch thú y nhập cảnh Campuchia.',
        });

        // Nếu điểm đến cách xa biên giới (>220km) hoặc các tỉnh xa như Siem Reap
        if (directDistanceKm > 250) {
          waypoints.push({
            name: 'Trạm dừng nghỉ & Thú y Svay Rieng (Quốc lộ 1)',
            type: 'rest',
            coords: [11.0878, 105.7994],
            label: 'Trạm dừng nghỉ thú y chặng QL1',
            country: 'Campuchia',
            details: 'Cho ngựa uống điện giải, ăn cỏ khô, kiểm tra thân nhiệt và thông gió.',
          });
        }

        waypoints.push({
          name: destination.name,
          type: 'destination',
          coords: destination.coords,
          label: 'Điểm đến',
          country: destination.country,
          details: 'Hoàn tất bàn giao ngựa đúng địa chỉ tiếp nhận tại Campuchia.',
        });

        distanceKm = Math.max(180, Math.round(directDistanceKm * 1.3));
        durationHours = Math.max(4.5, Math.round(distanceKm / 50 + 2));
      } else if (destination.country === 'Lào') {
        // 2. Tuyến sang Lào
        const isFromSouth = origin.coords[0] < 14;
        if (isFromSouth) {
          waypoints.push({
            name: 'Cửa khẩu Quốc tế Bờ Y (Kon Tum / Attapeu)',
            type: 'checkpoint',
            coords: [14.7083, 107.5458],
            label: 'Cửa khẩu biên giới Việt Nam - Lào (Bờ Y)',
            country: 'Việt Nam',
            details: 'Thủ tục hải quan xuất cảnh và kiểm dịch thú y liên vận Việt - Lào.',
          });
        } else {
          waypoints.push({
            name: 'Cửa khẩu Quốc tế Cầu Treo (Hà Tĩnh / Bolikhamxay)',
            type: 'checkpoint',
            coords: [18.3883, 105.1583],
            label: 'Cửa khẩu biên giới Việt Nam - Lào (Cầu Treo)',
            country: 'Việt Nam',
            details: 'Kiểm dịch thú y động vật sống qua biên giới và thông quan hàng hóa.',
          });
        }

        waypoints.push({
          name: destination.name,
          type: 'destination',
          coords: destination.coords,
          label: 'Điểm đến',
          country: destination.country,
          details: 'Hoàn tất bàn giao ngựa đúng địa chỉ tiếp nhận tại Lào.',
        });

        distanceKm = Math.max(350, Math.round(directDistanceKm * 1.35));
        durationHours = Math.max(8, Math.round(distanceKm / 50 + 2.5));
      } else {
        // 3. Tuyến quá cảnh ASEAN đi Thái Lan, Malaysia, Singapore bằng đường bộ
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
          label: 'Trạm kiểm tra sức khỏe quá cảnh (Campuchia)',
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

        // Nếu đi tiếp xuống Malaysia hoặc Singapore
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
          label: 'Điểm đến',
          country: destination.country,
          details: 'Bàn giao ngựa đúng địa chỉ tiếp nhận và theo dõi sau hành trình.',
        });

        distanceKm = Math.max(900, Math.round(directDistanceKm * 1.45));
        durationHours = Math.max(18, Math.round((distanceKm / 55) * 1.35));
      }
    }

    const stopCount = Math.max(0, waypoints.length - 2);
    legs.push({
      sequenceNo: 1,
      type: 'road',
      vehicleLabelVi: 'Xe thùng chuyên dụng',
      vehicleLabelEn: 'Equine Transport Truck',
      fromName: origin.name,
      toName: destination.name,
      fromCoords: origin.coords,
      toCoords: destination.coords,
      distanceKm,
      durationHours,
      noteVi:
        stopCount > 0
          ? `Vận chuyển bằng xe thùng chuyên dụng qua ${stopCount} trạm kiểm dịch / dừng nghỉ.`
          : 'Vận chuyển thẳng bằng xe thùng chuyên dụng từ điểm đi tới điểm đến.',
      noteEn:
        stopCount > 0
          ? `Overland horse truck corridor with ${stopCount} mandatory stop(s).`
          : 'Direct point-to-point specialized horse truck transit.',
    });
  }

  const customsCount = waypoints.filter((w) => w.type === 'checkpoint' || w.type === 'airport' || w.type === 'rest').length;

  const modeLabelVi =
    mode === 'air'
      ? legs.some((l) => l.type === 'road')
        ? 'Đa phương thức: Xe thùng + Hàng không'
        : 'Hàng không'
      : 'Đường bộ (Xe thùng)';
  const summaryNote = `${isDomestic ? 'Nội địa' : 'Xuyên biên giới'}: ${origin.name} ➔ ${destination.name} (${modeLabelVi})`;

  return {
    origin,
    destination,
    isDomestic,
    mode,
    distanceKm,
    durationHours,
    customsCount,
    waypoints,
    legs,
    airFallbackNotice,
    summaryNote,
  };
}
