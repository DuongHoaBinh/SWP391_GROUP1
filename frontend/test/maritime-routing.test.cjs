const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const libCache = new Map();
function loadLib(relFile) {
  const filename = path.resolve(__dirname, '../src/lib', relFile);
  if (libCache.has(filename)) return libCache.get(filename);
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = module.paths;
  compiled.require = (name) => {
    if (name.startsWith('.')) {
      const target = path.resolve(path.dirname(filename), name.endsWith('.ts') ? name : `${name}.ts`);
      return loadLib(path.relative(path.resolve(__dirname, '../src/lib'), target));
    }
    return require(name);
  };
  const src = fs.readFileSync(filename, 'utf8');
  const transpiled = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  compiled._compile(transpiled, filename);
  libCache.set(filename, compiled.exports);
  return compiled.exports;
}

const maritime = loadLib('maritime-routing.ts');
const geo = loadLib('geo-corridors.ts');

/**
 * Helper: normalize longitude into [-180, 180] for land-box checking.
 */
function wrapLng(lng) {
  let x = lng;
  while (x > 180) x -= 360;
  while (x < -180) x += 360;
  return x;
}

/**
 * Helper: sample points densely along each segment and check none fall inside a land polygon/box.
 */
function assertAvoidsLandBox(coords, box, label) {
  const [minLat, maxLat, minLng, maxLng] = box;
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    const steps = 12;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const lat = a[0] + (b[0] - a[0]) * t;
      const lng = wrapLng(a[1] + (b[1] - a[1]) * t);
      const inside = lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng;
      assert.equal(
        inside,
        false,
        `Sea route "${label}" crossed interior landmass box [${box.join(', ')}] at [${lat.toFixed(2)}, ${lng.toFixed(2)}]`,
      );
    }
  }
}

test('all KNOWN_SEAPORTS are connected in the maritime graph without fallback', () => {
  assert.ok(geo.KNOWN_SEAPORTS.length >= 40, `Expected expanded seaports catalog, got ${geo.KNOWN_SEAPORTS.length}`);
  const vnCli = geo.KNOWN_SEAPORTS.find((p) => p.code === 'VN-CLI');
  assert.ok(vnCli);

  for (const port of geo.KNOWN_SEAPORTS) {
    if (port.code === 'VN-CLI') continue;
    const res = maritime.computeMaritimeRoute(vnCli.code, port.code, vnCli.coords, port.coords);
    assert.equal(res.usedFallback, false, `Expected graph route from VN-CLI to ${port.code}`);
    assert.ok(res.pathCoords.length >= 2, `Expected polyline vertices for VN-CLI -> ${port.code}`);
    assert.ok(res.distanceKm >= 40, `Expected positive distance for VN-CLI -> ${port.code}`);
  }
});

