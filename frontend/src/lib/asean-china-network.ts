/**
 * ASEAN + China Maritime Seaport & Sea-Route Network
 * Synchronized with database/migrations/040_transport_network_sea_china.sql.
 * Provides real offshore maritime via_points polylines and Dijkstra shortest-sea-path routing
 * so sea legs ALWAYS travel over water (never cutting across land).
 */

export interface SeaportNode {
  code: string;
  name: string;
  nameEn: string;
  country: string;
  countryCode: string;
  city: string;
  coords: [number, number]; // [lat, lng]
  isInternational: boolean;
  supportsVessel: boolean;
  hasQuarantine: boolean;
}

export interface SeaCorridorEdge {
  fromCode: string;
  toCode: string;
  seaMode: 'vessel';
  distanceKm: number;
  typicalHours: number;
  viaPoints: [number, number][];
  notesVi: string;
  notesEn: string;
}

export interface SeaPathResult {
  fromPort: SeaportNode;
  toPort: SeaportNode;
  effectiveSeaMode: 'vessel';
  transitPorts: SeaportNode[];
  pathCoords: [number, number][];
  distanceKm: number;
  durationHours: number;
  corridorNotesVi: string;
  corridorNotesEn: string;
}

export const ASEAN_CHINA_SEAPORTS: SeaportNode[] = [
  // Việt Nam
  { code: 'VN-CLI', name: 'Cảng Cát Lái (TP.HCM)', nameEn: 'Cat Lai Port (HCMC)', country: 'Việt Nam', countryCode: 'VN', city: 'Hồ Chí Minh', coords: [10.7617, 106.7894], isInternational: true, supportsVessel: true, hasQuarantine: true },
  { code: 'VN-VUT', name: 'Cảng Cái Mép – Thị Vải (Vũng Tàu)', nameEn: 'Cai Mep – Thi Vai Port', country: 'Việt Nam', countryCode: 'VN', city: 'Bà Rịa – Vũng Tàu', coords: [10.5256, 107.0185], isInternational: true, supportsVessel: true, hasQuarantine: true },
  { code: 'VN-DAD', name: 'Cảng Tiên Sa (Đà Nẵng)', nameEn: 'Tien Sa Port (Da Nang)', country: 'Việt Nam', countryCode: 'VN', city: 'Đà Nẵng', coords: [16.1219, 108.2194], isInternational: true, supportsVessel: true, hasQuarantine: true },
  { code: 'VN-HPH', name: 'Cảng Lạch Huyện (Hải Phòng)', nameEn: 'Lach Huyen Port (Hai Phong)', country: 'Việt Nam', countryCode: 'VN', city: 'Hải Phòng', coords: [20.8449, 106.8891], isInternational: true, supportsVessel: true, hasQuarantine: true },

  // Campuchia
  { code: 'KH-KOS', name: 'Cảng tự trị Sihanoukville (Campuchia)', nameEn: 'Sihanoukville Autonomous Port', country: 'Campuchia', countryCode: 'KH', city: 'Sihanoukville', coords: [10.6462, 103.5015], isInternational: true, supportsVessel: true, hasQuarantine: true },

  // Thái Lan
  { code: 'TH-LCB', name: 'Cảng Laem Chabang (Thái Lan)', nameEn: 'Laem Chabang Port (Thailand)', country: 'Thái Lan', countryCode: 'TH', city: 'Chonburi', coords: [13.0827, 100.883], isInternational: true, supportsVessel: true, hasQuarantine: true },

  // Malaysia
  { code: 'MY-PKG', name: 'Cảng Port Klang (Malaysia)', nameEn: 'Port Klang (Westports)', country: 'Malaysia', countryCode: 'MY', city: 'Selangor', coords: [2.9999, 101.3928], isInternational: true, supportsVessel: true, hasQuarantine: true },
  { code: 'MY-PEN', name: 'Cảng Penang (Butterworth)', nameEn: 'Penang Port (Butterworth)', country: 'Malaysia', countryCode: 'MY', city: 'Penang', coords: [5.41, 100.365], isInternational: true, supportsVessel: true, hasQuarantine: true },
  { code: 'MY-KCH', name: 'Cảng Senari (Kuching)', nameEn: 'Senari Port (Kuching)', country: 'Malaysia', countryCode: 'MY', city: 'Kuching', coords: [1.57, 110.42], isInternational: true, supportsVessel: true, hasQuarantine: true },
  { code: 'MY-BKI', name: 'Cảng Sepanggar (Kota Kinabalu)', nameEn: 'Sepanggar Port (Kota Kinabalu)', country: 'Malaysia', countryCode: 'MY', city: 'Kota Kinabalu', coords: [6.08, 116.12], isInternational: true, supportsVessel: true, hasQuarantine: false },

  // Singapore
  { code: 'SG-PSA', name: 'Cảng Pasir Panjang (Singapore)', nameEn: 'Pasir Panjang Terminal (Singapore)', country: 'Singapore', countryCode: 'SG', city: 'Singapore', coords: [1.2737, 103.7909], isInternational: true, supportsVessel: true, hasQuarantine: true },

  // Indonesia
  { code: 'ID-JKT', name: 'Cảng Tanjung Priok (Jakarta)', nameEn: 'Tanjung Priok Port (Jakarta)', country: 'Indonesia', countryCode: 'ID', city: 'Jakarta', coords: [-6.104, 106.88], isInternational: true, supportsVessel: true, hasQuarantine: true },
  { code: 'ID-SUB', name: 'Cảng Tanjung Perak (Surabaya)', nameEn: 'Tanjung Perak Port (Surabaya)', country: 'Indonesia', countryCode: 'ID', city: 'Surabaya', coords: [-7.2, 112.73], isInternational: true, supportsVessel: true, hasQuarantine: true },
  { code: 'ID-BLW', name: 'Cảng Belawan (Medan)', nameEn: 'Belawan Port (Medan)', country: 'Indonesia', countryCode: 'ID', city: 'Medan', coords: [3.785, 98.69], isInternational: true, supportsVessel: true, hasQuarantine: true },

  // Philippines, Brunei, Myanmar
  { code: 'PH-MNL', name: 'Cảng Manila South Harbor (Philippines)', nameEn: 'Manila South Harbor', country: 'Philippines', countryCode: 'PH', city: 'Manila', coords: [14.585, 120.965], isInternational: true, supportsVessel: true, hasQuarantine: true },
  { code: 'BN-MUA', name: 'Cảng Muara (Brunei)', nameEn: 'Muara Port (Brunei)', country: 'Brunei', countryCode: 'BN', city: 'Muara', coords: [5.025, 115.07], isInternational: true, supportsVessel: true, hasQuarantine: true },
  { code: 'MM-RGN', name: 'Cảng Thilawa (Yangon, Myanmar)', nameEn: 'Thilawa Port (Yangon)', country: 'Myanmar', countryCode: 'MM', city: 'Yangon', coords: [16.66, 96.27], isInternational: true, supportsVessel: true, hasQuarantine: true },

  // Hồng Kông & Trung Quốc
  { code: 'HK-HKG', name: 'Cảng Kwai Tsing (Hồng Kông)', nameEn: 'Kwai Tsing Terminals (Hong Kong)', country: 'Hồng Kông', countryCode: 'HK', city: 'Hong Kong', coords: [22.3456, 114.1228], isInternational: true, supportsVessel: true, hasQuarantine: true },
  { code: 'CN-FCG', name: 'Cảng Phòng Thành (Quảng Tây, TQ)', nameEn: 'Fangchenggang Port (Guangxi)', country: 'Trung Quốc', countryCode: 'CN', city: 'Fangchenggang', coords: [21.6, 108.34], isInternational: true, supportsVessel: true, hasQuarantine: true },
  { code: 'CN-NSA', name: 'Cảng Nam Sa (Quảng Châu, TQ)', nameEn: 'Nansha Port (Guangzhou)', country: 'Trung Quốc', countryCode: 'CN', city: 'Guangzhou', coords: [22.65, 113.67], isInternational: true, supportsVessel: true, hasQuarantine: true },
  { code: 'CN-SHK', name: 'Cảng Xà Khẩu (Thâm Quyến, TQ)', nameEn: 'Shekou Port (Shenzhen)', country: 'Trung Quốc', countryCode: 'CN', city: 'Shenzhen', coords: [22.47, 113.9], isInternational: true, supportsVessel: true, hasQuarantine: true },
  { code: 'CN-XMN', name: 'Cảng Hạ Môn (Phúc Kiến, TQ)', nameEn: 'Xiamen Port (China)', country: 'Trung Quốc', countryCode: 'CN', city: 'Xiamen', coords: [24.45, 118.07], isInternational: true, supportsVessel: true, hasQuarantine: true },
  { code: 'CN-SHA', name: 'Cảng Dương Sơn (Thượng Hải, TQ)', nameEn: 'Yangshan Port (Shanghai)', country: 'Trung Quốc', countryCode: 'CN', city: 'Shanghai', coords: [30.62, 122.07], isInternational: true, supportsVessel: true, hasQuarantine: true },
  { code: 'CN-TAO', name: 'Cảng Thanh Đảo (Sơn Đông, TQ)', nameEn: 'Qingdao Port (China)', country: 'Trung Quốc', countryCode: 'CN', city: 'Qingdao', coords: [36.07, 120.32], isInternational: true, supportsVessel: true, hasQuarantine: true },
  { code: 'CN-TSN', name: 'Cảng Thiên Tân (Bắc Kinh – Thiên Tân)', nameEn: 'Tianjin Port (Beijing Gateway)', country: 'Trung Quốc', countryCode: 'CN', city: 'Tianjin', coords: [38.97, 117.8], isInternational: true, supportsVessel: true, hasQuarantine: true },
  { code: 'CN-HAK', name: 'Cảng Tú Anh (Hải Khẩu, Hải Nam)', nameEn: 'Xiuying Port (Haikou, Hainan)', country: 'Trung Quốc', countryCode: 'CN', city: 'Haikou', coords: [20.02, 110.27], isInternational: true, supportsVessel: true, hasQuarantine: true },
];

