/**
 * Offline Maritime Waypoint Graph & Routing Engine
 * Computes realistic water-only shipping lanes between seaports using Dijkstra shortest path,
 * continuous antimeridian (±180°) unwrapping, and convex-hull-preserving Chaikin curve smoothing.
 */

export const MAX_SEAPORT_ROAD_KM = 400;

/**
 * Normalized (lowercase, accent-stripped) landlocked country identifiers.
 */
export const LANDLOCKED_COUNTRIES: ReadonlySet<string> = new Set([
  'lao',
  'laos',
  'nuoc lao',
  'thuy si',
  'switzerland',
  'schweiz',
  'suisse',
  'ao',
  'austria',
  'osterreich',
  'mong co',
  'mongolia',
  'nepal',
  'bhutan',
  'hungary',
  'slovakia',
  'czechia',
  'czech republic',
  'cong hoa sec',
  'belarus',
  'bolivia',
  'paraguay',
  'kazakhstan',
  'uzbekistan',
  'afghanistan',
  'armenia',
  'azerbaijan',
  'kyrgyzstan',
  'tajikistan',
  'turkmenistan',
  'luxembourg',
  'liechtenstein',
  'andorra',
  'san marino',
  'vatican',
  'serbia',
  'north macedonia',
  'moldova',
  'uganda',
  'rwanda',
  'burundi',
  'ethiopia',
  'zambia',
  'zimbabwe',
  'botswana',
  'malawi',
  'lesotho',
  'eswatini',
  'mali',
  'niger',
  'chad',
  'burkina faso',
  'central african republic',
  'south sudan',
]);