test('Vietnam (Cat Lai) to Dubai (Jebel Ali) avoids landmasses in maritime graph & blocks >7-day equine sea booking', () => {
  const vnToDubai = maritime.computeMaritimeRoute('VN-CLI', 'AE-DXB', [10.7617, 106.7894], [25.0112, 55.0612]);
  assert.equal(vnToDubai.usedFallback, false);
  assert.ok(Array.isArray(vnToDubai.pathCoords) && vnToDubai.pathCoords.length > 20, 'Expected smooth maritime polyline');

  // Realistic maritime distance Vietnam -> Dubai via Singapore & Malacca Strait & south of Sri Lanka (~6,800 - 8,000 km)
  assert.ok(
    vnToDubai.distanceKm >= 6600 && vnToDubai.distanceKm <= 8200,
    `Expected realistic sea distance VN->Dubai (6600-8200 km), got ${vnToDubai.distanceKm} km`,
  );

  // Must avoid mainland Thailand / Myanmar / Indochina interior
  assertAvoidsLandBox(vnToDubai.pathCoords, [13.5, 22.0, 96.5, 105.0], 'VN->Dubai (Thailand/Myanmar)');
  // Must avoid Indian subcontinent interior (Deccan & central India)
  assertAvoidsLandBox(vnToDubai.pathCoords, [10.0, 25.0, 74.5, 84.0], 'VN->Dubai (India interior)');
  // Must avoid Sri Lanka interior
  assertAvoidsLandBox(vnToDubai.pathCoords, [6.5, 9.2, 80.1, 81.5], 'VN->Dubai (Sri Lanka)');
  // Must avoid Malay Peninsula interior
  assertAvoidsLandBox(vnToDubai.pathCoords, [2.5, 6.5, 101.8, 103.1], 'VN->Dubai (Malay Peninsula)');
  // Must avoid Sumatra interior (North & Central Sumatra along its NW-SE axis)
  assertAvoidsLandBox(vnToDubai.pathCoords, [1.5, 4.8, 96.5, 99.3], 'VN->Dubai (North Sumatra)');
  assertAvoidsLandBox(vnToDubai.pathCoords, [-2.5, 1.0, 99.5, 102.2], 'VN->Dubai (Central Sumatra)');
  // Must avoid Oman interior
  assertAvoidsLandBox(vnToDubai.pathCoords, [19.0, 23.0, 55.0, 58.5], 'VN->Dubai (Oman)');

  // Equine welfare cap: > 7 days sea booking must return seaUnavailableNotice recommending Air
  const route = geo.buildEquineRoute(
    'Trang trại Củ Chi, TP. Hồ Chí Minh',
    'Meydan Racecourse (Dubai, UAE)',
    'sea',
    'International',
  );
  assert.ok(route.seaUnavailableNotice && route.seaUnavailableNotice.vi.includes('7 ngày'));
  assert.equal(route.legs.length, 0);
});

test('Vietnam (Cat Lai) to Thailand (Laem Chabang) curves south around Ca Mau peninsula', () => {
  const route = geo.buildEquineRoute(
    'Trang trại Củ Chi, TP. Hồ Chí Minh',
    'Royal Bangkok Sports Club (Bangkok, Thái Lan)',
    'sea',
    'International',
  );
  const seaLeg = route.legs.find((l) => l.type === 'sea');
  assert.ok(seaLeg && seaLeg.pathCoords);
  assert.ok(
    seaLeg.distanceKm >= 1050 && seaLeg.distanceKm <= 1650,
    `Expected realistic sea distance VN->TH (1050-1650 km), got ${seaLeg.distanceKm} km`,
  );
  // Must avoid Mekong Delta / Cambodia interior
  assertAvoidsLandBox(seaLeg.pathCoords, [9.3, 12.5, 104.9, 106.4], 'VN->TH (Mekong/Cambodia)');
  // Must go south of Ca Mau Cape (< 8.6°N)
  assert.ok(
    seaLeg.pathCoords.some(([lat]) => lat < 8.5),
    'Expected sea route to curve south around Ca Mau Cape (< 8.5°N)',
  );
});

test('Vietnam (Hai Phong) to Hong Kong / Tokyo avoids Hainan Island interior', () => {
  const hphToTyo = maritime.computeMaritimeRoute('VN-HPH', 'JP-TYO', [20.8449, 106.8891], [35.4437, 139.6503]);
  assert.equal(hphToTyo.usedFallback, false);
  assert.ok(
    hphToTyo.distanceKm >= 3400 && hphToTyo.distanceKm <= 4800,
    `Expected realistic sea distance Hai Phong -> Tokyo (3400-4800 km), got ${hphToTyo.distanceKm} km`,
  );
  // Must avoid Hainan Island interior
  assertAvoidsLandBox(hphToTyo.pathCoords, [18.5, 19.9, 108.9, 110.7], 'Hai Phong->Tokyo (Hainan)');
  // Must avoid Taiwan interior
  assertAvoidsLandBox(hphToTyo.pathCoords, [22.8, 24.8, 120.5, 121.4], 'Hai Phong->Tokyo (Taiwan)');

  // Short-haul Hai Phong -> Hong Kong (<= 7 days) must succeed in buildEquineRoute
  const hkRoute = geo.buildEquineRoute(
    'Trang trại Ngựa Thể thao Sóc Sơn, Hà Nội',
    'Sha Tin Racecourse (Hồng Kông)',
    'sea',
    'International',
  );
  assert.equal(hkRoute.seaUnavailableNotice, null);
  assert.ok(hkRoute.legs.some((l) => l.type === 'sea'));
});