export const ASEAN_CHINA_SEA_ROUTES: SeaCorridorEdge[] = [
  // Việt Nam ↔ Đông Nam Á
  { fromCode: 'VN-CLI', toCode: 'SG-PSA', seaMode: 'vessel', distanceKm: 1202, typicalHours: 52, viaPoints: [[10.62, 106.88], [10.4, 107.02], [10.15, 107.25], [8.3, 107], [5, 105.8], [3, 104.8], [1.4, 104.55], [1.21, 104.05], [1.22, 103.85]], notesVi: 'Hải trình Cát Lái – Singapore qua phía đông Côn Đảo và eo biển Singapore', notesEn: 'Cat Lai – Singapore maritime corridor via Con Dao & Singapore Strait' },
  { fromCode: 'VN-VUT', toCode: 'SG-PSA', seaMode: 'vessel', distanceKm: 1167, typicalHours: 51, viaPoints: [[10.38, 107.05], [10.15, 107.25], [8.3, 107], [5, 105.8], [3, 104.8], [1.4, 104.55], [1.21, 104.05], [1.22, 103.85]], notesVi: 'Hải trình Cái Mép – Singapore qua Biển Đông', notesEn: 'Cai Mep – Singapore maritime corridor' },
  { fromCode: 'VN-CLI', toCode: 'TH-LCB', seaMode: 'vessel', distanceKm: 1193, typicalHours: 52, viaPoints: [[10.62, 106.88], [10.4, 107.02], [10.15, 107.25], [9.3, 106.75], [8.45, 105.6], [8.15, 104.75], [9, 103.6], [10.5, 101.8], [12.2, 100.8], [12.9, 100.7]], notesVi: 'Hải trình Cát Lái – Laem Chabang vòng mũi Cà Mau vào vịnh Thái Lan', notesEn: 'Cat Lai – Laem Chabang offshore route rounding Ca Mau Cape into Gulf of Thailand' },
  { fromCode: 'VN-CLI', toCode: 'KH-KOS', seaMode: 'vessel', distanceKm: 794, typicalHours: 37, viaPoints: [[10.62, 106.88], [10.4, 107.02], [10.15, 107.25], [9.3, 106.75], [8.45, 105.6], [8.15, 104.75], [9, 103.6], [10.35, 103.45]], notesVi: 'Vòng mũi Cà Mau tới cảng Sihanoukville', notesEn: 'Rounding Ca Mau Cape to Sihanoukville Port' },
  { fromCode: 'KH-KOS', toCode: 'TH-LCB', seaMode: 'vessel', distanceKm: 542, typicalHours: 27, viaPoints: [[10.35, 103.45], [10.3, 102.8], [10.5, 101.8], [12.2, 100.8], [12.9, 100.7]], notesVi: 'Tuyến ven vịnh Thái Lan', notesEn: 'Gulf of Thailand coastal corridor' },
  { fromCode: 'TH-LCB', toCode: 'SG-PSA', seaMode: 'vessel', distanceKm: 1493, typicalHours: 63, viaPoints: [[12.9, 100.7], [12.2, 100.8], [10.5, 101.8], [7.5, 103], [5.5, 103.9], [3, 104.8], [1.4, 104.55], [1.21, 104.05], [1.22, 103.85]], notesVi: 'Dọc bờ đông bán đảo Mã Lai', notesEn: 'East Coast Malay Peninsula maritime route' },

  // Nội địa Việt Nam ven biển
  { fromCode: 'VN-CLI', toCode: 'VN-DAD', seaMode: 'vessel', distanceKm: 975, typicalHours: 44, viaPoints: [[10.62, 106.88], [10.4, 107.02], [10.15, 107.25], [10.75, 108.6], [11.35, 109.25], [12.2, 109.55], [12.95, 109.7], [13.75, 109.55], [15.2, 109.35], [16.3, 108.45], [16.22, 108.22]], notesVi: 'Tuyến ven biển Nam – Trung (nội địa)', notesEn: 'South – Central Vietnam coastal route' },
  { fromCode: 'VN-CLI', toCode: 'VN-HPH', seaMode: 'vessel', distanceKm: 1521, typicalHours: 65, viaPoints: [[10.62, 106.88], [10.4, 107.02], [10.15, 107.25], [10.75, 108.6], [11.35, 109.25], [12.2, 109.55], [12.95, 109.7], [13.75, 109.55], [15.2, 109.35], [16.3, 108.45], [17.5, 107.5], [19.2, 106.4], [20.6, 106.95]], notesVi: 'Tuyến ven biển Bắc – Nam (nội địa)', notesEn: 'North – South Vietnam coastal maritime route' },
  { fromCode: 'VN-DAD', toCode: 'VN-HPH', seaMode: 'vessel', distanceKm: 620, typicalHours: 30, viaPoints: [[16.22, 108.22], [16.3, 108.45], [17.5, 107.5], [19.2, 106.4], [20.6, 106.95]], notesVi: 'Tuyến ven biển miền Trung – Bắc (nội địa)', notesEn: 'Central – North Vietnam coastal route' },

  // Việt Nam ↔ Hồng Kông / Trung Quốc / Philippines
  { fromCode: 'VN-CLI', toCode: 'HK-HKG', seaMode: 'vessel', distanceKm: 1689, typicalHours: 71, viaPoints: [[10.62, 106.88], [10.4, 107.02], [10.15, 107.25], [10.75, 108.6], [11.35, 109.25], [15, 110.6], [18.5, 112.4], [21.6, 114.2], [22.18, 114.05], [22.3, 114.08], [22.33, 114.11]], notesVi: 'Biển Đông, tránh quần đảo Hoàng Sa tới Hồng Kông', notesEn: 'East Sea corridor to Hong Kong' },
  { fromCode: 'VN-VUT', toCode: 'HK-HKG', seaMode: 'vessel', distanceKm: 1654, typicalHours: 70, viaPoints: [[10.38, 107.05], [10.15, 107.25], [10.75, 108.6], [11.35, 109.25], [15, 110.6], [18.5, 112.4], [21.6, 114.2], [22.18, 114.05], [22.3, 114.08], [22.33, 114.11]], notesVi: 'Biển Đông tới Hồng Kông', notesEn: 'Cai Mep – Hong Kong maritime route' },
  { fromCode: 'VN-DAD', toCode: 'HK-HKG', seaMode: 'vessel', distanceKm: 1002, typicalHours: 45, viaPoints: [[16.22, 108.22], [16.3, 108.45], [18.5, 112.4], [21.6, 114.2], [22.18, 114.05], [22.3, 114.08], [22.33, 114.11]], notesVi: 'Biển Đông, phía nam đảo Hải Nam tới Hồng Kông', notesEn: 'Da Nang – Hong Kong maritime route south of Hainan' },
  { fromCode: 'VN-HPH', toCode: 'HK-HKG', seaMode: 'vessel', distanceKm: 877, typicalHours: 40, viaPoints: [[20.6, 106.95], [20.5, 107.3], [20.3, 108.5], [20.15, 109.8], [20.12, 110.3], [20.12, 110.75], [20.3, 111.2], [21.2, 112.5], [21.65, 113.8], [22.18, 114.05], [22.3, 114.08], [22.33, 114.11]], notesVi: 'Qua eo biển Quỳnh Châu tới Hồng Kông', notesEn: 'Hai Phong – Hong Kong via Qiongzhou Strait' },
  { fromCode: 'VN-HPH', toCode: 'CN-FCG', seaMode: 'vessel', distanceKm: 244, typicalHours: 15, viaPoints: [[20.6, 106.95], [20.5, 107.3], [20.8, 108], [21.45, 108.35]], notesVi: 'Vịnh Bắc Bộ (Hải Phòng – Phòng Thành)', notesEn: 'Gulf of Tonkin (Hai Phong – Fangchenggang)' },
  { fromCode: 'VN-CLI', toCode: 'PH-MNL', seaMode: 'vessel', distanceKm: 1662, typicalHours: 70, viaPoints: [[10.62, 106.88], [10.4, 107.02], [10.15, 107.25], [10.75, 108.6], [11, 110.5], [12.5, 115.5], [14, 119.8], [14.33, 120.52], [14.45, 120.8]], notesVi: 'Biển Đông tới vịnh Manila', notesEn: 'East Sea corridor to Manila Bay' },
  { fromCode: 'HK-HKG', toCode: 'PH-MNL', seaMode: 'vessel', distanceKm: 1244, typicalHours: 54, viaPoints: [[22.33, 114.11], [22.3, 114.08], [22.18, 114.05], [21.6, 114.4], [18, 119.3], [15.5, 119.6], [14.33, 120.52], [14.45, 120.8]], notesVi: 'Hồng Kông – vịnh Manila', notesEn: 'Hong Kong – Manila Bay corridor' },
  { fromCode: 'SG-PSA', toCode: 'HK-HKG', seaMode: 'vessel', distanceKm: 2687, typicalHours: 109, viaPoints: [[1.22, 103.85], [1.21, 104.05], [1.4, 104.55], [5, 106.5], [11, 110.2], [15, 110.6], [18.5, 112.4], [21.6, 114.2], [22.18, 114.05], [22.3, 114.08], [22.33, 114.11]], notesVi: 'Trục hàng hải Singapore – Hồng Kông', notesEn: 'Singapore – Hong Kong trunk corridor' },

  // Eo biển Malacca, Myanmar, Indonesia, Borneo
  { fromCode: 'SG-PSA', toCode: 'MY-PKG', seaMode: 'vessel', distanceKm: 385, typicalHours: 21, viaPoints: [[1.2, 103.72], [1.17, 103.55], [1.4, 103.05], [1.8, 102.55], [2.1, 102.05], [2.55, 101.55], [2.9, 101.18]], notesVi: 'Eo biển Malacca (Singapore – Port Klang)', notesEn: 'Strait of Malacca (Singapore – Port Klang)' },
  { fromCode: 'MY-PKG', toCode: 'MY-PEN', seaMode: 'vessel', distanceKm: 339, typicalHours: 19, viaPoints: [[2.9, 101.18], [3.6, 100.6], [4.6, 100.2], [5.15, 100.32]], notesVi: 'Eo biển Malacca phía bắc', notesEn: 'Northern Strait of Malacca' },
  { fromCode: 'MY-PEN', toCode: 'MM-RGN', seaMode: 'vessel', distanceKm: 1435, typicalHours: 61, viaPoints: [[5.55, 100.3], [5.8, 100.1], [6, 99], [8, 97.5], [11, 96.9], [14, 97], [16.2, 96.5], [16.47, 96.37]], notesVi: 'Biển Andaman (Penang – Yangon)', notesEn: 'Andaman Sea (Penang – Yangon)' },
  { fromCode: 'MY-PKG', toCode: 'ID-BLW', seaMode: 'vessel', distanceKm: 321, typicalHours: 18, viaPoints: [[2.9, 101.18], [3.1, 100.6], [3.7, 99.2]], notesVi: 'Băng ngang eo Malacca (Port Klang – Medan)', notesEn: 'Cross-Malacca Strait (Port Klang – Belawan)' },
  { fromCode: 'SG-PSA', toCode: 'ID-JKT', seaMode: 'vessel', distanceKm: 1022, typicalHours: 45, viaPoints: [[1.22, 103.85], [1.21, 104.05], [1.25, 104.65], [0.6, 104.8], [-0.4, 105.15], [-1.4, 106.6], [-2.55, 107.1], [-4.5, 106.9], [-5.85, 106.85]], notesVi: 'Qua eo Gaspar tới Jakarta', notesEn: 'Singapore – Jakarta via Gaspar Strait' },
  { fromCode: 'ID-JKT', toCode: 'ID-SUB', seaMode: 'vessel', distanceKm: 740, typicalHours: 34, viaPoints: [[-5.85, 106.85], [-5.95, 108.5], [-6, 110], [-6, 111.5], [-6.75, 112.55], [-7.1, 112.68]], notesVi: 'Biển Java (Jakarta – Surabaya)', notesEn: 'Java Sea (Jakarta – Surabaya)' },
  { fromCode: 'SG-PSA', toCode: 'MY-KCH', seaMode: 'vessel', distanceKm: 806, typicalHours: 37, viaPoints: [[1.22, 103.85], [1.21, 104.05], [1.4, 104.55], [2.4, 108.5], [2.3, 109.9], [1.75, 110.45]], notesVi: 'Biển Đông – Sarawak (Kuching)', notesEn: 'South China Sea – Sarawak (Kuching)' },
  { fromCode: 'SG-PSA', toCode: 'BN-MUA', seaMode: 'vessel', distanceKm: 1335, typicalHours: 57, viaPoints: [[1.22, 103.85], [1.21, 104.05], [1.4, 104.55], [3.2, 108.6], [5.1, 114.5], [5.08, 114.95]], notesVi: 'Biển Đông – Brunei (Muara)', notesEn: 'South China Sea – Brunei (Muara)' },
  { fromCode: 'BN-MUA', toCode: 'MY-BKI', seaMode: 'vessel', distanceKm: 206, typicalHours: 14, viaPoints: [[5.2, 114.95], [5.6, 115], [6, 115.7], [6.1, 116.05]], notesVi: 'Ven biển Sabah', notesEn: 'Sabah coastal corridor' },

  // Duyên hải Trung Quốc (Hồng Kông → Quảng Châu / Thâm Quyến → Hạ Môn → Thượng Hải → Thanh Đảo → Thiên Tân)
  { fromCode: 'HK-HKG', toCode: 'CN-NSA', seaMode: 'vessel', distanceKm: 61, typicalHours: 8, viaPoints: [[22.35, 114.06], [22.4, 113.88], [22.56, 113.74]], notesVi: 'Cửa sông Châu Giang (Hồng Kông – Quảng Châu)', notesEn: 'Pearl River Estuary (Hong Kong – Nansha)' },
  { fromCode: 'HK-HKG', toCode: 'CN-SHK', seaMode: 'vessel', distanceKm: 28, typicalHours: 7, viaPoints: [[22.35, 114.06], [22.43, 113.93]], notesVi: 'Cửa sông Châu Giang (Hồng Kông – Thâm Quyến)', notesEn: 'Pearl River Estuary (Hong Kong – Shekou)' },
  { fromCode: 'HK-HKG', toCode: 'CN-XMN', seaMode: 'vessel', distanceKm: 514, typicalHours: 26, viaPoints: [[22.3, 114.16], [22.28, 114.25], [22.22, 114.33], [22.5, 115.6], [23.2, 117.3], [24.38, 118.1]], notesVi: 'Ven biển Quảng Đông – Phúc Kiến', notesEn: 'Guangdong – Fujian coastal corridor' },
  { fromCode: 'HK-HKG', toCode: 'CN-HAK', seaMode: 'vessel', distanceKm: 500, typicalHours: 25, viaPoints: [[22.33, 114.11], [22.3, 114.08], [22.18, 114.05], [21.65, 113.8], [21.2, 112.5], [20.3, 111.2], [20.12, 110.75], [20.08, 110.35]], notesVi: 'Hồng Kông – Hải Nam', notesEn: 'Hong Kong – Hainan corridor' },
  { fromCode: 'CN-XMN', toCode: 'CN-SHA', seaMode: 'vessel', distanceKm: 941, typicalHours: 42, viaPoints: [[24.38, 118.1], [25.2, 120.1], [27, 121.3], [29.9, 122.95], [30.45, 122.35]], notesVi: 'Eo biển Đài Loan – Thượng Hải', notesEn: 'Taiwan Strait – Shanghai maritime route' },
  { fromCode: 'CN-SHA', toCode: 'CN-TAO', seaMode: 'vessel', distanceKm: 719, typicalHours: 34, viaPoints: [[30.45, 122.35], [30.9, 122.55], [32.5, 122.7], [35.6, 120.8]], notesVi: 'Hoàng Hải (Thượng Hải – Thanh Đảo)', notesEn: 'Yellow Sea (Shanghai – Qingdao)' },
  { fromCode: 'CN-TAO', toCode: 'CN-TSN', seaMode: 'vessel', distanceKm: 845, typicalHours: 39, viaPoints: [[35.8, 120.7], [36.6, 122.8], [37.4, 123], [38.5, 121.2], [38.7, 119]], notesVi: 'Vòng bán đảo Sơn Đông vào vịnh Bột Hải (Thanh Đảo – Thiên Tân)', notesEn: 'Rounding Shandong Peninsula into Bohai Sea (Qingdao – Tianjin)' },
];