function normalizeCountryKey(country?: string | null): string {
  if (!country) return '';
  return country
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isLandlockedCountry(country?: string | null): boolean {
  const key = normalizeCountryKey(country);
  if (!key) return false;
  return LANDLOCKED_COUNTRIES.has(key);
}

/**
 * Great-circle distance in kilometers (Haversine formula).
 * Invariant to ±360° longitude shifts.
 */
export function haversineKmCoords(a: [number, number], b: [number, number]): number {
  const [lat1, lon1] = a;
  const [lat2, lon2] = b;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h =
    sinLat * sinLat +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * sinLon * sinLon;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

/**
 * Water-only maritime network nodes: seaports (keyed by port code),
 * estuary/coastal approach points, and global shipping lane waypoints.
 * Coordinates are [lat, lng] in standard WGS84 [-90, 90] x [-180, 180].
 */
export const MARITIME_NODES: Record<string, [number, number]> = {
  // === SEAPORTS: VIETNAM ===
  'VN-CLI': [10.7617, 106.7894],
  'VN-VUT': [10.5256, 107.0185],
  'VN-HPH': [20.8449, 106.8891],
  'VN-DAD': [16.1219, 108.2194],
  'VN-NHA': [12.2036, 109.2175],
  'VN-RGI': [10.0125, 105.0809],
  'VN-PQC': [10.1557, 104.0402],

  // === SEAPORTS: SOUTHEAST ASIA ===
  'SG-PSA': [1.2737, 103.7909],
  'TH-LCB': [13.0827, 100.883],
  'MY-PKG': [2.9999, 101.3928],
  'MY-PEN': [5.4141, 100.345],
  'KH-KOS': [10.6462, 103.5015],
  'ID-JKT': [-6.1045, 106.8805],
  'ID-SUB': [-7.2008, 112.733],
  'ID-BDJ': [-3.332, 114.558],
  'ID-BPN': [-1.274, 116.805],
  'PH-MNL': [14.585, 120.961],

  // === SEAPORTS: EAST ASIA ===
  'HK-HKG': [22.3456, 114.1228],
  'TW-KHH': [22.565, 120.285],
  'CN-SHA': [30.626, 122.065],
  'CN-GZH': [22.665, 113.665],
  'CN-TSN': [38.985, 117.785],
  'JP-TYO': [35.4437, 139.6503],
  'JP-OSA': [34.65, 135.425],
  'KR-PUS': [35.1028, 129.0403],
  'KR-INC': [37.45, 126.605],

  // === SEAPORTS: SOUTH ASIA ===
  'IN-NSA': [18.95, 72.95],
  'IN-MAA': [13.085, 80.295],

  // === SEAPORTS: MIDDLE EAST ===
  'AE-DXB': [25.0112, 55.0612],
  'AE-AUH': [24.81, 54.65],
  'OM-MCT': [23.628, 58.57],
  'QA-DOH': [25.025, 51.62],
  'SA-DMM': [26.44, 50.15],
  'SA-JED': [21.4858, 39.17],

  // === SEAPORTS: OCEANIA ===
  'AU-SYD': [-33.9708, 151.2165],
  'AU-MEL': [-37.835, 144.915],
  'AU-BNE': [-27.385, 153.175],
  'AU-FRE': [-32.055, 115.74],
  'NZ-AKL': [-36.843, 174.777],

  // === SEAPORTS: EUROPE ===
  'BE-ANR': [51.265, 4.35],
  'NL-RTM': [51.95, 4.135],
  'FR-LEH': [49.475, 0.115],
  'FR-MRS': [43.34, 5.33],
  'GB-FXT': [51.955, 1.32],
  'GB-SOU': [50.897, -1.404],
  'IE-DUB': [53.347, -6.205],
  'DE-HAM': [53.525, 9.935],
  'ES-BCN': [41.345, 2.165],
  'IT-GOA': [44.405, 8.915],
  'IT-NAP': [40.84, 14.27],
  'TR-IST': [40.97, 28.69],

  // === SEAPORTS: NORTH AMERICA ===
  'US-LAX': [33.74, -118.27],
  'US-OAK': [37.795, -122.28],
  'US-SEA': [47.58, -122.35],
  'CA-VAN': [49.29, -123.11],
  'US-NYC': [40.67, -74.14],
  'US-SAV': [32.13, -81.15],
  'US-MIA': [25.775, -80.17],

  // === VIETNAM COASTAL & ESTUARY APPROACH NODES ===
  AP_VN_CLI_EST: [10.48, 106.95],
  AP_VN_CLI: [10.18, 107.12],
  AP_VN_HPH: [20.62, 107.18],
  AP_VN_DAD_N: [16.19, 108.25],
  AP_VN_DAD: [16.2, 108.55],
  AP_VN_NHA: [12.2, 109.55],
  AP_VN_RGI: [9.95, 104.85],

  // === GULF OF THAILAND & CAMAU ===
  AP_TH_LCB: [12.75, 100.7],
  AP_KH_KOS: [10.5, 103.35],
  W_GOT_NW: [11.3, 101.0],
  W_GOT_MID: [10.2, 102.2],
  W_GOT_E: [9.75, 104.25],
  W_CAMAU_W: [8.8, 104.35],
  W_CAMAU_S: [8.15, 104.75],
  W_GOT_S: [7.6, 103.3],

  // === SOUTH CHINA SEA ===
  W_SCS_SW: [8.55, 106.5],
  W_SCS_S: [4.5, 104.5],
  W_SCS_MID_W: [12.0, 110.2],
  W_SCS_CENTRAL_W: [15.8, 109.6],
  W_TONKIN_N: [20.0, 107.8],
  W_TONKIN_S: [17.6, 108.5],
  W_HAINAN_S: [17.65, 110.2],
  W_HAINAN_E: [19.0, 111.6],
  W_PRD_AP: [21.95, 114.2],
  AP_CN_GZH: [22.25, 113.85],
  AP_PH_MNL: [14.42, 120.55],
  W_SCS_MNL: [14.4, 119.5],

  // === EAST CHINA SEA, TAIWAN, YELLOW SEA, JAPAN, KOREA ===
  W_TW_S: [22.3, 119.2],
  W_TW_MID: [24.0, 119.5],
  W_TW_N: [25.6, 120.3],
  W_LUZON_NW: [18.7, 119.8],
  W_LUZON_STR: [20.3, 121.8],
  W_ECS_MID: [28.5, 122.9],
  AP_CN_SHA: [30.55, 122.4],
  W_YS_S: [33.2, 124.2],
  W_YS_N: [37.4, 123.5],
  W_BOHAI_E: [38.55, 120.8],
  W_BOHAI_W: [38.85, 118.4],
  AP_KR_INC: [37.25, 126.2],
  W_KOREA_STR: [34.3, 129.0],
  AP_KR_PUS: [34.95, 129.1],
  W_KYUSHU_W: [32.3, 128.5],
  W_KYUSHU_SW: [30.7, 129.8],
  W_JP_KYUSHU_S: [30.9, 130.8],
  W_JP_SHIKOKU_S: [32.8, 134.5],
  AP_JP_OSA: [34.15, 135.05],
  W_JP_HONSHU_S: [34.3, 138.8],
  AP_JP_TYO: [35.1, 139.75],

  // === SINGAPORE & MALACCA STRAIT ===
  W_SG_E: [1.35, 104.45],
  W_SG_STR: [1.18, 103.82],
  W_MALACCA_SE: [1.22, 103.45],
  W_MALACCA_S: [1.95, 102.25],
  W_MALACCA_MID: [3.0, 100.85],
  W_MALACCA_NW: [4.2, 100.05],
  W_MALACCA_N: [5.45, 99.45],
  W_ACEH_N: [6.2, 95.3],

  // === INDIAN OCEAN, SRI LANKA, INDIA, ARABIAN SEA, PERSIAN GULF ===
  W_ANDAMAN_S: [6.0, 91.5],
  W_SRI_LANKA_S: [5.65, 80.5],
  W_SRI_LANKA_SE: [5.85, 82.0],
  W_SRI_LANKA_E: [8.0, 82.5],
  W_BOB_SW: [12.8, 81.2],
  W_SRI_LANKA_SW: [6.2, 79.0],
  W_INDIA_SW: [8.0, 76.0],
  W_INDIA_W: [14.0, 73.1],
  AP_IN_NSA: [18.8, 72.6],
  W_ARABIAN_SE: [10.5, 71.0],
  W_ARABIAN_MID: [17.5, 64.0],
  W_OMAN_S: [17.4, 57.5],
  W_OMAN_SE: [21.8, 60.6],
  W_OMAN_GULF: [23.2, 60.2],
  AP_OM_MCT: [23.85, 58.7],
  W_HORMUZ_E: [25.8, 57.1],
  W_HORMUZ_N: [26.48, 56.45],
  W_HORMUZ_W: [26.1, 55.6],
  W_PG_E: [25.45, 55.15],
  W_PG_MID: [26.2, 52.8],
  W_PG_W: [26.1, 51.85],
  AP_QA_DOH: [25.3, 51.85],
  AP_SA_DMM: [26.75, 50.85],

  // === RED SEA, SUEZ, MEDITERRANEAN, ATLANTIC, EUROPE ===
  W_SOCOTRA_N: [13.4, 53.5],
  W_ADEN_GULF: [12.5, 46.5],
  W_BAB_EL_MANDEB: [12.65, 43.35],
  W_RED_SEA_S: [16.0, 41.2],
  W_RED_SEA_MID: [21.4, 38.5],
  W_RED_SEA_N: [27.4, 34.1],
  W_GUBAL: [27.75, 33.85],
  W_SUEZ_GULF: [28.9, 33.0],
  W_SUEZ_S: [29.92, 32.56],
  W_SUEZ_N: [31.4, 32.35],
  W_MED_E: [34.3, 26.2],
  W_AEGEAN_S: [36.5, 25.2],
  W_AEGEAN_N: [39.6, 25.5],
  W_DARDANELLES: [40.25, 26.55],
  W_MARMARA: [40.72, 28.15],
  W_MED_IONIAN: [35.8, 16.5],
  W_MED_SICILY_S: [36.6, 12.6],
  W_MED_TUNISIA_N: [37.6, 10.5],
  W_TYRRHENIAN_S: [39.1, 11.1],
  AP_IT_NAP: [40.55, 13.75],
  W_TYRRHENIAN_N: [42.0, 10.2],
  W_ELBA_N: [43.25, 9.75],
  W_MED_ALGIERS_N: [37.5, 4.0],
  W_SARDINIA_W: [40.0, 7.2],
  W_MENORCA_E: [40.0, 4.7],
  AP_FR_MRS: [43.05, 5.2],
  W_LIGURIAN_S: [43.45, 8.5],
  W_CABO_NAO: [38.6, 0.9],
  W_CABO_GATA: [36.4, -1.8],
  W_GIBRALTAR_E: [36.1, -2.5],
  W_GIBRALTAR: [35.96, -5.6],
  W_CADIZ: [36.3, -8.5],
  W_PORTUGAL_SW: [36.9, -9.65],
  W_FINISTERRE: [43.1, -9.85],
  W_USHANT: [48.6, -5.5],
  W_IRISH_SEA_S: [51.6, -5.6],
  AP_IE_DUB: [53.25, -5.8],
  W_CHANNEL_W: [49.8, -2.2],
  AP_GB_SOU: [50.55, -1.2],
  W_CHANNEL_E: [50.45, 0.3],
  W_DOVER: [51.05, 1.55],
  W_NORTH_SEA_S: [52.0, 2.75],
  AP_BE_ANR: [51.42, 3.55],
  W_NORTH_SEA_E: [54.05, 7.6],
  AP_DE_HAM: [53.9, 8.7],

  // === INDONESIA, AUSTRALIA, NEW ZEALAND ===
  W_NATUNA_N: [5.2, 109.0],
  W_BINTAN_E: [0.9, 105.05],
  W_LINGGA_E: [-0.8, 105.8],
  W_BANGKA_NE: [-1.7, 106.75],
  W_BANGKA_E: [-2.85, 106.95],
  W_JAVA_W: [-5.5, 106.95],
  W_KARIMATA_N: [-0.5, 108.2],
  W_KARIMATA_MID: [-2.5, 109.1],
  W_JAVA_MID: [-6.0, 111.5],
  AP_ID_SUB: [-6.75, 112.8],
  AP_ID_BDJ: [-3.85, 114.4],
  W_MAKASSAR_S: [-5.0, 117.5],
  AP_ID_BPN: [-1.8, 117.3],
  W_LOMBOK_N: [-7.5, 115.8],
  W_LOMBOK_STR: [-8.55, 115.8],
  W_LOMBOK_S: [-9.6, 115.75],
  W_FLORES_W: [-6.35, 118.8],
  W_FLORES_E: [-6.6, 122.5],
  W_INDIAN_E: [-14.0, 114.5],
  W_AU_NW: [-20.5, 113.0],
  W_AU_W: [-31.9, 115.2],
  W_AU_SW: [-35.4, 114.8],
  W_AU_BIGHT: [-37.5, 130.0],
  W_BASS_W: [-39.2, 143.5],
  AP_AU_MEL: [-38.32, 144.65],
  W_BASS_E: [-38.2, 149.8],
  W_BANDA_SEA: [-6.2, 127.0],
  W_TORRES_W: [-10.2, 139.5],
  W_TORRES_STR: [-10.45, 142.25],
  W_TORRES_E: [-10.4, 144.8],
  W_CORAL_N: [-14.5, 147.8],
  W_CORAL_S: [-22.5, 153.8],
  AP_AU_BNE: [-27.1, 153.6],
  W_AU_BYRON: [-28.7, 154.15],
  W_AU_NSW_E: [-31.8, 153.5],
  AP_AU_SYD: [-34.05, 151.6],
  W_PHIL_SEA: [15.0, 132.0],
  W_PNG_N: [1.0, 150.5],
  W_NEW_IRELAND_E: [-3.2, 154.5],
  W_SOLOMON_E: [-10.0, 156.5],
  W_TASMAN: [-34.5, 165.0],
  W_NZ_N: [-34.3, 173.2],
  AP_NZ_AKL: [-36.5, 175.1],

  // === TRANS-PACIFIC, TRANS-ATLANTIC & PANAMA ===
  W_NPAC_W: [35.0, 155.0],
  W_NPAC_DATELINE_W: [38.0, 176.0],
  W_NPAC_DATELINE_E: [38.0, -165.0],
  W_NPAC_E: [36.0, -135.0],
  W_CAL_MID: [35.4, -121.8],
  AP_US_OAK: [37.75, -122.75],
  W_CAL_N: [41.5, -125.2],
  W_US_NW_OFF: [46.5, -125.5],
  W_JUAN_DE_FUCA: [48.45, -124.9],
  AP_US_SEA: [48.15, -122.75],
  W_GEORGIA_STR: [49.05, -123.45],
  AP_US_LAX: [33.6, -118.8],
  W_SPAC_W: [-20.0, 176.0],
  W_SPAC_E: [-5.0, -155.0],
  W_EPAC_N: [24.0, -112.5],
  W_EPAC_S: [14.0, -96.0],
  W_COSTA_RICA_SW: [8.0, -85.2],
  W_AZUERO_S: [6.7, -80.5],
  W_PANAMA_S: [8.85, -79.52],
  W_PANAMA_N: [9.4, -79.92],
  W_CARIBBEAN: [15.0, -77.5],
  W_WINDWARD: [19.8, -73.8],
  W_CAICOS_E: [22.6, -73.2],
  W_BAHAMAS_N: [26.4, -77.6],
  W_FLORIDA_STR: [25.6, -79.7],
  W_US_E: [32.5, -79.5],
  W_HATTERAS_E: [35.2, -74.7],
  W_DELMARVA_E: [37.9, -74.3],
  AP_US_NYC: [40.3, -73.5],
  W_ATL_MID: [40.0, -40.0],
};

/**
 * Undirected water-only edges connecting seaports, approach points, and shipping lanes.
 */
export const MARITIME_EDGES: Array<[string, string]> = [
  // Vietnam estuary / coastal approaches
  ['VN-CLI', 'AP_VN_CLI_EST'],
  ['AP_VN_CLI_EST', 'AP_VN_CLI'],
  ['VN-VUT', 'AP_VN_CLI'],
  ['AP_VN_CLI', 'W_SCS_SW'],
  ['AP_VN_CLI', 'W_SCS_MID_W'],

  ['VN-HPH', 'AP_VN_HPH'],
  ['AP_VN_HPH', 'W_TONKIN_N'],
  ['W_TONKIN_N', 'W_TONKIN_S'],
  ['W_TONKIN_S', 'W_SCS_CENTRAL_W'],
  ['W_TONKIN_S', 'W_HAINAN_S'],

  ['VN-DAD', 'AP_VN_DAD_N'],
  ['AP_VN_DAD_N', 'AP_VN_DAD'],
  ['AP_VN_DAD', 'W_SCS_CENTRAL_W'],

  ['VN-NHA', 'AP_VN_NHA'],
  ['AP_VN_NHA', 'W_SCS_MID_W'],

  ['VN-RGI', 'AP_VN_RGI'],
  ['AP_VN_RGI', 'W_GOT_E'],
  ['VN-PQC', 'W_GOT_E'],
  ['VN-PQC', 'W_GOT_MID'],
  ['KH-KOS', 'AP_KH_KOS'],
  ['AP_KH_KOS', 'W_GOT_E'],
  ['AP_KH_KOS', 'W_GOT_MID'],

  // Gulf of Thailand & around Cà Mau
  ['TH-LCB', 'AP_TH_LCB'],
  ['AP_TH_LCB', 'W_GOT_NW'],
  ['W_GOT_NW', 'W_GOT_MID'],
  ['W_GOT_MID', 'W_GOT_E'],
  ['W_GOT_MID', 'W_GOT_S'],
  ['W_GOT_E', 'W_CAMAU_W'],
  ['W_CAMAU_W', 'W_CAMAU_S'],
  ['W_CAMAU_S', 'W_SCS_SW'],
  ['W_CAMAU_S', 'W_GOT_S'],
  ['W_GOT_S', 'W_SCS_S'],

  // South China Sea spine
  ['W_SCS_S', 'W_SCS_SW'],
  ['W_SCS_SW', 'W_SCS_MID_W'],
  ['W_SCS_MID_W', 'W_SCS_CENTRAL_W'],
  ['W_SCS_CENTRAL_W', 'W_HAINAN_S'],
  ['W_HAINAN_S', 'W_HAINAN_E'],
  ['W_HAINAN_E', 'W_PRD_AP'],
  ['W_SCS_MID_W', 'W_HAINAN_E'],
  ['W_SCS_MID_W', 'W_SCS_MNL'],
  ['W_SCS_CENTRAL_W', 'W_SCS_MNL'],
  ['W_SCS_MNL', 'AP_PH_MNL'],
  ['AP_PH_MNL', 'PH-MNL'],

  // Hong Kong, Guangzhou, Taiwan, China, Korea, Japan
  ['W_PRD_AP', 'HK-HKG'],
  ['W_PRD_AP', 'AP_CN_GZH'],
  ['AP_CN_GZH', 'CN-GZH'],
  ['W_PRD_AP', 'W_TW_S'],
  ['W_SCS_MNL', 'W_TW_S'],
  ['W_SCS_MNL', 'W_LUZON_NW'],
  ['W_LUZON_NW', 'W_TW_S'],
  ['W_LUZON_NW', 'W_LUZON_STR'],
  ['W_TW_S', 'TW-KHH'],
  ['W_TW_S', 'W_TW_MID'],
  ['W_TW_MID', 'W_TW_N'],
  ['W_TW_S', 'W_LUZON_STR'],
  ['W_TW_N', 'W_ECS_MID'],
  ['W_ECS_MID', 'AP_CN_SHA'],
  ['AP_CN_SHA', 'CN-SHA'],
  ['W_ECS_MID', 'W_YS_S'],
  ['W_YS_S', 'W_YS_N'],
  ['W_YS_N', 'W_BOHAI_E'],
  ['W_BOHAI_E', 'W_BOHAI_W'],
  ['W_BOHAI_W', 'CN-TSN'],
  ['W_YS_N', 'AP_KR_INC'],
  ['W_YS_S', 'AP_KR_INC'],
  ['AP_KR_INC', 'KR-INC'],
  ['W_ECS_MID', 'W_KOREA_STR'],
  ['W_YS_S', 'W_KOREA_STR'],
  ['W_KOREA_STR', 'AP_KR_PUS'],
  ['AP_KR_PUS', 'KR-PUS'],
  ['W_TW_N', 'W_JP_KYUSHU_S'],
  ['W_ECS_MID', 'W_JP_KYUSHU_S'],
  ['W_KOREA_STR', 'W_KYUSHU_W'],
  ['W_KYUSHU_W', 'W_KYUSHU_SW'],
  ['W_KYUSHU_SW', 'W_JP_KYUSHU_S'],
  ['W_JP_KYUSHU_S', 'W_JP_SHIKOKU_S'],
  ['W_JP_SHIKOKU_S', 'AP_JP_OSA'],
  ['AP_JP_OSA', 'JP-OSA'],
  ['W_JP_SHIKOKU_S', 'W_JP_HONSHU_S'],
  ['W_JP_HONSHU_S', 'AP_JP_TYO'],
  ['AP_JP_TYO', 'JP-TYO'],

  // Singapore & Malacca Strait
  ['W_SCS_S', 'W_SG_E'],
  ['W_SG_E', 'W_SG_STR'],
  ['W_SG_STR', 'SG-PSA'],
  ['W_SG_STR', 'W_MALACCA_SE'],
  ['W_MALACCA_SE', 'W_MALACCA_S'],
  ['W_MALACCA_S', 'W_MALACCA_MID'],
  ['W_MALACCA_MID', 'MY-PKG'],
  ['W_MALACCA_MID', 'W_MALACCA_NW'],
  ['W_MALACCA_NW', 'W_MALACCA_N'],
  ['W_MALACCA_N', 'MY-PEN'],
  ['W_MALACCA_N', 'W_ACEH_N'],

  // Indian Ocean, India, Persian Gulf
  ['W_ACEH_N', 'W_ANDAMAN_S'],
  ['W_ANDAMAN_S', 'W_SRI_LANKA_S'],
  ['W_ANDAMAN_S', 'W_SRI_LANKA_SE'],
  ['W_ANDAMAN_S', 'W_SRI_LANKA_E'],
  ['W_SRI_LANKA_S', 'W_SRI_LANKA_SE'],
  ['W_SRI_LANKA_SE', 'W_SRI_LANKA_E'],
  ['W_SRI_LANKA_E', 'W_BOB_SW'],
  ['W_BOB_SW', 'IN-MAA'],
  ['W_SRI_LANKA_S', 'W_SRI_LANKA_SW'],
  ['W_SRI_LANKA_SW', 'W_INDIA_SW'],
  ['W_INDIA_SW', 'W_INDIA_W'],
  ['W_INDIA_W', 'AP_IN_NSA'],
  ['AP_IN_NSA', 'IN-NSA'],
  ['W_SRI_LANKA_SW', 'W_ARABIAN_SE'],
  ['W_INDIA_SW', 'W_ARABIAN_SE'],
  ['W_INDIA_W', 'W_ARABIAN_MID'],
  ['AP_IN_NSA', 'W_ARABIAN_MID'],
  ['W_ARABIAN_SE', 'W_ARABIAN_MID'],
  ['W_ARABIAN_MID', 'W_OMAN_GULF'],
  ['W_ARABIAN_MID', 'W_OMAN_SE'],
  ['W_OMAN_GULF', 'W_OMAN_SE'],
  ['W_OMAN_SE', 'W_OMAN_S'],
  ['W_OMAN_S', 'W_SOCOTRA_N'],
  ['W_OMAN_GULF', 'AP_OM_MCT'],
  ['AP_OM_MCT', 'OM-MCT'],
  ['W_OMAN_GULF', 'W_HORMUZ_E'],
  ['W_HORMUZ_E', 'W_HORMUZ_N'],
  ['W_HORMUZ_N', 'W_HORMUZ_W'],
  ['W_HORMUZ_W', 'W_PG_E'],
  ['W_PG_E', 'AE-DXB'],
  ['W_PG_E', 'AE-AUH'],
  ['W_PG_MID', 'AE-AUH'],
  ['W_HORMUZ_W', 'W_PG_MID'],
  ['W_PG_E', 'W_PG_MID'],
  ['W_PG_MID', 'W_PG_W'],
  ['W_PG_W', 'AP_QA_DOH'],
  ['AP_QA_DOH', 'QA-DOH'],
  ['W_PG_W', 'AP_SA_DMM'],
  ['AP_SA_DMM', 'SA-DMM'],

  // Red Sea, Suez, Mediterranean, Atlantic, Europe
  ['W_ARABIAN_SE', 'W_SOCOTRA_N'],
  ['W_ARABIAN_MID', 'W_SOCOTRA_N'],
  ['W_SOCOTRA_N', 'W_ADEN_GULF'],
  ['W_ADEN_GULF', 'W_BAB_EL_MANDEB'],
  ['W_BAB_EL_MANDEB', 'W_RED_SEA_S'],
  ['W_RED_SEA_S', 'W_RED_SEA_MID'],
  ['W_RED_SEA_MID', 'SA-JED'],
  ['W_RED_SEA_MID', 'W_RED_SEA_N'],
  ['W_RED_SEA_N', 'W_GUBAL'],
  ['W_GUBAL', 'W_SUEZ_GULF'],
  ['W_SUEZ_GULF', 'W_SUEZ_S'],
  ['W_SUEZ_S', 'W_SUEZ_N'],
  ['W_SUEZ_N', 'W_MED_E'],
  ['W_MED_E', 'W_AEGEAN_S'],
  ['W_AEGEAN_S', 'W_AEGEAN_N'],
  ['W_AEGEAN_N', 'W_DARDANELLES'],
  ['W_DARDANELLES', 'W_MARMARA'],
  ['W_MARMARA', 'TR-IST'],
  ['W_MED_E', 'W_MED_IONIAN'],
  ['W_MED_IONIAN', 'W_MED_SICILY_S'],
  ['W_MED_SICILY_S', 'W_MED_TUNISIA_N'],
  ['W_MED_TUNISIA_N', 'W_MED_ALGIERS_N'],
  ['W_MED_TUNISIA_N', 'W_TYRRHENIAN_S'],
  ['W_TYRRHENIAN_S', 'AP_IT_NAP'],
  ['AP_IT_NAP', 'IT-NAP'],
  ['W_TYRRHENIAN_N', 'AP_IT_NAP'],
  ['W_TYRRHENIAN_S', 'W_TYRRHENIAN_N'],
  ['W_TYRRHENIAN_N', 'W_ELBA_N'],
  ['W_ELBA_N', 'IT-GOA'],
  ['W_ELBA_N', 'W_LIGURIAN_S'],
  ['W_MED_ALGIERS_N', 'W_SARDINIA_W'],
  ['W_SARDINIA_W', 'W_LIGURIAN_S'],
  ['W_LIGURIAN_S', 'IT-GOA'],
  ['W_LIGURIAN_S', 'AP_FR_MRS'],
  ['W_MENORCA_E', 'AP_FR_MRS'],
  ['ES-BCN', 'AP_FR_MRS'],
  ['AP_FR_MRS', 'FR-MRS'],
  ['W_MED_ALGIERS_N', 'W_MENORCA_E'],
  ['W_MENORCA_E', 'W_SARDINIA_W'],
  ['W_MENORCA_E', 'ES-BCN'],
  ['W_LIGURIAN_S', 'ES-BCN'],
  ['W_MED_ALGIERS_N', 'W_GIBRALTAR_E'],
  ['ES-BCN', 'W_CABO_NAO'],
  ['W_CABO_NAO', 'W_CABO_GATA'],
  ['W_CABO_GATA', 'W_GIBRALTAR_E'],
  ['W_GIBRALTAR_E', 'W_GIBRALTAR'],
  ['W_GIBRALTAR', 'W_CADIZ'],
  ['W_CADIZ', 'W_PORTUGAL_SW'],
  ['W_PORTUGAL_SW', 'W_FINISTERRE'],
  ['W_FINISTERRE', 'W_USHANT'],
  ['W_USHANT', 'W_IRISH_SEA_S'],
  ['W_IRISH_SEA_S', 'AP_IE_DUB'],
  ['AP_IE_DUB', 'IE-DUB'],
  ['W_USHANT', 'W_CHANNEL_W'],
  ['W_CHANNEL_W', 'AP_GB_SOU'],
  ['W_CHANNEL_E', 'AP_GB_SOU'],
  ['AP_GB_SOU', 'GB-SOU'],
  ['W_CHANNEL_W', 'W_CHANNEL_E'],
  ['W_CHANNEL_E', 'FR-LEH'],
  ['W_CHANNEL_E', 'W_DOVER'],
  ['W_DOVER', 'W_NORTH_SEA_S'],
  ['W_NORTH_SEA_S', 'GB-FXT'],
  ['W_NORTH_SEA_S', 'NL-RTM'],
  ['W_NORTH_SEA_S', 'AP_BE_ANR'],
  ['AP_BE_ANR', 'BE-ANR'],
  ['W_NORTH_SEA_S', 'W_NORTH_SEA_E'],
  ['W_NORTH_SEA_E', 'AP_DE_HAM'],
  ['AP_DE_HAM', 'DE-HAM'],

  // Indonesia, Australia, New Zealand
  ['W_SCS_SW', 'W_NATUNA_N'],
  ['W_SCS_S', 'W_NATUNA_N'],
  ['W_NATUNA_N', 'W_KARIMATA_N'],
  ['W_SG_E', 'W_BINTAN_E'],
  ['W_BINTAN_E', 'W_LINGGA_E'],
  ['W_LINGGA_E', 'W_BANGKA_NE'],
  ['W_BANGKA_NE', 'W_BANGKA_E'],
  ['W_BANGKA_E', 'W_JAVA_W'],
  ['W_JAVA_W', 'ID-JKT'],
  ['W_LINGGA_E', 'W_KARIMATA_N'],
  ['W_KARIMATA_N', 'W_KARIMATA_MID'],
  ['W_KARIMATA_MID', 'W_JAVA_W'],
  ['W_KARIMATA_MID', 'W_JAVA_MID'],
  ['W_JAVA_W', 'W_JAVA_MID'],
  ['W_JAVA_MID', 'AP_ID_SUB'],
  ['AP_ID_SUB', 'ID-SUB'],
  ['W_JAVA_MID', 'AP_ID_BDJ'],
  ['AP_ID_SUB', 'AP_ID_BDJ'],
  ['AP_ID_BDJ', 'ID-BDJ'],
  ['AP_ID_SUB', 'W_MAKASSAR_S'],
  ['AP_ID_BDJ', 'W_MAKASSAR_S'],
  ['W_MAKASSAR_S', 'AP_ID_BPN'],
  ['AP_ID_BPN', 'ID-BPN'],
  ['W_JAVA_MID', 'W_LOMBOK_N'],
  ['AP_ID_SUB', 'W_LOMBOK_N'],
  ['W_MAKASSAR_S', 'W_LOMBOK_N'],
  ['W_LOMBOK_N', 'W_LOMBOK_STR'],
  ['W_LOMBOK_STR', 'W_LOMBOK_S'],
  ['W_LOMBOK_S', 'W_INDIAN_E'],
  ['W_INDIAN_E', 'W_AU_NW'],
  ['W_AU_NW', 'W_AU_W'],
  ['W_AU_W', 'AU-FRE'],
  ['W_AU_W', 'W_AU_SW'],
  ['W_AU_SW', 'W_AU_BIGHT'],
  ['W_AU_BIGHT', 'W_BASS_W'],
  ['W_BASS_W', 'AP_AU_MEL'],
  ['AP_AU_MEL', 'AU-MEL'],
  ['W_BASS_W', 'W_BASS_E'],
  ['W_BASS_E', 'AP_AU_SYD'],
  ['AP_AU_SYD', 'AU-SYD'],
  ['W_MAKASSAR_S', 'W_FLORES_W'],
  ['W_LOMBOK_N', 'W_FLORES_W'],
  ['W_FLORES_W', 'W_FLORES_E'],
  ['W_FLORES_E', 'W_BANDA_SEA'],
  ['W_BANDA_SEA', 'W_TORRES_W'],
  ['W_TORRES_W', 'W_TORRES_STR'],
  ['W_TORRES_STR', 'W_TORRES_E'],
  ['W_TORRES_E', 'W_CORAL_N'],
  ['W_CORAL_N', 'W_CORAL_S'],
  ['W_CORAL_S', 'AP_AU_BNE'],
  ['AP_AU_BNE', 'AU-BNE'],
  ['AP_AU_BNE', 'W_AU_BYRON'],
  ['W_AU_BYRON', 'W_AU_NSW_E'],
  ['W_AU_NSW_E', 'AP_AU_SYD'],
  ['W_LUZON_STR', 'W_PHIL_SEA'],
  ['W_JP_KYUSHU_S', 'W_PHIL_SEA'],
  ['W_PHIL_SEA', 'W_PNG_N'],
  ['W_PNG_N', 'W_NEW_IRELAND_E'],
  ['W_NEW_IRELAND_E', 'W_SOLOMON_E'],
  ['W_SOLOMON_E', 'W_CORAL_S'],
  ['W_CORAL_S', 'W_TASMAN'],
  ['AP_AU_SYD', 'W_TASMAN'],
  ['W_BASS_E', 'W_TASMAN'],
  ['W_TASMAN', 'W_NZ_N'],
  ['W_NZ_N', 'AP_NZ_AKL'],
  ['AP_NZ_AKL', 'NZ-AKL'],

  // Trans-Pacific, Trans-Atlantic & Panama
  ['W_JP_HONSHU_S', 'W_NPAC_W'],
  ['AP_JP_TYO', 'W_NPAC_W'],
  ['W_PHIL_SEA', 'W_NPAC_W'],
  ['W_NPAC_W', 'W_NPAC_DATELINE_W'],
  ['W_NPAC_DATELINE_W', 'W_NPAC_DATELINE_E'],
  ['W_NPAC_DATELINE_E', 'W_NPAC_E'],
  ['W_NPAC_E', 'AP_US_LAX'],
  ['W_NPAC_E', 'AP_US_OAK'],
  ['W_NPAC_E', 'W_CAL_N'],
  ['W_NPAC_E', 'W_US_NW_OFF'],
  ['AP_US_LAX', 'W_CAL_MID'],
  ['W_CAL_MID', 'AP_US_OAK'],
  ['AP_US_OAK', 'US-OAK'],
  ['AP_US_OAK', 'W_CAL_N'],
  ['W_CAL_N', 'W_US_NW_OFF'],
  ['W_US_NW_OFF', 'W_JUAN_DE_FUCA'],
  ['W_JUAN_DE_FUCA', 'AP_US_SEA'],
  ['AP_US_SEA', 'US-SEA'],
  ['W_JUAN_DE_FUCA', 'W_GEORGIA_STR'],
  ['W_GEORGIA_STR', 'CA-VAN'],
  ['AP_US_LAX', 'US-LAX'],
  ['W_NZ_N', 'W_SPAC_W'],
  ['W_SOLOMON_E', 'W_SPAC_W'],
  ['W_SPAC_W', 'W_SPAC_E'],
  ['W_SPAC_E', 'AP_US_LAX'],
  ['AP_US_LAX', 'W_EPAC_N'],
  ['W_EPAC_N', 'W_EPAC_S'],
  ['W_EPAC_S', 'W_COSTA_RICA_SW'],
  ['W_COSTA_RICA_SW', 'W_AZUERO_S'],
  ['W_AZUERO_S', 'W_PANAMA_S'],
  ['W_PANAMA_S', 'W_PANAMA_N'],
  ['W_PANAMA_N', 'W_CARIBBEAN'],
  ['W_CARIBBEAN', 'W_WINDWARD'],
  ['W_WINDWARD', 'W_CAICOS_E'],
  ['W_CAICOS_E', 'W_BAHAMAS_N'],
  ['W_BAHAMAS_N', 'W_FLORIDA_STR'],
  ['W_CAICOS_E', 'W_US_E'],
  ['W_FLORIDA_STR', 'US-MIA'],
  ['W_FLORIDA_STR', 'W_US_E'],
  ['W_US_E', 'US-SAV'],
  ['W_US_E', 'W_HATTERAS_E'],
  ['W_HATTERAS_E', 'W_DELMARVA_E'],
  ['W_DELMARVA_E', 'AP_US_NYC'],
  ['AP_US_NYC', 'US-NYC'],
  ['AP_US_NYC', 'W_ATL_MID'],
  ['W_ATL_MID', 'W_USHANT'],
  ['W_ATL_MID', 'W_GIBRALTAR'],
];

// Build undirected adjacency list with geodetic edge weights once at module load
type AdjEntry = { to: string; weightKm: number };
const ADJACENCY: Record<string, AdjEntry[]> = {};

function ensureAdjacency(): Record<string, AdjEntry[]> {
  if (Object.keys(ADJACENCY).length > 0) return ADJACENCY;
  for (const id of Object.keys(MARITIME_NODES)) {
    ADJACENCY[id] = [];
  }
  for (const [u, v] of MARITIME_EDGES) {
    const cu = MARITIME_NODES[u];
    const cv = MARITIME_NODES[v];
    if (!cu || !cv) continue;
    const w = haversineKmCoords(cu, cv);
    ADJACENCY[u].push({ to: v, weightKm: w });
    ADJACENCY[v].push({ to: u, weightKm: w });
  }
  return ADJACENCY;
}

function findNearestGraphNode(coords: [number, number]): string {
  let bestId = 'W_SG_E';
  let bestDist = Infinity;
  for (const [id, nodeCoords] of Object.entries(MARITIME_NODES)) {
    const d = haversineKmCoords(coords, nodeCoords);
    if (d < bestDist) {
      bestDist = d;
      bestId = id;
    }
  }
  return bestId;
}

/**
 * Shortest-path Dijkstra between two node IDs in the maritime graph.
 */
function dijkstraMaritimeNodes(startId: string, endId: string): string[] | null {
  const adj = ensureAdjacency();
  if (!adj[startId] || !adj[endId]) return null;
  if (startId === endId) return [startId];

  const dist: Record<string, number> = {};
  const prev: Record<string, string | null> = {};
  const visited = new Set<string>();

  for (const id of Object.keys(adj)) {
    dist[id] = Infinity;
    prev[id] = null;
  }
  dist[startId] = 0;

  while (true) {
    let u: string | null = null;
    let best = Infinity;
    for (const id of Object.keys(adj)) {
      if (!visited.has(id) && dist[id] < best) {
        best = dist[id];
        u = id;
      }
    }
    if (u === null || best === Infinity) break;
    if (u === endId) break;
    visited.add(u);

    for (const edge of adj[u]) {
      if (visited.has(edge.to)) continue;
      const alt = dist[u] + edge.weightKm;
      if (alt < dist[edge.to]) {
        dist[edge.to] = alt;
        prev[edge.to] = u;
      }
    }
  }

  if (dist[endId] === Infinity) return null;

  const path: string[] = [];
  let cur: string | null = endId;
  while (cur !== null) {
    path.push(cur);
    cur = prev[cur];
  }
  path.reverse();
  return path;
}

/**
 * Unwraps longitudes continuously across the antimeridian (±180°) so consecutive vertices
 * never jump by more than 180 degrees in longitude.
 */
export function unwrapPathContinuous(coords: [number, number][]): [number, number][] {
  if (coords.length === 0) return [];
  const out: [number, number][] = [[coords[0][0], coords[0][1]]];
  for (let i = 1; i < coords.length; i++) {
    const prevLng = out[i - 1][1];
    let lng = coords[i][1];
    while (lng - prevLng > 180) lng -= 360;
    while (lng - prevLng < -180) lng += 360;
    out.push([coords[i][0], lng]);
  }
  return out;
}

/**
 * Subdivides long open-ocean spans so curve smoothing preserves channel geometry
 * while rendering smooth ocean spans.
 */
export function subdivideLongSegments(
  coords: [number, number][],
  maxStepKm = 450,
): [number, number][] {
  if (coords.length < 2) return coords.slice();
  const out: [number, number][] = [coords[0]];
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    const d = haversineKmCoords(a, b);
    if (d > maxStepKm) {
      const steps = Math.ceil(d / maxStepKm);
      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    out.push(b);
  }
  return out;
}

/**
 * Chaikin corner-cutting smoothing (convex-hull preserving: never overshoots onto land).
 * Preserves exact start and end port coordinates.
 */
export function smoothMaritimePolyline(
  coords: [number, number][],
  iterations = 2,
): [number, number][] {
  if (coords.length <= 2 || iterations <= 0) return coords.slice();
  let pts = coords.slice();
  for (let iter = 0; iter < iterations; iter++) {
    const next: [number, number][] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      const q: [number, number] = [0.75 * p0[0] + 0.25 * p1[0], 0.75 * p0[1] + 0.25 * p1[1]];
      const r: [number, number] = [0.25 * p0[0] + 0.75 * p1[0], 0.25 * p0[1] + 0.75 * p1[1]];
      if (i > 0) next.push(q);
      if (i < pts.length - 2) next.push(r);
    }
    next.push(pts[pts.length - 1]);
    pts = next;
  }
  return pts;
}

/**
 * Total geodesic length (km) of a polyline.
 */
export function computePolylineDistanceKm(coords: [number, number][]): number {
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    total += haversineKmCoords(coords[i], coords[i + 1]);
  }
  return total;
}