test('Vietnam to Europe (London / Paris / Brussels) goes via Suez & avoids Arabian and Iberian interiors', () => {
  const vnToUk = maritime.computeMaritimeRoute('VN-CLI', 'GB-FXT', [10.7617, 106.7894], [51.954, 1.326]);
  assert.equal(vnToUk.usedFallback, false);
  assert.ok(
    vnToUk.distanceKm >= 15000 && vnToUk.distanceKm <= 19000,
    `Expected realistic sea distance VN->UK (15000-19000 km), got ${vnToUk.distanceKm} km`,
  );
  assertAvoidsLandBox(vnToUk.pathCoords, [18.0, 29.0, 41.0, 52.0], 'VN->UK (Arabian Peninsula)');
  assertAvoidsLandBox(vnToUk.pathCoords, [38.0, 42.0, -7.5, -1.0], 'VN->UK (Iberian Peninsula)');

  // Equine welfare cap blocks >7-day VN -> UK sea booking
  const route = geo.buildEquineRoute('Trang trại Củ Chi, TP. Hồ Chí Minh', 'Newmarket Racecourse (Anh Quốc)', 'sea', 'International');
  assert.ok(route.seaUnavailableNotice !== null);
});

test('Vietnam to Sydney and Melbourne avoid Australian Outback interior', () => {
  const toSydney = maritime.computeMaritimeRoute('VN-CLI', 'AU-SYD', [10.7617, 106.7894], [-33.9708, 151.2165]);
  assert.equal(toSydney.usedFallback, false);
  assert.ok(
    toSydney.distanceKm >= 6500 && toSydney.distanceKm <= 9200,
    `Expected realistic sea distance VN->Sydney (6500-9200 km), got ${toSydney.distanceKm} km`,
  );
  assertAvoidsLandBox(toSydney.pathCoords, [-32.0, -16.0, 120.0, 146.0], 'VN->Sydney (Australia interior)');

  const toMelbourne = maritime.computeMaritimeRoute('VN-CLI', 'AU-MEL', [10.7617, 106.7894], [-37.835, 144.915]);
  assert.equal(toMelbourne.usedFallback, false);
  assertAvoidsLandBox(toMelbourne.pathCoords, [-32.0, -16.0, 120.0, 146.0], 'VN->Melbourne (Australia interior)');

  // Trans-oceanic road VN -> Japan must be rejected in buildEquineRoute
  const roadJapan = geo.buildEquineRoute('Trang trại Củ Chi, TP. Hồ Chí Minh', 'Tokyo Racecourse (JRA Fuchu, Nhật Bản)', 'road', 'International');
  assert.ok(roadJapan.seaUnavailableNotice !== null, 'Expected trans-oceanic road VN->Japan to be blocked');
  assert.equal(roadJapan.legs.length, 0);
});

test('Trans-Pacific routes unwrap antimeridian ±180° continuously without horizontal jump', () => {
  const vnToLax = maritime.computeMaritimeRoute('VN-CLI', 'US-LAX', [10.7617, 106.7894], [33.74, -118.27]);
  assert.equal(vnToLax.usedFallback, false);
  assert.equal(vnToLax.crossesAntimeridian, true, 'Expected VN->LAX to cross the antimeridian');
  assert.ok(
    vnToLax.distanceKm >= 11500 && vnToLax.distanceKm <= 15500,
    `Expected realistic trans-Pacific distance (11500-15500 km), got ${vnToLax.distanceKm} km`,
  );

  for (let i = 0; i < vnToLax.pathCoords.length - 1; i++) {
    const dLng = Math.abs(vnToLax.pathCoords[i + 1][1] - vnToLax.pathCoords[i][1]);
    assert.ok(
      dLng < 20,
      `Detected antimeridian jump of ${dLng.toFixed(2)}° at segment ${i}`,
    );
  }
});

