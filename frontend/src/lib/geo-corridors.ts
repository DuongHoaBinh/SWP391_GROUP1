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
    keywords: ['nuoc uc', 'chau uc', 'australia', 'melbourne', 'sydney', 'flemington', 'perth', 'brisbane'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Melbourne (MEL Equine Terminal)',
      coords: [-37.669, 144.841],
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
    keywords: ['india', 'an do', 'mumbai', 'delhi', 'bangalore', 'mahalaxmi', 'kolkata', 'hyderabad', 'chennai', 'pune', 'new delhi'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Chhatrapati Shivaji (BOM Live Animal Facility)',
      coords: [19.0896, 72.8656],
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
      name: 'Sân bay Quốc tế Charles de Gaulle (CDG Animal Station)',
      coords: [49.0097, 2.5479],
      country: 'Pháp',
    },
  },

  // --- QUỐC TẾ: ANH QUỐC (UK) ---
  {
    id: 'intl-uk-newmarket',
    name: 'Newmarket Racecourse (Anh Quốc)',
    country: 'Anh',
    isVietnam: false,
    coords: [52.2458, 0.4037],
    keywords: ['uk', 'england', 'britain', 'nuoc anh', 'vuong quoc anh', 'london', 'newmarket', 'ascot', 'heathrow', 'stansted'],
    nearestAirport: {
      name: 'Sân bay Quốc tế London Stansted (STN Equine Hub)',
      coords: [51.886, 0.2389],
      country: 'Anh',
    },
  },

  // --- QUỐC TẾ: MỸ (USA) ---
  {
    id: 'intl-usa-kentucky',
    name: 'Churchill Downs (Louisville, Kentucky, Mỹ)',
    country: 'Mỹ',
    isVietnam: false,
    coords: [38.2031, -85.7699],
    keywords: ['usa', 'nuoc my', 'hoa ky', 'united states', 'america', 'kentucky', 'louisville', 'lexington', 'california', 'new york'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Louisville (SDF Worldport Live Cargo)',
      coords: [38.1744, -85.736],
      country: 'Mỹ',
    },
  },

  // --- QUỐC TẾ: TRUNG QUỐC (CHINA) ---
  {
    id: 'intl-china-shanghai',
    name: 'Trung tâm Đua ngựa Quốc tế Thượng Hải (Trung Quốc)',
    country: 'Trung Quốc',
    isVietnam: false,
    coords: [31.2304, 121.4737],
    keywords: ['china', 'trung quoc', 'shanghai', 'beijing', 'guangzhou', 'congshua', 'hong kong border'],
    nearestAirport: {
      name: 'Sân bay Quốc tế Phố Đông Thượng Hải (PVG Cargo Hub)',
      coords: [31.1443, 121.8083],
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

  // 1. Direct keyword score matching with boundary check
  let bestMatch: KnownLocation | null = null;
  let highestScore = 0;

  for (const loc of candidateLocations) {
    for (const kw of loc.keywords) {
      if (matchesKeyword(normalized, kw)) {
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
    name: `${rawText} (${defaultVn.country})`,
  };
}

export interface GeocodedLocation {
  coords: [number, number];
  displayName: string;
  country: string;
  countryCode?: string;
  state?: string;
}

/**
 * Standardize international country names into friendly Vietnamese conventions
 */
export function normalizeCountryName(countryName?: string, countryCode?: string): string {
  const code = (countryCode || '').toUpperCase();
  const c = (countryName || '').toLowerCase();

  if (code === 'VN' || c.includes('vietnam') || c.includes('việt nam')) return 'Việt Nam';
  if (code === 'MY' || c.includes('malaysia')) return 'Malaysia';
  if (code === 'SG' || c.includes('singapore')) return 'Singapore';
  if (code === 'TH' || c.includes('thailand') || c.includes('thái lan')) return 'Thái Lan';
  if (code === 'KH' || c.includes('cambodia') || c.includes('campuchia')) return 'Campuchia';
  if (code === 'LA' || c.includes('laos') || c.includes('lào')) return 'Lào';
  if (code === 'CN' || c.includes('china') || c.includes('trung quoc')) return 'Trung Quốc';
  if (code === 'ID' || c.includes('indonesia')) return 'Indonesia';
  if (code === 'PH' || c.includes('philippines')) return 'Philippines';
  if (code === 'JP' || c.includes('japan') || c.includes('nhật bản')) return 'Nhật Bản';
  if (code === 'KR' || c.includes('korea') || c.includes('hàn quốc')) return 'Hàn Quốc';
  if (code === 'AU' || c.includes('australia') || c.includes('úc')) return 'Úc';
  if (code === 'FR' || c.includes('france') || c.includes('pháp')) return 'Pháp';
  if (code === 'GB' || c.includes('united kingdom') || c.includes('anh')) return 'Vương quốc Anh';
  if (code === 'US' || c.includes('united states') || c.includes('mỹ')) return 'Hoa Kỳ';

  return countryName || 'Quốc tế';
}

export interface EquineAirportHub {
  name: string;
  coords: [number, number];
  country: string;
  code?: string;
}

export const INTERNATIONAL_EQUINE_AIRPORTS: EquineAirportHub[] = [
  // --- INDONESIA ---
  {
    name: 'Sân bay Quốc tế Syamsudin Noor (BDJ Cargo), Kalimantan',
    coords: [-3.4474, 114.7578],
    country: 'Indonesia',
    code: 'BDJ',
  },
  {
    name: 'Sân bay Quốc tế Soekarno-Hatta (CGK Cargo), Jakarta',
    coords: [-6.1256, 106.6559],
    country: 'Indonesia',
    code: 'CGK',
  },
  {
    name: 'Sân bay Quốc tế Ngurah Rai (DPS Cargo), Bali',
    coords: [-8.7482, 115.1672],
    country: 'Indonesia',
    code: 'DPS',
  },
  {
    name: 'Sân bay Quốc tế Juanda (SUB Cargo), Surabaya',
    coords: [-7.3798, 112.7876],
    country: 'Indonesia',
    code: 'SUB',
  },
  {
    name: 'Sân bay Quốc tế Kualanamu (KNO Cargo), Medan',
    coords: [3.6422, 98.8853],
    country: 'Indonesia',
    code: 'KNO',
  },
  // --- SINGAPORE ---
  {
    name: 'Sân bay Quốc tế Changi (SIN Live Animal Cargo Hub)',
    coords: [1.3644, 103.9915],
    country: 'Singapore',
    code: 'SIN',
  },
  // --- MALAYSIA ---
  {
    name: 'Sân bay Quốc tế Kuala Lumpur (KUL Cargo Hub)',
    coords: [2.7456, 101.7099],
    country: 'Malaysia',
    code: 'KUL',
  },
  {
    name: 'Sân bay Quốc tế Penang (PEN Cargo)',
    coords: [5.2971, 100.2768],
    country: 'Malaysia',
    code: 'PEN',
  },
  // --- THÁI LAN ---
  {
    name: 'Sân bay Quốc tế Suvarnabhumi (BKK Cargo Hub)',
    coords: [13.69, 100.7501],
    country: 'Thái Lan',
    code: 'BKK',
  },
  {
    name: 'Sân bay Quốc tế Chiang Mai (CNX Cargo)',
    coords: [18.7668, 98.9626],
    country: 'Thái Lan',
    code: 'CNX',
  },
  {
    name: 'Sân bay Quốc tế Phuket (HKT Cargo)',
    coords: [8.1132, 98.3169],
    country: 'Thái Lan',
    code: 'HKT',
  },
  // --- CAMPUCHIA ---
  {
    name: 'Sân bay Quốc tế Phnom Penh (PNH Cargo)',
    coords: [11.5466, 104.8441],
    country: 'Campuchia',
    code: 'PNH',
  },
  {
    name: 'Sân bay Quốc tế Siem Reap Angkor (SAI Cargo)',
    coords: [13.3712, 104.2215],
    country: 'Campuchia',
    code: 'SAI',
  },
  // --- LÀO ---
  {
    name: 'Sân bay Quốc tế Wattay (VTE Cargo), Vientiane',
    coords: [17.9883, 102.5633],
    country: 'Lào',
    code: 'VTE',
  },
  // --- PHILIPPINES ---
  {
    name: 'Sân bay Quốc tế Ninoy Aquino (MNL Cargo), Manila',
    coords: [14.5086, 121.0194],
    country: 'Philippines',
    code: 'MNL',
  },
  // --- HỒNG KÔNG / ĐÀI LOAN ---
  {
    name: 'Sân bay Quốc tế Hồng Kông (HKG Equine Center)',
    coords: [22.308, 113.9185],
    country: 'Hồng Kông',
    code: 'HKG',
  },
  {
    name: 'Sân bay Quốc tế Đào Viên (TPE Cargo), Đài Bắc',
    coords: [25.0797, 121.2342],
    country: 'Đài Loan',
    code: 'TPE',
  },
  // --- NHẬT BẢN ---
  {
    name: 'Sân bay Quốc tế Narita (NRT Cargo), Tokyo',
    coords: [35.772, 140.3929],
    country: 'Nhật Bản',
    code: 'NRT',
  },
  {
    name: 'Sân bay Quốc tế Kansai (KIX Cargo), Osaka',
    coords: [34.4347, 135.244],
    country: 'Nhật Bản',
    code: 'KIX',
  },
  // --- HÀN QUỐC ---
  {
    name: 'Sân bay Quốc tế Incheon (ICN Cargo), Seoul',
    coords: [37.4602, 126.4407],
    country: 'Hàn Quốc',
    code: 'ICN',
  },
  // --- TRUNG QUỐC ---
  {
    name: 'Sân bay Quốc tế Bạch Vân Quảng Châu (CAN Cargo)',
    coords: [23.3924, 113.2988],
    country: 'Trung Quốc',
    code: 'CAN',
  },
  {
    name: 'Sân bay Quốc tế Phố Đông Thượng Hải (PVG Cargo)',
    coords: [31.1443, 121.8083],
    country: 'Trung Quốc',
    code: 'PVG',
  },
  // --- ÚC ---
  {
    name: 'Sân bay Quốc tế Sydney (SYD Equine Cargo), Úc',
    coords: [-33.9399, 151.1753],
    country: 'Úc',
    code: 'SYD',
  },
  {
    name: 'Sân bay Quốc tế Melbourne (MEL Cargo), Úc',
    coords: [-37.669, 144.841],
    country: 'Úc',
    code: 'MEL',
  },
  // --- TRUNG ĐÔNG ---
  {
    name: 'Sân bay Quốc tế Dubai (DXB Equine Cargo Terminal)',
    coords: [25.2532, 55.3657],
    country: 'UAE',
    code: 'DXB',
  },
  // --- CHÂU ÂU ---
  {
    name: 'Sân bay Quốc tế Frankfurt (FRA Animal Lounge Hub), Đức',
    coords: [50.0379, 8.5622],
    country: 'Đức',
    code: 'FRA',
  },
  {
    name: 'Sân bay Quốc tế Charles de Gaulle (CDG Cargo), Pháp',
    coords: [49.0097, 2.5479],
    country: 'Pháp',
    code: 'CDG',
  },
  {
    name: 'Sân bay Quốc tế Heathrow (LHR Animal Reception Centre), Anh',
    coords: [51.47, -0.4543],
    country: 'Vương quốc Anh',
    code: 'LHR',
  },
  // --- MỸ ---
  {
    name: 'Sân bay Quốc tế JFK The ARK Live Animals Hub, New York, Mỹ',
    coords: [40.6413, -73.7781],
    country: 'Hoa Kỳ',
    code: 'JFK',
  },
  {
    name: 'Sân bay Quốc tế Los Angeles (LAX Cargo), Mỹ',
    coords: [33.9416, -118.4085],
    country: 'Hoa Kỳ',
    code: 'LAX',
  },
];

/**
 * Automatically determine the nearest major equine cargo airport by coordinate and country
 */
export function getNearestAirportForCoords(coords: [number, number], country?: string) {
  const [lat, lng] = coords;

  // 1. If domestic Vietnam
  if (country === 'Việt Nam' || (!country && lat >= 8.3 && lat <= 23.5 && lng >= 102.0 && lng <= 109.8)) {
    if (lat > 18.5) {
      return {
        name: 'Sân bay Quốc tế Nội Bài (HAN Cargo)',
        coords: [21.2212, 105.8072] as [number, number],
        country: 'Việt Nam',
      };
    } else if (lat > 14.0) {
      return {
        name: 'Sân bay Quốc tế Đà Nẵng (DAD Cargo)',
        coords: [16.0439, 108.1994] as [number, number],
        country: 'Việt Nam',
      };
    }
    return {
      name: 'Sân bay Quốc tế Tân Sơn Nhất (SGN Cargo)',
      coords: [10.8185, 106.6588] as [number, number],
      country: 'Việt Nam',
    };
  }

  // 2. Filter by country first if specified
  const countryCandidates = country
    ? INTERNATIONAL_EQUINE_AIRPORTS.filter(
        (a) =>
          a.country.toLowerCase() === country.toLowerCase() ||
          country.toLowerCase().includes(a.country.toLowerCase())
      )
    : [];

  const searchPool = countryCandidates.length > 0 ? countryCandidates : INTERNATIONAL_EQUINE_AIRPORTS;

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

  const origin = resolveLocation(originText, 'vn-hcm-cuchi', isForcedDomestic);
  if (customOriginGeo) {
    origin.coords = customOriginGeo.coords;
    origin.country = customOriginGeo.country;
    origin.isVietnam = customOriginGeo.country === 'Việt Nam';
    origin.name = `${originText} (${customOriginGeo.country})`;
    origin.nearestAirport = getNearestAirportForCoords(origin.coords, origin.country);
  } else if (customOriginCoords) {
    origin.coords = customOriginCoords;
  }

  const destination = resolveLocation(
    destinationText,
    isForcedDomestic ? 'vn-hanoi-socson' : 'intl-singapore',
    isForcedDomestic
  );
  if (customDestGeo) {
    destination.coords = customDestGeo.coords;
    destination.country = customDestGeo.country;
    destination.isVietnam = customDestGeo.country === 'Việt Nam';
    destination.name = `${destinationText} (${customDestGeo.country})`;
    destination.nearestAirport = getNearestAirportForCoords(destination.coords, destination.country);
  } else if (customDestCoords) {
    destination.coords = customDestCoords;
  }

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

      const leg1Dist = Math.round(calculateHaversine(origin.coords, originAirport.coords));
      const flightDist = Math.round(calculateHaversine(originAirport.coords, destAirport.coords));
      const leg3Dist = Math.round(calculateHaversine(destAirport.coords, destination.coords) * 1.35);
      distanceKm = Math.max(650, leg1Dist + flightDist + leg3Dist);
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
          label: 'Điểm đến Campuchia (Destination)',
          country: destination.country,
          details: 'Hoàn tất bàn giao ngựa cho chủ trang trại/trường đua, đưa vào chuồng dưỡng sức.',
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
          label: 'Điểm đến tại Lào (Destination)',
          country: destination.country,
          details: 'Bàn giao ngựa tại chuồng cách ly theo dõi tiêu chuẩn.',
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
          label: 'Điểm đến bàn giao (Final Destination)',
          country: destination.country,
          details: 'Bàn giao ngựa cho chủ sở hữu, đưa vào chuồng cách ly theo dõi.',
        });

        distanceKm = Math.max(900, Math.round(directDistanceKm * 1.45));
        durationHours = Math.max(18, Math.round((distanceKm / 55) * 1.35));
      }
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