function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((a[0] * Math.PI) / 180) *
      Math.cos((b[0] * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

const PORT_BY_CODE = new Map<string, SeaportNode>(ASEAN_CHINA_SEAPORTS.map((p) => [p.code, p]));

export function findNearestSeaport(
  coords: [number, number],
  country: string,
  options: { internationalOnly: boolean }
): SeaportNode {
  const filterPort = (p: SeaportNode) => {
    if (options.internationalOnly && !p.isInternational) return false;
    return p.supportsVessel;
  };

  let pool = ASEAN_CHINA_SEAPORTS.filter((p) => p.country === country && filterPort(p));
  if (pool.length === 0) {
    pool = ASEAN_CHINA_SEAPORTS.filter(filterPort);
  }
  if (pool.length === 0) {
    pool = ASEAN_CHINA_SEAPORTS;
  }

  let best = pool[0];
  let bestDist = Infinity;
  for (const port of pool) {
    const d = haversineKm(coords, port.coords);
    if (d < bestDist) {
      bestDist = d;
      best = port;
    }
  }
  return best;
}

interface GraphAdj {
  to: string;
  edge: SeaCorridorEdge;
  reversed: boolean;
}

function findShortestSeaEdges(
  startCode: string,
  endCode: string
): GraphAdj[] | null {
  if (startCode === endCode) return [];

  const adj = new Map<string, GraphAdj[]>();
  for (const edge of ASEAN_CHINA_SEA_ROUTES) {
    if (edge.seaMode !== 'vessel') continue;
    if (!adj.has(edge.fromCode)) adj.set(edge.fromCode, []);
    if (!adj.has(edge.toCode)) adj.set(edge.toCode, []);
    adj.get(edge.fromCode)!.push({ to: edge.toCode, edge, reversed: false });
    adj.get(edge.toCode)!.push({ to: edge.fromCode, edge, reversed: true });
  }

  const dist = new Map<string, number>();
  const prev = new Map<string, { from: string; step: GraphAdj }>();
  const visited = new Set<string>();
  dist.set(startCode, 0);

  while (true) {
    let curr: string | null = null;
    let bestD = Infinity;
    for (const [node, d] of dist.entries()) {
      if (!visited.has(node) && d < bestD) {
        bestD = d;
        curr = node;
      }
    }
    if (!curr) break;
    if (curr === endCode) break;
    visited.add(curr);

    for (const step of adj.get(curr) || []) {
      const nextD = bestD + step.edge.distanceKm;
      if (nextD < (dist.get(step.to) ?? Infinity)) {
        dist.set(step.to, nextD);
        prev.set(step.to, { from: curr, step });
      }
    }
  }

  if (!prev.has(endCode)) return null;

  const steps: GraphAdj[] = [];
  let cursor = endCode;
  while (cursor !== startCode) {
    const p = prev.get(cursor);
    if (!p) return null;
    steps.unshift(p.step);
    cursor = p.from;
  }
  return steps;
}

/**
 * Resolves the optimal dedicated-vessel maritime corridor within ASEAN + China using real offshore via_points.
 * Returns null if either endpoint is outside the ASEAN+China vessel port radius (> 450 km) or shares the same port.
 */
export function resolveAseanChinaSeaCorridor(
  originCoords: [number, number],
  originCountry: string,
  destCoords: [number, number],
  destCountry: string,
  isDomestic: boolean
): SeaPathResult | null {
  const oVessel = findNearestSeaport(originCoords, originCountry, {
    internationalOnly: !isDomestic,
  });
  const dVessel = findNearestSeaport(destCoords, destCountry, {
    internationalOnly: !isDomestic,
  });

  if (haversineKm(originCoords, oVessel.coords) > 450 || haversineKm(destCoords, dVessel.coords) > 450) {
    return null;
  }

  if (oVessel.code === dVessel.code || haversineKm(oVessel.coords, dVessel.coords) < 5) {
    return null;
  }

  const vesselSteps = findShortestSeaEdges(oVessel.code, dVessel.code);
  if (vesselSteps && vesselSteps.length > 0) {
    return assembleSeaPathResult(oVessel, dVessel, vesselSteps);
  }

  return null;
}

const PORT_CALL_PENALTY_HOURS = 12;

function assembleSeaPathResult(
  fromPort: SeaportNode,
  toPort: SeaportNode,
  steps: GraphAdj[]
): SeaPathResult {
  const pathCoords: [number, number][] = [fromPort.coords];
  const transitPorts: SeaportNode[] = [];
  let distanceKm = 0;
  let durationHours = 0;
  const notesVi: string[] = [];
  const notesEn: string[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const pts = step.reversed ? [...step.edge.viaPoints].reverse() : step.edge.viaPoints;
    for (const pt of pts) {
      pathCoords.push(pt);
    }
    const targetPort = PORT_BY_CODE.get(step.to);
    if (targetPort) {
      pathCoords.push(targetPort.coords);
      if (i < steps.length - 1) {
        transitPorts.push(targetPort);
      }
    }
    distanceKm += step.edge.distanceKm;
    // Match backend route-network.policy.ts: +12h port call penalty for each intermediate transshipment
    durationHours += step.edge.typicalHours + (i > 0 ? PORT_CALL_PENALTY_HOURS : 0);
    notesVi.push(step.edge.notesVi);
    notesEn.push(step.edge.notesEn);
  }

  return {
    fromPort,
    toPort,
    effectiveSeaMode: 'vessel',
    transitPorts,
    pathCoords,
    distanceKm: Math.round(distanceKm),
    durationHours: Math.round(durationHours * 10) / 10,
    corridorNotesVi: notesVi.join(' → '),
    corridorNotesEn: notesEn.join(' → '),
  };
}