test('Landlocked countries and inland cities > 400 km from seaports return seaUnavailableNotice and zero legs', () => {
  // 1. Laos (landlocked)
  const laos = geo.buildEquineRoute(
    'Trang trại Củ Chi, TP. Hồ Chí Minh',
    'Vientiane Equestrian Center (Lào)',
    'sea',
    'International',
  );
  assert.ok(laos.seaUnavailableNotice, 'Expected seaUnavailableNotice for Laos');
  assert.equal(laos.legs.length, 0, 'Must not draw impossible legs for Laos');

  // 2. Switzerland (landlocked, passed via GeocodedLocation)
  const switzerland = geo.buildEquineRoute(
    'Trang trại Củ Chi, TP. Hồ Chí Minh',
    'Zurich, Switzerland',
    'sea',
    'International',
    null,
    [47.3769, 8.5417],
    null,
    { coords: [47.3769, 8.5417], displayName: 'Zurich', country: 'Thụy Sĩ', countryCode: 'CH' },
  );
  assert.ok(switzerland.seaUnavailableNotice, 'Expected seaUnavailableNotice for Switzerland');
  assert.equal(switzerland.legs.length, 0);

  // 3. Austria (landlocked)
  const austria = geo.buildEquineRoute(
    'Trang trại Củ Chi, TP. Hồ Chí Minh',
    'Vienna, Austria',
    'sea',
    'International',
    null,
    [48.2082, 16.3738],
    null,
    { coords: [48.2082, 16.3738], displayName: 'Vienna', country: 'Áo', countryCode: 'AT' },
  );
  assert.ok(austria.seaUnavailableNotice, 'Expected seaUnavailableNotice for Austria');
  assert.equal(austria.legs.length, 0);

  // 4. Inland US city > 400 km from seaports (Louisville, Kentucky)
  const kentucky = geo.buildEquineRoute(
    'Trang trại Củ Chi, TP. Hồ Chí Minh',
    'Churchill Downs (Louisville, Kentucky, Mỹ)',
    'sea',
    'International',
  );
  assert.ok(kentucky.seaUnavailableNotice, 'Expected seaUnavailableNotice for Louisville KY (>400km inland)');
  assert.equal(kentucky.legs.length, 0);

  // 5. Inland Indian city > 400 km from seaports (New Delhi)
  const delhi = geo.buildEquineRoute(
    'Trang trại Củ Chi, TP. Hồ Chí Minh',
    'Delhi Race Club (New Delhi, Ấn Độ)',
    'sea',
    'International',
  );
  assert.ok(delhi.seaUnavailableNotice, 'Expected seaUnavailableNotice for New Delhi (>400km inland)');
  assert.equal(delhi.legs.length, 0);
});

test('Same-port short domestic route still falls back cleanly to direct road', () => {
  const local = geo.buildEquineRoute(
    'Trang trại Củ Chi, TP. Hồ Chí Minh',
    'Bình Dương (Khu Đua ngựa Đại Nam)',
    'sea',
    'Domestic',
  );
  assert.equal(local.mode, 'road');
  assert.ok(local.airFallbackNotice);
  assert.equal(local.seaUnavailableNotice, null);
  assert.equal(local.legs.length, 1);
});