export interface MaritimeRouteResult {
  pathCoords: [number, number][];
  distanceKm: number;
  crossesAntimeridian: boolean;
  usedFallback: boolean;
}

/**
 * Compute a smooth, water-only maritime polyline and geodesic distance between two seaports.
 */
export function computeMaritimeRoute(
  fromPortCode: string,
  toPortCode: string,
  fromCoords: [number, number],
  toCoords: [number, number],
): MaritimeRouteResult {
  const startNodeId = MARITIME_NODES[fromPortCode] ? fromPortCode : findNearestGraphNode(fromCoords);
  const endNodeId = MARITIME_NODES[toPortCode] ? toPortCode : findNearestGraphNode(toCoords);

  const nodeIds = dijkstraMaritimeNodes(startNodeId, endNodeId);
  if (!nodeIds || nodeIds.length === 0) {
    const fallbackUnwrapped = unwrapPathContinuous([fromCoords, toCoords]);
    const dist = Math.max(20, Math.round(computePolylineDistanceKm(fallbackUnwrapped)));
    return {
      pathCoords: fallbackUnwrapped,
      distanceKm: dist,
      crossesAntimeridian: fallbackUnwrapped.some(([, lng]) => lng > 180 || lng < -180),
      usedFallback: true,
    };
  }

  const rawCoords: [number, number][] = [];
  if (!MARITIME_NODES[fromPortCode]) {
    rawCoords.push(fromCoords);
  }
  for (const id of nodeIds) {
    rawCoords.push(MARITIME_NODES[id]);
  }
  if (!MARITIME_NODES[toPortCode]) {
    rawCoords.push(toCoords);
  }

  // Ensure exact port endpoints
  rawCoords[0] = fromCoords;
  rawCoords[rawCoords.length - 1] = toCoords;

  const unwrapped = unwrapPathContinuous(rawCoords);
  const subdivided = subdivideLongSegments(unwrapped, 420);
  const smoothed = smoothMaritimePolyline(subdivided, 2);
  const distanceKm = Math.max(20, Math.round(computePolylineDistanceKm(smoothed)));
  const crossesAntimeridian = smoothed.some(([, lng]) => lng > 180 || lng < -180);

  return {
    pathCoords: smoothed,
    distanceKm,
    crossesAntimeridian,
    usedFallback: false,
  };
}