test('All maritime graph edges and key global smoothed routes avoid island and coastal landmasses', () => {
  const pointInPoly = (pt, poly) => {
    const [y, x] = pt;
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [yi, xi] = poly[i];
      const [yj, xj] = poly[j];
      const intersect = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  };

  const landPolygons = [
    { name: 'Luzon interior', poly: [[15.1,120.2],[16.3,120.0],[18.4,120.7],[18.3,122.2],[15.5,121.6],[14.8,121.4]] },
    { name: 'South Sulawesi', poly: [[-5.4,119.5],[-3.0,119.3],[-2.5,120.5],[-5.4,120.3]] },
    { name: 'SE Sulawesi / Buton', poly: [[-5.4,121.7],[-3.5,121.4],[-3.6,122.5],[-5.3,123.0]] },
    { name: 'Bangka Island', poly: [[-1.6,105.4],[-1.8,106.1],[-2.8,106.4],[-2.7,105.9]] },
    { name: 'Kyushu (Japan)', poly: [[31.3,130.3],[33.3,129.8],[33.6,131.5],[31.5,131.2]] },
    { name: 'Sri Lanka', poly: [[6.2,80.1],[9.3,80.2],[8.5,81.6],[6.3,81.4]] },
    { name: 'Oman / Arabian Peninsula', poly: [[13.5,44.0],[17.0,53.5],[21.5,59.3],[22.3,59.6],[25.0,56.1],[24.2,54.2],[24.8,51.2],[25.9,51.2],[26.0,49.8],[29.0,36.0],[18.0,42.0]] },
    { name: 'Sinai Peninsula', poly: [[28.0,33.7],[29.8,32.8],[31.0,33.8],[29.5,34.8]] },
    { name: 'Sardinia', poly: [[39.0,8.5],[41.1,8.3],[41.1,9.6],[39.1,9.5]] },
    { name: 'Corsica', poly: [[41.5,8.8],[42.8,9.0],[42.8,9.5],[41.5,9.3]] },
    { name: 'Mallorca', poly: [[39.4,2.5],[39.9,3.0],[39.7,3.4],[39.3,3.0]] },
    { name: 'Spain / Iberia', poly: [[36.8,-2.2],[38.6,0.1],[41.0,0.8],[43.2,-1.5],[43.0,-9.0],[37.2,-8.8],[36.2,-5.3]] },
    { name: 'Australia East NSW coast', poly: [[-28.0,153.2],[-28.7,153.5],[-30.3,153.0],[-32.4,152.3],[-34.0,151.0],[-37.2,149.8],[-35.0,145.0],[-27.0,145.0]] },
    { name: 'New Britain / PNG', poly: [[-5.8,148.5],[-4.4,152.0],[-5.4,151.6],[-6.2,149.5]] },
    { name: 'Cuba', poly: [[20.0,-74.5],[22.5,-84.0],[23.0,-82.0],[22.0,-77.5],[20.5,-74.5]] },
    { name: 'Central America (Costa Rica / Panama)', poly: [[8.5,-83.0],[10.5,-85.5],[11.0,-84.0],[9.2,-80.2],[8.0,-80.5],[7.5,-81.2]] },
    { name: 'US East Coast (NC/VA/SC)', poly: [[32.8,-79.8],[35.2,-75.6],[37.5,-75.7],[39.5,-74.4],[39.5,-79.0],[33.0,-81.0]] },
    { name: 'Son Tra Peninsula', poly: [[16.10,108.23],[16.14,108.25],[16.12,108.31],[16.09,108.28]] },
  ];

  // Check every graph edge
  for (const [u, v] of maritime.MARITIME_EDGES) {
    const a = maritime.MARITIME_NODES[u];
    const b = maritime.MARITIME_NODES[v];
    assert.ok(a && b, `Missing maritime node for edge ${u} <-> ${v}`);
    const [p0, p1] = maritime.unwrapPathContinuous([a, b]);
    for (let s = 1; s < 30; s++) {
      const t = s / 30;
      const lat = p0[0] + (p1[0] - p0[0]) * t;
      const lng = wrapLng(p0[1] + (p1[1] - p0[1]) * t);
      for (const lp of landPolygons) {
        assert.equal(
          pointInPoly([lat, lng], lp.poly),
          false,
          `Edge ${u} <-> ${v} clips ${lp.name} at [${lat.toFixed(2)}, ${lng.toFixed(2)}]`,
        );
      }
    }
  }

  // Check key smoothed routes end-to-end
  const keyPairs = [
    ['VN-CLI', 'AU-SYD'],
    ['VN-CLI', 'IT-GOA'],
    ['VN-CLI', 'ES-BCN'],
    ['VN-CLI', 'US-MIA'],
    ['VN-CLI', 'US-SAV'],
    ['VN-CLI', 'ID-JKT'],
    ['VN-DAD', 'HK-HKG'],
    ['PH-MNL', 'JP-TYO'],
    ['KR-PUS', 'JP-TYO'],
    ['AE-DXB', 'GB-FXT'],
    ['US-MIA', 'US-NYC'],
    ['ES-BCN', 'GB-FXT'],
  ];
  for (const [a, b] of keyPairs) {
    const res = maritime.computeMaritimeRoute(a, b, maritime.MARITIME_NODES[a], maritime.MARITIME_NODES[b]);
    assert.equal(res.usedFallback, false);
    for (let i = 0; i < res.pathCoords.length - 1; i++) {
      const p0 = res.pathCoords[i];
      const p1 = res.pathCoords[i + 1];
      for (let s = 0; s <= 6; s++) {
        const t = s / 6;
        const lat = p0[0] + (p1[0] - p0[0]) * t;
        const lng = wrapLng(p0[1] + (p1[1] - p0[1]) * t);
        for (const lp of landPolygons) {
          assert.equal(
            pointInPoly([lat, lng], lp.poly),
            false,
            `Smoothed route ${a} -> ${b} clips ${lp.name} at [${lat.toFixed(2)}, ${lng.toFixed(2)}]`,
          );
        }
      }
    }
  }
});

test('Cross-border coastal city falls back to nearest international seaport within 400 km (Barcelona -> Nice/Genoa <= 7d)', () => {
  const medRoute = geo.buildEquineRoute(
    'Barcelona, Spain',
    'Nice, France',
    'sea',
    'International',
    [41.3851, 2.1734],
    [43.7102, 7.262],
    { coords: [41.3851, 2.1734], displayName: 'Barcelona, Spain', country: 'Spain', countryCode: 'ES' },
    { coords: [43.7102, 7.262], displayName: 'Nice, France', country: 'France', countryCode: 'FR' },
  );
  assert.equal(medRoute.seaUnavailableNotice, null);
  const seaLeg = medRoute.legs.find((l) => l.type === 'sea');
  assert.ok(seaLeg, 'Expected sea leg for Barcelona -> Nice via Genoa port');
  assert.ok(seaLeg.toName.includes('Genoa'), `Expected Genoa seaport, got ${seaLeg.toName}`);
});

test('ASEAN+China multi-hop sea routes include 12h port-call penalty and block >168h without naive fallback', () => {
  const asean = loadLib('asean-china-network.ts');
  // HCMC -> Qingdao has 3 intermediate port calls (HKG, XMN, SHA): 71+26+42+34 + 3*12 = 209h > 168h
  const hcmcQingdao = asean.resolveAseanChinaSeaCorridor([10.77, 106.7], 'Việt Nam', [36.07, 120.38], 'Trung Quốc', false);
  assert.ok(hcmcQingdao && hcmcQingdao.durationHours > 168, `Expected >168h with port call penalties, got ${hcmcQingdao?.durationHours}`);

  // Hai Phong -> Tianjin must be blocked by >168h welfare cap (must NOT fall back to naive dist/25)
  const hpTianjin = geo.buildEquineRoute(
    'Hải Phòng, Việt Nam',
    'Tianjin, China',
    'sea',
    'International',
    [20.8449, 106.6881],
    [39.0842, 117.2009],
    { coords: [20.8449, 106.6881], displayName: 'Hải Phòng, Việt Nam', country: 'Việt Nam', countryCode: 'VN' },
    { coords: [39.0842, 117.2009], displayName: 'Tianjin, China', country: 'Trung Quốc', countryCode: 'CN' },
  );
  assert.ok(hpTianjin.seaUnavailableNotice && hpTianjin.seaUnavailableNotice.vi.includes('168'), 'Expected 168h welfare block');
  assert.equal(hpTianjin.legs.length, 0, 'Must not draw legs when ASEAN+China corridor exceeds 168h');
});
