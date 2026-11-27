const fs = require('node:fs');
const path = require('node:path');
const mysql = require('../backend/node_modules/mysql2/promise');
const bcrypt = require('../backend/node_modules/bcryptjs');

require('../backend/node_modules/dotenv').config({
  path: path.join(__dirname, '../backend/.env'),
  quiet: true,
});

if (process.env.NODE_ENV === 'production') {
  console.error('ERROR: Refusing to seed demo data in production environment (NODE_ENV=production).');
  process.exit(1);
}

const DEMO_PASSWORD = process.env.DEMO_ACCOUNT_PASSWORD;
if (!DEMO_PASSWORD) {
  console.error('ERROR: Missing environment variable DEMO_ACCOUNT_PASSWORD.');
  console.error('Please define DEMO_ACCOUNT_PASSWORD in backend/.env before running npm run seed:demo');
  process.exit(1);
}

/**
 * Generate a valid, minimal ~450 byte PDF document
 */
function createMinimalPdfBuffer(title) {
  const content = `BT /F1 14 Tf 50 720 Td (${title}) Tj ET\nBT /F1 10 Tf 50 690 Td (DEMO DOCUMENT - EQUITRANSIT SYSTEM - NOT A REAL LEGAL RECORD) Tj ET`;
  const streamLength = Buffer.byteLength(content, 'utf8');

  return Buffer.from(
    `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length ${streamLength} >>
stream
${content}
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000234 00000 n 
0000000350 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
430
%%EOF
`,
    'utf8',
  );
}

async function main() {
  console.log('Connecting to MySQL database...');
  const db = await mysql.createConnection({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 3306),
    database: process.env.DB_NAME ?? 'horse_transport_system',
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    multipleStatements: true,
  });

  try {
    console.log('Hashing demo password using bcrypt (12 rounds)...');
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

    // 1. Ensure Roles
    console.log('Checking roles...');
    const [roles] = await db.query('SELECT role_id, role_name FROM role');
    const roleMap = new Map(roles.map((r) => [r.role_name, r.role_id]));

    const adminRoleId = roleMap.get('Admin');
    const managerRoleId = roleMap.get('Logistics Manager');
    const driverRoleId = roleMap.get('Vehicle Driver / Escort');
    const customerRoleId = roleMap.get('Customer');

    if (!adminRoleId || !managerRoleId || !driverRoleId || !customerRoleId) {
      throw new Error('Required roles missing in database. Please run migrations first.');
    }

    // 2. Seed Demo Accounts
    console.log('Seeding demo accounts (A/B testing, dual-approval SoD)...');
    const demoUsers = [
      { email: 'customer_a@example.com', name: 'Nguyễn Văn Chủ Ngựa (Khách A)', roleId: customerRoleId, phone: '0901111222', specialization: null },
      { email: 'customer_b@example.com', name: 'Trần Thị Chủ Ngựa (Khách B)', roleId: customerRoleId, phone: '0902222333', specialization: null },
      { email: 'manager_a@example.com', name: 'Ngô Văn Quản Lý (Manager 1)', roleId: managerRoleId, phone: '0903333444', specialization: null },
      { email: 'manager_b@example.com', name: 'Vũ Thị Quản Lý (Manager 2 - SoD)', roleId: managerRoleId, phone: '0904444555', specialization: null },
      { email: 'admin_demo@example.com', name: 'Admin Demo (Quản trị viên)', roleId: adminRoleId, phone: '0905555666', specialization: null },
      { email: 'driver_demo1@example.com', name: 'Đặng Văn Lái 1 (Tài xế)', roleId: driverRoleId, phone: '0906666777', specialization: 'driver' },
      { email: 'driver_demo2@example.com', name: 'Hoàng Văn Lái 2 (Tài xế)', roleId: driverRoleId, phone: '0907777888', specialization: 'driver' },
      { email: 'escort_demo@example.com', name: 'BS. Phạm Thú Y (Áp tải lâm sàng)', roleId: driverRoleId, phone: '0908888999', specialization: 'escort' },
    ];

    for (const u of demoUsers) {
      await db.execute(
        `INSERT INTO \`user\` (role_id, full_name, email, phone, specialization, password_hash, account_origin, auth_provider, email_verified, status)
         VALUES (?, ?, ?, ?, ?, ?, 'system_created', 'local', TRUE, 'active')
         ON DUPLICATE KEY UPDATE full_name = VALUES(full_name), password_hash = VALUES(password_hash), phone = VALUES(phone), specialization = VALUES(specialization), role_id = VALUES(role_id), status = 'active'`,
        [u.roleId, u.name, u.email, u.phone, u.specialization, passwordHash],
      );
    }

    // Retrieve Customer IDs
    const [[userA]] = await db.query('SELECT user_id FROM `user` WHERE email = ?', ['customer_a@example.com']);
    const [[userB]] = await db.query('SELECT user_id FROM `user` WHERE email = ?', ['customer_b@example.com']);
    const customerAId = userA.user_id;
    const customerBId = userB.user_id;

    // 3. Execute Depots & Vehicles SQL
    console.log('Seeding demo depots and 12 fleet vehicles...');
    const demoSql = fs.readFileSync(path.join(__dirname, 'seed-demo-after-review.sql'), 'utf8');
    await db.query(demoSql);

    // 4. Generate Valid PDF Documents in uploads directory
    console.log('Generating valid demo PDF files in backend/uploads/documents/...');
    const uploadsDir = path.join(__dirname, '../backend/uploads/documents');
    fs.mkdirSync(uploadsDir, { recursive: true });

    const pdfFiles = [
      { filename: 'demo_passport_xichtho.pdf', title: 'FEI Passport - Horse: Xich Tho (Microchip: 9001820001)' },
      { filename: 'demo_vaccine_xichtho.pdf', title: 'Equine Influenza Vaccination Certificate - Horse: Xich Tho' },
      { filename: 'demo_coggins_xichtho.pdf', title: 'EIA Coggins Negative Test Certificate - Horse: Xich Tho' },
      { filename: 'demo_passport_bachlong.pdf', title: 'FEI Passport - Horse: Bach Long (Microchip: 9001820002)' },
      { filename: 'demo_vaccine_bachlong_expired.pdf', title: 'EXPIRED Vaccine Certificate - Horse: Bach Long' },
      { filename: 'demo_passport_hoangphi.pdf', title: 'Official Studbook Passport - Horse: Hoang Phi (Private Stall)' },
      { filename: 'demo_health_hoangphi_expiring.pdf', title: 'Animal Quarantine Certificate (Expiring in 10 Days) - Horse: Hoang Phi' },
      { filename: 'demo_passport_kiemphong.pdf', title: 'FEI Passport - Horse: Kiem Phong (Owner: Customer B)' },
      { filename: 'demo_passport_songlong.pdf', title: 'FEI Passport - Horse: Song Long (Microchip: 9001820014)' },
      { filename: 'demo_vaccine_songlong.pdf', title: 'Vaccine Certificate - Horse: Song Long' },
      { filename: 'demo_coggins_songlong.pdf', title: 'EIA Coggins Negative Test - Horse: Song Long' },
      { filename: 'demo_passport_tuyetma.pdf', title: 'FEI Passport - Horse: Tuyet Ma (Microchip: 9001820015)' },
      { filename: 'demo_vaccine_tuyetma.pdf', title: 'Vaccine Certificate - Horse: Tuyet Ma' },
      { filename: 'demo_coggins_tuyetma.pdf', title: 'EIA Coggins Negative Test - Horse: Tuyet Ma' },
      { filename: 'demo_passport_general.pdf', title: 'Official FEI Equine Passport - EquiTransit Demo Record' },
    ];

    for (const f of pdfFiles) {
      const targetPath = path.join(uploadsDir, f.filename);
      fs.writeFileSync(targetPath, createMinimalPdfBuffer(f.title));
    }

    // 5. Seed Horses for Customer A and Customer B
    console.log('Seeding demo racehorses for Customer A and Customer B...');
    const demoHorses = [
      // Customer A
      {
        ownerId: customerAId,
        name: 'Xích Thố',
        breed: 'Thoroughbred',
        gender: 'male',
        color: 'Hồng mã (Bay/Chestnut)',
        microchipNo: '9001820001',
        passportNo: 'VN-FEI-2026-001',
        requiresPrivateStall: false,
        declaredValue: 2000000000,
        status: 'in_transit', // Has active in_transit shipment
      },
      {
        ownerId: customerAId,
        name: 'Bạch Long',
        breed: 'Arabian',
        gender: 'other',
        color: 'Bạch mã (White/Grey)',
        microchipNo: '9001820002',
        passportNo: 'VN-FEI-2026-002',
        requiresPrivateStall: false,
        declaredValue: 800000000,
        status: 'active', // Completed shipment
      },
      {
        ownerId: customerAId,
        name: 'Hắc Mã',
        breed: 'Quarter Horse',
        gender: 'female',
        color: 'Hắc mã (Black)',
        microchipNo: '9001820003',
        passportNo: 'VN-FEI-2026-003',
        requiresPrivateStall: false,
        declaredValue: 500000000,
        status: 'active', // awaiting_payment
      },
      {
        ownerId: customerAId,
        name: 'Hoàng Phi (Chuồng riêng)',
        breed: 'Thoroughbred Champion',
        gender: 'male',
        color: 'Kim mã (Palomino)',
        microchipNo: '9001820004',
        passportNo: 'VN-FEI-2026-004',
        requiresPrivateStall: true,
        declaredValue: 3500000000,
        status: 'active', // confirmed (dedicated stall)
      },
      {
        ownerId: customerAId,
        name: 'Kim Long',
        breed: 'Thoroughbred',
        gender: 'male',
        color: 'Hoàng mã (Chestnut)',
        microchipNo: '9001820006',
        passportNo: 'VN-FEI-2026-006',
        requiresPrivateStall: false,
        declaredValue: 1500000000,
        status: 'active', // paid_pending_review
      },
      {
        ownerId: customerAId,
        name: 'Hỏa Vân',
        breed: 'Arabian',
        gender: 'female',
        color: 'Xích mã (Red Roan)',
        microchipNo: '9001820007',
        passportNo: 'VN-FEI-2026-007',
        requiresPrivateStall: false,
        declaredValue: 1800000000,
        status: 'active', // return_pending
      },
      {
        ownerId: customerAId,
        name: 'Thanh Phong',
        breed: 'Warmblood',
        gender: 'male',
        color: 'Thanh mã (Grey)',
        microchipNo: '9001820008',
        passportNo: 'VN-FEI-2026-008',
        requiresPrivateStall: false,
        declaredValue: 2200000000,
        status: 'active', // planning
      },
      {
        ownerId: customerAId,
        name: 'Phi Yến',
        breed: 'Thoroughbred',
        gender: 'female',
        color: 'Ô mã (Dark Bay)',
        microchipNo: '9001820009',
        passportNo: 'VN-FEI-2026-009',
        requiresPrivateStall: false,
        declaredValue: 950000000,
        status: 'active', // ready_to_depart
      },
      {
        ownerId: customerAId,
        name: 'Lôi Điện',
        breed: 'Quarter Horse',
        gender: 'male',
        color: 'Hắc mã (Black)',
        microchipNo: '9001820010',
        passportNo: 'VN-FEI-2026-010',
        requiresPrivateStall: false,
        declaredValue: 1100000000,
        status: 'active', // refund_requested
      },
      {
        ownerId: customerAId,
        name: 'Hồng Tiêu',
        breed: 'Thoroughbred',
        gender: 'female',
        color: 'Hồng điều (Bay)',
        microchipNo: '9001820011',
        passportNo: 'VN-FEI-2026-011',
        requiresPrivateStall: false,
        declaredValue: 1300000000,
        status: 'active', // requested
      },
      {
        ownerId: customerAId,
        name: 'Thần Mã',
        breed: 'Warmblood',
        gender: 'male',
        color: 'Nâu sẫm (Dark Chestnut)',
        microchipNo: '9001820012',
        passportNo: 'VN-FEI-2026-012',
        requiresPrivateStall: false,
        declaredValue: 1400000000,
        status: 'active', // change_requested
      },
      {
        ownerId: customerAId,
        name: 'Bảo Mã',
        breed: 'Quarter Horse',
        gender: 'other',
        color: 'Hoàng yến (Dun)',
        microchipNo: '9001820013',
        passportNo: 'VN-FEI-2026-013',
        requiresPrivateStall: false,
        declaredValue: 850000000,
        status: 'active', // cancelled
      },
      // Available / Ready horses for Customer A (No active shipment, completely free to book new trips)
      {
        ownerId: customerAId,
        name: 'Song Long (Sẵn sàng)',
        breed: 'Thoroughbred Champion',
        gender: 'male',
        color: 'Hồng mã (Bay)',
        microchipNo: '9001820014',
        passportNo: 'VN-FEI-2026-014',
        requiresPrivateStall: false,
        declaredValue: 3000000000,
        status: 'active',
      },
      {
        ownerId: customerAId,
        name: 'Tuyết Mã (Sẵn sàng)',
        breed: 'Arabian White',
        gender: 'female',
        color: 'Bạch mã (White)',
        microchipNo: '9001820015',
        passportNo: 'VN-FEI-2026-015',
        requiresPrivateStall: false,
        declaredValue: 1600000000,
        status: 'active',
      },
      // Customer B (for authorization matrix test)
      {
        ownerId: customerBId,
        name: 'Kiếm Phong (Khách B)',
        breed: 'Warmblood',
        gender: 'male',
        color: 'Nâu sẫm (Dark Bay)',
        microchipNo: '9001820005',
        passportNo: 'VN-FEI-2026-005',
        requiresPrivateStall: false,
        declaredValue: 1200000000,
        status: 'active',
      },
    ];

    for (const h of demoHorses) {
      await db.execute(
        `INSERT INTO horse (owner_id, name, breed, gender, color, microchip_no, passport_no, requires_private_stall, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           name = VALUES(name),
           breed = VALUES(breed),
           passport_no = VALUES(passport_no),
           requires_private_stall = VALUES(requires_private_stall),
           status = VALUES(status)`,
        [h.ownerId, h.name, h.breed, h.gender, h.color, h.microchipNo, h.passportNo, h.requiresPrivateStall, h.status],
      );
    }

    // Retrieve horse IDs
    const [horseRows] = await db.query('SELECT horse_id, name, owner_id FROM horse');
    const horseMap = new Map(horseRows.map((r) => [`${r.owner_id}:${r.name}`, r.horse_id]));

    const horseXichThoId = horseMap.get(`${customerAId}:Xích Thố`);
    const horseBachLongId = horseMap.get(`${customerAId}:Bạch Long`);
    const horseHoangPhiId = horseMap.get(`${customerAId}:Hoàng Phi (Chuồng riêng)`);
    const horseKiemPhongId = horseMap.get(`${customerBId}:Kiếm Phong (Khách B)`);

    // 6. Seed Documents (Valid, Expired, Expiring in 10 Days) in transport_document
    console.log('Seeding documents linked to horses...');
    const toISODate = (d) => d.toISOString().split('T')[0];
    const now = new Date();
    const plusDays = (n) => { const d = new Date(now); d.setDate(d.getDate() + n); return toISODate(d); };
    const minusDays = (n) => { const d = new Date(now); d.setDate(d.getDate() - n); return toISODate(d); };
    const plusYears = (n) => { const d = new Date(now); d.setFullYear(d.getFullYear() + n); return toISODate(d); };
    const minusYears = (n) => { const d = new Date(now); d.setFullYear(d.getFullYear() - n); return toISODate(d); };

    const demoDocs = [
      // Xích Thố: 3 valid docs
      {
        horseId: horseXichThoId,
        uploadedBy: customerAId,
        docType: 'passport',
        documentTypeCode: 'horse_passport',
        docNumber: 'VN-FEI-2026-001',
        fileUrl: '/uploads/documents/demo_passport_xichtho.pdf',
        issueDate: minusYears(1),
        expiryDate: plusYears(4),
        status: 'approved',
      },
      {
        horseId: horseXichThoId,
        uploadedBy: customerAId,
        docType: 'vaccination',
        documentTypeCode: 'vaccination_influenza',
        docNumber: 'VAC-2026-088',
        fileUrl: '/uploads/documents/demo_vaccine_xichtho.pdf',
        issueDate: minusDays(60),
        expiryDate: plusDays(300),
        status: 'approved',
      },
      {
        horseId: horseXichThoId,
        uploadedBy: customerAId,
        docType: 'coggins',
        documentTypeCode: 'eia_coggins_test',
        docNumber: 'COG-2026-012',
        fileUrl: '/uploads/documents/demo_coggins_xichtho.pdf',
        issueDate: minusDays(90),
        expiryDate: plusDays(275),
        status: 'approved',
      },
      // Bạch Long: passport valid, vaccine expired 1 month ago
      {
        horseId: horseBachLongId,
        uploadedBy: customerAId,
        docType: 'passport',
        documentTypeCode: 'horse_passport',
        docNumber: 'VN-FEI-2026-002',
        fileUrl: '/uploads/documents/demo_passport_bachlong.pdf',
        issueDate: minusYears(2),
        expiryDate: plusYears(3),
        status: 'approved',
      },
      {
        horseId: horseBachLongId,
        uploadedBy: customerAId,
        docType: 'vaccination',
        documentTypeCode: 'vaccination_influenza',
        docNumber: 'VAC-2025-OLD',
        fileUrl: '/uploads/documents/demo_vaccine_bachlong_expired.pdf',
        issueDate: minusYears(1),
        expiryDate: minusDays(30), // Expired 30 days ago
        status: 'expired',
      },
      // Hoàng Phi: passport valid, health cert expiring in 10 days
      {
        horseId: horseHoangPhiId,
        uploadedBy: customerAId,
        docType: 'passport',
        documentTypeCode: 'horse_passport',
        docNumber: 'VN-FEI-2026-004',
        fileUrl: '/uploads/documents/demo_passport_hoangphi.pdf',
        issueDate: minusYears(1),
        expiryDate: plusYears(4),
        status: 'approved',
      },
      {
        horseId: horseHoangPhiId,
        uploadedBy: customerAId,
        docType: 'health_certificate',
        documentTypeCode: 'health_certificate',
        docNumber: 'HC-2026-EXPIRING',
        fileUrl: '/uploads/documents/demo_health_hoangphi_expiring.pdf',
        issueDate: minusDays(20),
        expiryDate: plusDays(10), // Expiring in ~10 days
        status: 'approved',
      },
      // Kiếm Phong (Customer B)
      {
        horseId: horseKiemPhongId,
        uploadedBy: customerBId,
        docType: 'passport',
        documentTypeCode: 'horse_passport',
        docNumber: 'VN-FEI-2026-005',
        fileUrl: '/uploads/documents/demo_passport_kiemphong.pdf',
        issueDate: minusYears(1),
        expiryDate: plusYears(4),
        status: 'approved',
      },
      // Song Long (Sẵn sàng - Available)
      {
        horseId: horseMap.get(`${customerAId}:Song Long (Sẵn sàng)`),
        uploadedBy: customerAId,
        docType: 'passport',
        documentTypeCode: 'horse_passport',
        docNumber: 'VN-FEI-2026-014',
        fileUrl: '/uploads/documents/demo_passport_songlong.pdf',
        issueDate: minusYears(1),
        expiryDate: plusYears(4),
        status: 'approved',
      },
      {
        horseId: horseMap.get(`${customerAId}:Song Long (Sẵn sàng)`),
        uploadedBy: customerAId,
        docType: 'vaccination',
        documentTypeCode: 'vaccination_influenza',
        docNumber: 'VAC-2026-014',
        fileUrl: '/uploads/documents/demo_vaccine_songlong.pdf',
        issueDate: minusDays(45),
        expiryDate: plusDays(320),
        status: 'approved',
      },
      {
        horseId: horseMap.get(`${customerAId}:Song Long (Sẵn sàng)`),
        uploadedBy: customerAId,
        docType: 'coggins',
        documentTypeCode: 'eia_coggins_test',
        docNumber: 'COG-2026-014',
        fileUrl: '/uploads/documents/demo_coggins_songlong.pdf',
        issueDate: minusDays(20),
        expiryDate: plusDays(280),
        status: 'approved',
      },
      // Tuyết Mã (Sẵn sàng - Available)
      {
        horseId: horseMap.get(`${customerAId}:Tuyết Mã (Sẵn sàng)`),
        uploadedBy: customerAId,
        docType: 'passport',
        documentTypeCode: 'horse_passport',
        docNumber: 'VN-FEI-2026-015',
        fileUrl: '/uploads/documents/demo_passport_tuyetma.pdf',
        issueDate: minusYears(1),
        expiryDate: plusYears(3),
        status: 'approved',
      },
      {
        horseId: horseMap.get(`${customerAId}:Tuyết Mã (Sẵn sàng)`),
        uploadedBy: customerAId,
        docType: 'vaccination',
        documentTypeCode: 'vaccination_influenza',
        docNumber: 'VAC-2026-015',
        fileUrl: '/uploads/documents/demo_vaccine_tuyetma.pdf',
        issueDate: minusDays(30),
        expiryDate: plusDays(335),
        status: 'approved',
      },
      {
        horseId: horseMap.get(`${customerAId}:Tuyết Mã (Sẵn sàng)`),
        uploadedBy: customerAId,
        docType: 'coggins',
        documentTypeCode: 'eia_coggins_test',
        docNumber: 'COG-2026-015',
        fileUrl: '/uploads/documents/demo_coggins_tuyetma.pdf',
        issueDate: minusDays(15),
        expiryDate: plusDays(285),
        status: 'approved',
      },
      // Kim Long
      {
        horseId: horseMap.get(`${customerAId}:Kim Long`),
        uploadedBy: customerAId,
        docType: 'passport',
        documentTypeCode: 'horse_passport',
        docNumber: 'VN-FEI-2026-006',
        fileUrl: '/uploads/documents/demo_passport_general.pdf',
        issueDate: minusYears(1),
        expiryDate: plusYears(4),
        status: 'approved',
      },
      // Hỏa Vân
      {
        horseId: horseMap.get(`${customerAId}:Hỏa Vân`),
        uploadedBy: customerAId,
        docType: 'passport',
        documentTypeCode: 'horse_passport',
        docNumber: 'VN-FEI-2026-007',
        fileUrl: '/uploads/documents/demo_passport_general.pdf',
        issueDate: minusYears(1),
        expiryDate: plusYears(4),
        status: 'approved',
      },
      // Thanh Phong
      {
        horseId: horseMap.get(`${customerAId}:Thanh Phong`),
        uploadedBy: customerAId,
        docType: 'passport',
        documentTypeCode: 'horse_passport',
        docNumber: 'VN-FEI-2026-008',
        fileUrl: '/uploads/documents/demo_passport_general.pdf',
        issueDate: minusYears(1),
        expiryDate: plusYears(4),
        status: 'approved',
      },
      // Phi Yến
      {
        horseId: horseMap.get(`${customerAId}:Phi Yến`),
        uploadedBy: customerAId,
        docType: 'passport',
        documentTypeCode: 'horse_passport',
        docNumber: 'VN-FEI-2026-009',
        fileUrl: '/uploads/documents/demo_passport_general.pdf',
        issueDate: minusYears(1),
        expiryDate: plusYears(4),
        status: 'approved',
      },
      // Lôi Điện
      {
        horseId: horseMap.get(`${customerAId}:Lôi Điện`),
        uploadedBy: customerAId,
        docType: 'passport',
        documentTypeCode: 'horse_passport',
        docNumber: 'VN-FEI-2026-010',
        fileUrl: '/uploads/documents/demo_passport_general.pdf',
        issueDate: minusYears(1),
        expiryDate: plusYears(4),
        status: 'approved',
      },
      // Hồng Tiêu
      {
        horseId: horseMap.get(`${customerAId}:Hồng Tiêu`),
        uploadedBy: customerAId,
        docType: 'passport',
        documentTypeCode: 'horse_passport',
        docNumber: 'VN-FEI-2026-011',
        fileUrl: '/uploads/documents/demo_passport_general.pdf',
        issueDate: minusYears(1),
        expiryDate: plusYears(4),
        status: 'approved',
      },
      // Thần Mã (coggins expired -> change_requested)
      {
        horseId: horseMap.get(`${customerAId}:Thần Mã`),
        uploadedBy: customerAId,
        docType: 'passport',
        documentTypeCode: 'horse_passport',
        docNumber: 'VN-FEI-2026-012',
        fileUrl: '/uploads/documents/demo_passport_general.pdf',
        issueDate: minusYears(1),
        expiryDate: plusYears(4),
        status: 'approved',
      },
      {
        horseId: horseMap.get(`${customerAId}:Thần Mã`),
        uploadedBy: customerAId,
        docType: 'coggins',
        documentTypeCode: 'eia_coggins_test',
        docNumber: 'COG-2026-012-EXP',
        fileUrl: '/uploads/documents/demo_passport_general.pdf',
        issueDate: minusDays(140),
        expiryDate: minusDays(75),
        status: 'expired',
      },
      // Bảo Mã
      {
        horseId: horseMap.get(`${customerAId}:Bảo Mã`),
        uploadedBy: customerAId,
        docType: 'passport',
        documentTypeCode: 'horse_passport',
        docNumber: 'VN-FEI-2026-013',
        fileUrl: '/uploads/documents/demo_passport_general.pdf',
        issueDate: minusYears(1),
        expiryDate: plusYears(4),
        status: 'approved',
      },
    ];

    for (const d of demoDocs) {
      if (!d.horseId) continue;
      const [existing] = await db.execute(
        'SELECT document_id FROM transport_document WHERE horse_id = ? AND doc_number = ?',
        [d.horseId, d.docNumber]
      );
      if (existing.length > 0) {
        await db.execute(
          `UPDATE transport_document
           SET file_url = ?, issue_date = ?, expiry_date = ?, status = ?, document_type_code = ?
           WHERE document_id = ?`,
          [d.fileUrl, d.issueDate, d.expiryDate, d.status, d.documentTypeCode, existing[0].document_id],
        );
      } else {
        await db.execute(
          `INSERT INTO transport_document (horse_id, uploaded_by, doc_type, document_type_code, doc_number, file_url, issue_date, expiry_date, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [d.horseId, d.uploadedBy, d.docType, d.documentTypeCode, d.docNumber, d.fileUrl, d.issueDate, d.expiryDate, d.status],
        );
      }
    }

    // 7. Seed Full Lifecycle Transport Shipments for Customer A
    console.log('Seeding full lifecycle transport shipments for Customer A (customer_a@example.com)...');
    const [allUsers] = await db.query('SELECT user_id, email FROM `user`');
    const userMap = new Map(allUsers.map((u) => [u.email, u.user_id]));

    const [allVehicles] = await db.query('SELECT vehicle_id, plate_or_code FROM vehicle');
    const vehicleMap = new Map(allVehicles.map((v) => [v.plate_or_code, v.vehicle_id]));

    await seedCustomerAShipments(db, {
      customerAId,
      managerAId: userMap.get('manager_a@example.com'),
      driver1Id: userMap.get('driver_demo1@example.com'),
      driver2Id: userMap.get('driver_demo2@example.com'),
      seedDriverId: userMap.get('driver@example.com') || null,
      escortId: userMap.get('escort_demo@example.com'),
      horseMap,
      vehicleMap,
      now,
    });

    console.log('✓ Demo data seeded successfully!');
    console.log('====================================================');
    console.log('DEMO ACCOUNTS (Password: %s):', DEMO_PASSWORD);
    console.log('  Customer A: customer_a@example.com (14 horses, 12 lifecycle shipments, docs ready/expiring)');
    console.log('  Customer B: customer_b@example.com (1 horse for authorization test)');
    console.log('  Manager 1:  manager_a@example.com');
    console.log('  Manager 2:  manager_b@example.com (Dual-approval SoD testing)');
    console.log('  Admin:      admin_demo@example.com');
    console.log('  Driver 1:   driver_demo1@example.com');
    console.log('  Driver 2:   driver_demo2@example.com');
    console.log('  Escort Vet: escort_demo@example.com');
    console.log('FLEET & DEPOTS: 7 Depots (4 VN, 3 Partner), 12 Specialized Trucks');
    console.log('====================================================');
  } finally {
    await db.end();
  }
}

/**
 * Idempotently seed 12 transport shipments covering all statuses with horses for customer_a@example.com
 */
async function seedCustomerAShipments(db, ctx) {
  const { customerAId, managerAId, driver1Id, driver2Id, escortId, horseMap, vehicleMap, now } = ctx;

  const toSqlDateTime = (d) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  const addMinutes = (base, m) => new Date(base.getTime() + m * 60 * 1000);
  const addHours = (base, h) => new Date(base.getTime() + h * 3600 * 1000);
  const subHours = (base, h) => new Date(base.getTime() - h * 3600 * 1000);
  const subMinutes = (base, m) => new Date(base.getTime() - m * 60 * 1000);
  const addDays = (base, d) => new Date(base.getTime() + d * 86400 * 1000);
  const subDays = (base, d) => new Date(base.getTime() - d * 86400 * 1000);

  const getHorseId = (name) => horseMap.get(`${customerAId}:${name}`);

  // Helpers
  async function upsertShipment(data) {
    const [existing] = await db.query(
      'SELECT shipment_id FROM shipment WHERE customer_id = ? AND special_requirements = ?',
      [data.customer_id, data.special_requirements]
    );
    if (existing.length > 0) {
      const shipmentId = existing[0].shipment_id;
      await db.query(
        `UPDATE shipment SET
          requested_by = ?, approved_by = ?, contact_name = ?, contact_address = ?, contact_phone = ?, contact_email = ?,
          requested_horse_count = ?, origin_location = ?, destination_location = ?, transportation_type = ?,
          requested_date = ?, departure_date = ?, expected_arrival_date = ?, actual_arrival_date = ?,
          rejection_reason = ?, change_request_notes = ?, status = ?, payment_flow = ?,
          total_cost = ?, transport_cost = ?, insurance_fee = ?, booking_type = ?, trip_type = ?,
          return_departure_at = ?, return_wait_minutes = ?, return_status = ?, return_freight = ?,
          return_insurance_fee = ?, cancellation_category = ?, cancellation_reason = ?, cancelled_by = ?, cancelled_at = ?
        WHERE shipment_id = ?`,
        [
          data.requested_by, data.approved_by ?? null, data.contact_name, data.contact_address ?? null,
          data.contact_phone, data.contact_email, data.requested_horse_count ?? 1, data.origin_location,
          data.destination_location, data.transportation_type ?? 'road', data.requested_date,
          data.departure_date ?? null, data.expected_arrival_date ?? null, data.actual_arrival_date ?? null,
          data.rejection_reason ?? null, data.change_request_notes ?? null, data.status, data.payment_flow ?? 'prepaid',
          data.total_cost, data.transport_cost ?? null, data.insurance_fee ?? 0, data.booking_type ?? 'dedicated_charter',
          data.trip_type ?? 'one_way', data.return_departure_at ?? null, data.return_wait_minutes ?? 120,
          data.return_status ?? 'not_applicable', data.return_freight ?? 0, data.return_insurance_fee ?? 0,
          data.cancellation_category ?? null, data.cancellation_reason ?? null, data.cancelled_by ?? null, data.cancelled_at ?? null,
          shipmentId,
        ]
      );
      return shipmentId;
    } else {
      const [res] = await db.query(
        `INSERT INTO shipment (
          customer_id, requested_by, approved_by, contact_name, contact_address, contact_phone, contact_email,
          requested_horse_count, origin_location, destination_location, transportation_type,
          requested_date, departure_date, expected_arrival_date, actual_arrival_date,
          special_requirements, rejection_reason, change_request_notes,
          status, payment_flow, total_cost, transport_cost, insurance_fee,
          booking_type, trip_type, return_departure_at, return_wait_minutes, return_status,
          return_freight, return_insurance_fee, cancellation_category, cancellation_reason,
          cancelled_by, cancelled_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.customer_id, data.requested_by, data.approved_by ?? null, data.contact_name, data.contact_address ?? null,
          data.contact_phone, data.contact_email, data.requested_horse_count ?? 1, data.origin_location,
          data.destination_location, data.transportation_type ?? 'road', data.requested_date,
          data.departure_date ?? null, data.expected_arrival_date ?? null, data.actual_arrival_date ?? null,
          data.special_requirements, data.rejection_reason ?? null, data.change_request_notes ?? null,
          data.status, data.payment_flow ?? 'prepaid', data.total_cost, data.transport_cost ?? null,
          data.insurance_fee ?? 0, data.booking_type ?? 'dedicated_charter', data.trip_type ?? 'one_way',
          data.return_departure_at ?? null, data.return_wait_minutes ?? 120, data.return_status ?? 'not_applicable',
          data.return_freight ?? 0, data.return_insurance_fee ?? 0, data.cancellation_category ?? null,
          data.cancellation_reason ?? null, data.cancelled_by ?? null, data.cancelled_at ?? null,
        ]
      );
      return res.insertId;
    }
  }

  async function linkShipmentHorse(shipmentId, horseId, opts = {}) {
    if (!horseId) return;
    await db.query(
      `INSERT INTO shipment_horse (
        shipment_id, horse_id, quantity, stall_number, declared_value, declared_currency,
        exchange_rate, declared_value_vnd, insurance_package, insurance_fee, max_compensation,
        emergency_vet_covered, insurance_policy_version, notes
      ) VALUES (?, ?, 1, ?, ?, 'VND', 1, ?, ?, ?, 50000000, ?, 'equine-v1', ?)
      ON DUPLICATE KEY UPDATE
        quantity = VALUES(quantity), stall_number = VALUES(stall_number), declared_value = VALUES(declared_value),
        declared_value_vnd = VALUES(declared_value_vnd), insurance_package = VALUES(insurance_package),
        insurance_fee = VALUES(insurance_fee), emergency_vet_covered = VALUES(emergency_vet_covered), notes = VALUES(notes)`,
      [
        shipmentId, horseId, opts.stall_number ?? 'STALL-01', opts.declared_value ?? 1000000000,
        opts.declared_value ?? 1000000000, opts.insurance_package ?? 'basic', opts.insurance_fee ?? 1000000,
        opts.emergency_vet_covered ?? false, opts.notes ?? null,
      ]
    );
  }

  async function upsertInvoice(shipmentId, amount, status = 'active', routeId = null) {
    const [existing] = await db.query('SELECT invoice_id FROM shipment_invoice WHERE shipment_id = ?', [shipmentId]);
    const snapshotJson = JSON.stringify({
      baseFreight: amount - 1000000,
      insuranceFee: 1000000,
      totalCost: amount,
      currency: 'VND',
    });
    if (existing.length > 0) {
      await db.query(
        `UPDATE shipment_invoice SET amount = ?, status = ?, snapshot = ?, route_id = ?, customer_id = ? WHERE invoice_id = ?`,
        [amount, status, snapshotJson, routeId, customerAId, existing[0].invoice_id]
      );
      return existing[0].invoice_id;
    } else {
      const [res] = await db.query(
        `INSERT INTO shipment_invoice (shipment_id, route_id, customer_id, invoice_type, status, amount, currency, snapshot)
         VALUES (?, ?, ?, 'primary', ?, ?, 'VND', ?)`,
        [shipmentId, routeId, customerAId, status, amount, snapshotJson]
      );
      return res.insertId;
    }
  }

  async function upsertSepayPayment(shipmentId, invoiceId, amount, paymentCode, transactionId, status = 'succeeded') {
    const [existing] = await db.query('SELECT payment_id FROM shipment_sepay_payment WHERE shipment_id = ?', [shipmentId]);
    if (existing.length > 0) {
      await db.query(
        `UPDATE shipment_sepay_payment SET invoice_id = ?, customer_id = ?, payment_code = ?, amount = ?, status = ?, transaction_id = ?, paid_at = NOW() WHERE payment_id = ?`,
        [invoiceId, customerAId, paymentCode, amount, status, transactionId, existing[0].payment_id]
      );
      return existing[0].payment_id;
    } else {
      const [res] = await db.query(
        `INSERT INTO shipment_sepay_payment (shipment_id, invoice_id, customer_id, payment_code, amount, bank_code, account_number, account_name, status, transaction_id, paid_at)
         VALUES (?, ?, ?, ?, ?, 'MBBANK', '0901111222', 'NGUYEN VAN CHU NGUA', ?, ?, NOW())`,
        [shipmentId, invoiceId, customerAId, paymentCode, amount, status, transactionId]
      );
      return res.insertId;
    }
  }

  async function upsertRoute(shipmentId, routeName, distanceKm, planStatus = 'draft', status = 'planned', coordinatorId = null, approvedBy = null) {
    const [existing] = await db.query('SELECT route_id FROM route WHERE shipment_id = ?', [shipmentId]);
    if (existing.length > 0) {
      await db.query(
        `UPDATE route SET route_name = ?, total_distance_km = ?, plan_status = ?, status = ?, assigned_coordinator_id = ?, approved_by = ?, approved_at = CASE WHEN ? IS NOT NULL THEN NOW() ELSE approved_at END WHERE route_id = ?`,
        [routeName, distanceKm, planStatus, status, coordinatorId, approvedBy, approvedBy, existing[0].route_id]
      );
      return existing[0].route_id;
    } else {
      const [res] = await db.query(
        `INSERT INTO route (shipment_id, route_name, total_distance_km, plan_status, status, assigned_coordinator_id, approved_by, approved_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, CASE WHEN ? IS NOT NULL THEN NOW() ELSE NULL END)`,
        [shipmentId, routeName, distanceKm, planStatus, status, coordinatorId, approvedBy, approvedBy]
      );
      return res.insertId;
    }
  }

  async function assignStaff(shipmentId, userId, role, isConfirmed = true) {
    if (!userId) return;
    const [existing] = await db.query('SELECT assignment_id FROM shipment_assignment WHERE shipment_id = ? AND user_id = ?', [shipmentId, userId]);
    if (existing.length > 0) {
      await db.query(
        `UPDATE shipment_assignment SET role_in_shipment = ?, is_confirmed = ?, confirmed_at = CASE WHEN ? THEN NOW() ELSE NULL END WHERE assignment_id = ?`,
        [role, isConfirmed, isConfirmed, existing[0].assignment_id]
      );
    } else {
      await db.query(
        `INSERT INTO shipment_assignment (shipment_id, user_id, role_in_shipment, is_confirmed, confirmed_at)
         VALUES (?, ?, ?, ?, CASE WHEN ? THEN NOW() ELSE NULL END)`,
        [shipmentId, userId, role, isConfirmed, isConfirmed]
      );
    }
  }

  async function upsertHandover(shipmentId, handedOverBy, receivedByName, location, horseCondition = 'healthy', confirmedBy = null) {
    const [existing] = await db.query('SELECT handover_id FROM delivery_handover WHERE shipment_id = ?', [shipmentId]);
    if (existing.length > 0) {
      await db.query(
        `UPDATE delivery_handover SET handed_over_by = ?, received_by_name = ?, handover_location = ?, horse_condition_at_handover = ?, status = 'confirmed', confirmed_by = ?, confirmed_at = NOW() WHERE handover_id = ?`,
        [handedOverBy, receivedByName, location, horseCondition, confirmedBy, existing[0].handover_id]
      );
    } else {
      await db.query(
        `INSERT INTO delivery_handover (shipment_id, handed_over_by, received_by_name, handover_location, handover_datetime, delivered_quantity, horse_condition_at_handover, identity_verified, documents_handed_over, customer_signature_url, status, confirmed_by, confirmed_at, notes)
         VALUES (?, ?, ?, ?, NOW(), 1, ?, TRUE, TRUE, '/uploads/signatures/demo_customer_sig.png', 'confirmed', ?, NOW(), 'Giao nhận ngựa an toàn, đầy đủ giấy tờ hợp lệ')`,
        [shipmentId, handedOverBy, receivedByName, location, horseCondition, confirmedBy]
      );
    }
  }

  async function upsertRefundRecord(shipmentId, category, amount, freightAmount, insuranceAmount, status = 'pending_approval') {
    const [existing] = await db.query('SELECT refund_id FROM shipment_refund_record WHERE shipment_id = ?', [shipmentId]);
    if (existing.length > 0) {
      await db.query(
        `UPDATE shipment_refund_record SET cancellation_category = ?, amount = ?, freight_refund_amount = ?, insurance_refund_amount = ?, status = ?, requested_by = ? WHERE refund_id = ?`,
        [category, amount, freightAmount, insuranceAmount, status, customerAId, existing[0].refund_id]
      );
    } else {
      await db.query(
        `INSERT INTO shipment_refund_record (shipment_id, customer_id, cancellation_category, refund_mode, freight_refund_amount, insurance_refund_amount, amount, status, requested_by, recipient_bank_account, recipient_bank_name, recipient_account_holder, notes)
         VALUES (?, ?, ?, 'cash_refund', ?, ?, ?, ?, ?, '0901111222', 'MBBank', 'NGUYEN VAN CHU NGUA', 'Yêu cầu hoàn trả phí theo chính sách vet_unfit')`,
        [shipmentId, customerAId, category, freightAmount, insuranceAmount, amount, status, customerAId]
      );
    }
  }

  const baseContact = {
    customer_id: customerAId,
    requested_by: customerAId,
    contact_name: 'Nguyễn Văn Chủ Ngựa (Khách A)',
    contact_address: 'Số 12 Đường Song Hành, TP. Thủ Đức, TP.HCM',
    contact_phone: '0901111222',
    contact_email: 'customer_a@example.com',
    requested_horse_count: 1,
    booking_type: 'dedicated_charter',
    trip_type: 'one_way',
    payment_flow: 'prepaid',
  };

  // 1. awaiting_payment (Prepaid, invoice active, awaiting SePay VietQR payment)
  const idAwaiting = await upsertShipment({
    ...baseContact,
    origin_location: 'Trạm Điều phối Thủ Đức (TP.HCM)',
    destination_location: 'Singapore Turf Club (Singapore)',
    requested_date: toSqlDateTime(subHours(now, 6)),
    departure_date: toSqlDateTime(addDays(now, 5)),
    expected_arrival_date: toSqlDateTime(addDays(now, 8)),
    status: 'awaiting_payment',
    total_cost: 116212000,
    transport_cost: 115212000,
    insurance_fee: 1000000,
    special_requirements: 'SEED-DEMO-AWAITING-PAYMENT',
  });
  await linkShipmentHorse(idAwaiting, getHorseId('Hắc Mã'), { declared_value: 500000000, insurance_fee: 1000000 });
  await upsertInvoice(idAwaiting, 116212000, 'active');

  // 2. paid_pending_review (Prepaid, payment succeeded, pending coordinator route confirmation)
  const idPaid = await upsertShipment({
    ...baseContact,
    origin_location: 'Trạm Điều phối Thủ Đức (TP.HCM)',
    destination_location: 'Trạm Đối tác Bangkok (Thái Lan)',
    requested_date: toSqlDateTime(subHours(now, 12)),
    departure_date: toSqlDateTime(addDays(now, 7)),
    expected_arrival_date: toSqlDateTime(addDays(now, 10)),
    status: 'paid_pending_review',
    total_cost: 85000000,
    transport_cost: 80000000,
    insurance_fee: 5000000,
    special_requirements: 'SEED-DEMO-PAID-PENDING-REVIEW',
  });
  await linkShipmentHorse(idPaid, getHorseId('Kim Long'), { declared_value: 1500000000, insurance_fee: 5000000 });
  const paidInvoiceId = await upsertInvoice(idPaid, 85000000, 'paid');
  await upsertSepayPayment(idPaid, paidInvoiceId, 85000000, 'EQT-SEED-PAID-01', 99001001, 'succeeded');

  // 3. planning (Draft route being planned by coordinator)
  const idPlanning = await upsertShipment({
    ...baseContact,
    origin_location: 'Trạm Điều phối Thủ Đức (TP.HCM)',
    destination_location: 'Trạm Đối tác Phnom Penh (Campuchia)',
    requested_date: toSqlDateTime(subDays(now, 1)),
    departure_date: toSqlDateTime(addDays(now, 4)),
    expected_arrival_date: toSqlDateTime(addDays(now, 5)),
    status: 'planning',
    total_cost: 42000000,
    transport_cost: 40000000,
    insurance_fee: 2000000,
    special_requirements: 'SEED-DEMO-PLANNING',
  });
  await linkShipmentHorse(idPlanning, getHorseId('Thanh Phong'), { declared_value: 2200000000, insurance_fee: 2000000 });
  await upsertRoute(idPlanning, 'TP.HCM -> Phnom Penh (Tuyến bộ liên vận)', 245.5, 'draft', 'planned', managerAId);

  // 4. confirmed (Route & vehicle confirmed, driver & escort assigned)
  const idConfirmed = await upsertShipment({
    ...baseContact,
    origin_location: 'Trạm Điều phối Thủ Đức (TP.HCM)',
    destination_location: 'Trạm Đối tác Phnom Penh (Campuchia)',
    requested_date: toSqlDateTime(subDays(now, 2)),
    departure_date: toSqlDateTime(addDays(now, 2)),
    expected_arrival_date: toSqlDateTime(addDays(now, 3)),
    status: 'confirmed',
    total_cost: 55000000,
    transport_cost: 50000000,
    insurance_fee: 5000000,
    special_requirements: 'SEED-DEMO-CONFIRMED',
  });
  await linkShipmentHorse(idConfirmed, getHorseId('Hoàng Phi (Chuồng riêng)'), { declared_value: 3500000000, insurance_fee: 5000000 });
  const confRouteId = await upsertRoute(idConfirmed, 'TP.HCM - Phnom Penh (Xe chuyên dụng chuồng riêng VIP)', 245.5, 'confirmed', 'planned', managerAId, managerAId);
  await db.query('DELETE FROM route_leg WHERE route_id = ?', [confRouteId]);
  await db.query(
    `INSERT INTO route_leg (route_id, sequence_no, leg_type, origin_location, destination_location, distance_km, vehicle_id, status, direction)
     VALUES (?, 1, 'road', 'Trạm Điều phối Thủ Đức (TP.HCM)', 'Trạm Đối tác Phnom Penh (Campuchia)', 245.5, ?, 'pending', 'outbound')`,
    [confRouteId, vehicleMap.get('DEMO-51C-001')]
  );
  await db.query('DELETE FROM route_stop WHERE route_id = ?', [confRouteId]);
  await db.query(
    `INSERT INTO route_stop (route_id, sequence_no, stop_type, location_name, country, status, direction, lat, lng)
     VALUES (?, 1, 'border_check', 'Cửa khẩu Quốc tế Mộc Bài (Tây Ninh)', 'Vietnam', 'pending', 'outbound', 11.071200, 106.182300)`,
    [confRouteId]
  );
  await assignStaff(idConfirmed, driver1Id, 'driver', true);
  await assignStaff(idConfirmed, escortId, 'escort', true);

  // 5. ready_to_depart (Pre-transit checks complete, ready at depot)
  const idReady = await upsertShipment({
    ...baseContact,
    origin_location: 'Trạm Điều phối Thủ Đức (TP.HCM)',
    destination_location: 'Trạm Liên vận Miền Trung (Đà Nẵng)',
    requested_date: toSqlDateTime(subDays(now, 3)),
    departure_date: toSqlDateTime(addHours(now, 3)),
    expected_arrival_date: toSqlDateTime(addDays(now, 2)),
    status: 'ready_to_depart',
    total_cost: 60000000,
    transport_cost: 56000000,
    insurance_fee: 4000000,
    special_requirements: 'SEED-DEMO-READY-TO-DEPART',
  });
  await linkShipmentHorse(idReady, getHorseId('Phi Yến'), { declared_value: 950000000, insurance_fee: 4000000 });
  const readyRouteId = await upsertRoute(idReady, 'TP.HCM - Đà Nẵng (Chuyên tuyến Bắc Nam)', 950.0, 'ready_to_depart', 'planned', managerAId, managerAId);
  await db.query('DELETE FROM route_leg WHERE route_id = ?', [readyRouteId]);
  await db.query(
    `INSERT INTO route_leg (route_id, sequence_no, leg_type, origin_location, destination_location, distance_km, vehicle_id, status, direction)
     VALUES (?, 1, 'road', 'Trạm Điều phối Thủ Đức (TP.HCM)', 'Trạm Liên vận Miền Trung (Đà Nẵng)', 950.0, ?, 'pending', 'outbound')`,
    [readyRouteId, vehicleMap.get('DEMO-51C-003')]
  );
  await db.query('DELETE FROM shipment_vehicle WHERE shipment_id = ?', [idReady]);
  if (vehicleMap.get('DEMO-51C-003')) {
    await db.query('INSERT INTO shipment_vehicle (shipment_id, vehicle_id) VALUES (?, ?)', [idReady, vehicleMap.get('DEMO-51C-003')]);
  }
  await assignStaff(idReady, ctx.seedDriverId || driver2Id, 'driver', true);
  if (ctx.seedDriverId && driver2Id && ctx.seedDriverId !== driver2Id) {
    await assignStaff(idReady, driver2Id, 'driver', true);
  }
  await assignStaff(idReady, escortId, 'escort', true);

  // 6. in_transit (En route, live GPS telemetry pings, route stops cleared, clinical health logs)
  const idTransit = await upsertShipment({
    ...baseContact,
    origin_location: 'Trạm Điều phối Thủ Đức (TP.HCM)',
    destination_location: 'Trạm Đối tác Phnom Penh (Campuchia)',
    requested_date: toSqlDateTime(subDays(now, 4)),
    departure_date: toSqlDateTime(subHours(now, 4)),
    expected_arrival_date: toSqlDateTime(addHours(now, 3)),
    status: 'in_transit',
    total_cost: 48000000,
    transport_cost: 45000000,
    insurance_fee: 3000000,
    special_requirements: 'SEED-DEMO-IN-TRANSIT',
  });
  const xichThoId = getHorseId('Xích Thố');
  await linkShipmentHorse(idTransit, xichThoId, { declared_value: 2000000000, insurance_fee: 3000000 });
  const transitRouteId = await upsertRoute(idTransit, 'TP.HCM - Phnom Penh (Hành trình đang chạy)', 245.5, 'in_transit', 'active', managerAId, managerAId);
  const transitTruck = vehicleMap.get('DEMO-51C-004');
  await db.query('DELETE FROM route_leg WHERE route_id = ?', [transitRouteId]);
  await db.query(
    `INSERT INTO route_leg (route_id, sequence_no, leg_type, origin_location, destination_location, distance_km, vehicle_id, status, direction, actual_departure, actual_arrival)
     VALUES
       (?, 1, 'road', 'Trạm Điều phối Thủ Đức (TP.HCM)', 'Cửa khẩu Quốc tế Mộc Bài', 75.0, ?, 'completed', 'outbound', ?, ?),
       (?, 2, 'road', 'Cửa khẩu Quốc tế Mộc Bài', 'Trạm Đối tác Phnom Penh (Campuchia)', 170.5, ?, 'active', 'outbound', ?, NULL)`,
    [
      transitRouteId, transitTruck, toSqlDateTime(subHours(now, 4)), toSqlDateTime(subHours(now, 1)),
      transitRouteId, transitTruck, toSqlDateTime(subMinutes(now, 45)),
    ]
  );
  await db.query('DELETE FROM route_stop WHERE route_id = ?', [transitRouteId]);
  await db.query(
    `INSERT INTO route_stop (route_id, sequence_no, stop_type, location_name, country, status, direction, lat, lng, actual_arrival, actual_departure)
     VALUES
       (?, 1, 'border_check', 'Cửa khẩu Quốc tế Mộc Bài', 'Vietnam', 'departed', 'outbound', 11.071200, 106.182300, ?, ?),
       (?, 2, 'rest', 'Trạm dừng nghỉ Soài Riêng', 'Cambodia', 'pending', 'outbound', 11.085000, 105.799000, NULL, NULL)`,
    [
      transitRouteId, toSqlDateTime(subHours(now, 1)), toSqlDateTime(subMinutes(now, 45)),
      transitRouteId,
    ]
  );
  await db.query('DELETE FROM shipment_vehicle WHERE shipment_id = ?', [idTransit]);
  if (transitTruck) {
    await db.query('INSERT INTO shipment_vehicle (shipment_id, vehicle_id) VALUES (?, ?)', [idTransit, transitTruck]);
  }
  await assignStaff(idTransit, ctx.seedDriverId || driver1Id, 'driver', true);
  if (ctx.seedDriverId && driver1Id && ctx.seedDriverId !== driver1Id) {
    await assignStaff(idTransit, driver1Id, 'driver', true);
  }
  await assignStaff(idTransit, escortId, 'escort', true);

  // Position pings
  await db.query('DELETE FROM vehicle_position_ping WHERE shipment_id = ?', [idTransit]);
  await db.query(
    `INSERT INTO vehicle_position_ping (shipment_id, vehicle_id, reported_by, lat, lng, speed_kmh, heading_deg, source, recorded_at)
     VALUES
       (?, ?, ?, 10.849500, 106.772500, 45.0, 310, 'gps', ?),
       (?, ?, ?, 10.932000, 106.565000, 60.0, 300, 'gps', ?),
       (?, ?, ?, 11.035000, 106.320000, 55.0, 295, 'gps', ?),
       (?, ?, ?, 11.071200, 106.182300, 15.0, 290, 'gps', ?),
       (?, ?, ?, 11.085000, 105.799000, 52.0, 285, 'gps', ?)`,
    [
      idTransit, transitTruck, driver1Id, toSqlDateTime(subMinutes(now, 220)),
      idTransit, transitTruck, driver1Id, toSqlDateTime(subMinutes(now, 150)),
      idTransit, transitTruck, driver1Id, toSqlDateTime(subMinutes(now, 90)),
      idTransit, transitTruck, driver1Id, toSqlDateTime(subMinutes(now, 55)),
      idTransit, transitTruck, driver1Id, toSqlDateTime(subMinutes(now, 10)),
    ]
  );

  // Clinical health logs
  await db.query('DELETE FROM horse_health_log WHERE shipment_id = ?', [idTransit]);
  await db.query(
    `INSERT INTO horse_health_log (shipment_id, horse_id, horse_name, leg_name, recorded_by, recorded_by_role, condition_status, temperature_c, heart_rate_bpm, respiratory_rate_bpm, alert_tier, notes, recorded_at)
     VALUES
       (?, ?, 'Xích Thố', 'Chặng 1: TP.HCM - Mộc Bài', ?, 'escort', 'stable', 37.8, 36, 12, 'green', 'Kiểm tra tiền trạm tại Depot Thủ Đức: Ngựa ăn uống bình thường, niêm mạc hồng hào.', ?),
       (?, ?, 'Xích Thố', 'Chặng 2: Mộc Bài - Phnom Penh', ?, 'escort', 'stable', 38.0, 38, 14, 'green', 'Nghỉ dừng chân tại Mộc Bài: Ngựa được uống nước điện giải, thể trạng ổn định tiếp tục hành trình.', ?)`,
    [
      idTransit, xichThoId, escortId, toSqlDateTime(subMinutes(now, 230)),
      idTransit, xichThoId, escortId, toSqlDateTime(subMinutes(now, 40)),
    ]
  );

  // 7. return_pending (Round-trip, outbound leg finished, waiting for scheduled return departure)
  const idReturn = await upsertShipment({
    ...baseContact,
    origin_location: 'Trạm Điều phối Thủ Đức (TP.HCM)',
    destination_location: 'Trạm Đối tác Phnom Penh (Campuchia)',
    requested_date: toSqlDateTime(subDays(now, 3)),
    departure_date: toSqlDateTime(subDays(now, 1)),
    expected_arrival_date: toSqlDateTime(addDays(now, 2)),
    status: 'return_pending',
    trip_type: 'round_trip',
    return_status: 'scheduled',
    return_wait_minutes: 180,
    return_departure_at: toSqlDateTime(addHours(now, 18)),
    return_freight: 45000000,
    return_insurance_fee: 3000000,
    total_cost: 98000000,
    transport_cost: 92000000,
    insurance_fee: 6000000,
    special_requirements: 'SEED-DEMO-RETURN-PENDING',
  });
  await linkShipmentHorse(idReturn, getHorseId('Hỏa Vân'), { declared_value: 1800000000, insurance_fee: 6000000 });
  await upsertRoute(idReturn, 'TP.HCM - Phnom Penh (Khứ hồi thi đấu)', 491.0, 'confirmed', 'planned', managerAId);

  // 8. completed (Delivered, signed delivery handover record)
  const idCompleted = await upsertShipment({
    ...baseContact,
    origin_location: 'Trạm Điều phối Thủ Đức (TP.HCM)',
    destination_location: 'Trạm Đối tác Turf Club (Singapore)',
    requested_date: toSqlDateTime(subDays(now, 6)),
    departure_date: toSqlDateTime(subDays(now, 3)),
    expected_arrival_date: toSqlDateTime(subDays(now, 1)),
    actual_arrival_date: toSqlDateTime(subDays(now, 1)),
    status: 'completed',
    total_cost: 135000000,
    transport_cost: 130000000,
    insurance_fee: 5000000,
    special_requirements: 'SEED-DEMO-COMPLETED',
  });
  const bachLongId = getHorseId('Bạch Long');
  await linkShipmentHorse(idCompleted, bachLongId, { declared_value: 800000000, insurance_fee: 5000000 });
  const compRouteId = await upsertRoute(idCompleted, 'TP.HCM - Singapore Turf Club', 1850.0, 'completed', 'completed', managerAId, managerAId);
  const compTruck = vehicleMap.get('DEMO-51C-002') || vehicleMap.get('DEMO-51C-001');
  if (compTruck) {
    await db.query('DELETE FROM shipment_vehicle WHERE shipment_id = ?', [idCompleted]);
    await db.query('INSERT INTO shipment_vehicle (shipment_id, vehicle_id) VALUES (?, ?)', [idCompleted, compTruck]);
  }
  await assignStaff(idCompleted, ctx.seedDriverId || driver1Id, 'driver', true);
  await assignStaff(idCompleted, escortId, 'escort', true);
  await db.query('DELETE FROM horse_health_log WHERE shipment_id = ?', [idCompleted]);
  await db.query(
    `INSERT INTO horse_health_log (shipment_id, horse_id, horse_name, leg_name, recorded_by, recorded_by_role, condition_status, temperature_c, heart_rate_bpm, respiratory_rate_bpm, alert_tier, notes, recorded_at)
     VALUES
       (?, ?, 'Bạch Long', 'Chặng 1: TP.HCM - Sân bay Tân Sơn Nhất', ?, 'escort', 'stable', 37.9, 36, 12, 'green', 'Kiểm tra tiền bay ổn định, đủ điều kiện lên khoang chuồng bay HMA.', ?),
       (?, ?, 'Bạch Long', 'Chặng cuối: Changi - Singapore Turf Club', ?, 'escort', 'stable', 38.0, 38, 13, 'green', 'Hạ cánh an toàn, sinh hiệu bình thường, sẵn sàng bàn giao.', ?)`,
    [
      idCompleted, bachLongId, escortId, toSqlDateTime(subDays(now, 3)),
      idCompleted, bachLongId, escortId, toSqlDateTime(subDays(now, 1)),
    ]
  );
  await upsertHandover(idCompleted, ctx.seedDriverId || driver1Id, 'David Lee (Đại diện Singapore Turf Club)', '1 Turf Club Ave, Singapore', 'healthy', customerAId);

  // 9. refund_requested (Operational cancellation e.g. vet_unfit, refund record pending approval)
  const idRefund = await upsertShipment({
    ...baseContact,
    origin_location: 'Trạm Điều phối Thủ Đức (TP.HCM)',
    destination_location: 'Trạm Đối tác Bangkok (Thái Lan)',
    requested_date: toSqlDateTime(subDays(now, 1)),
    departure_date: toSqlDateTime(now),
    status: 'refund_requested',
    total_cost: 85000000,
    transport_cost: 80000000,
    insurance_fee: 5000000,
    cancellation_category: 'vet_unfit',
    cancellation_reason: 'Bác sĩ thú y kiểm tra lâm sàng trước xuất bến ghi nhận ngựa sốt cao 39.5°C, khuyến nghị đình chỉ vận chuyển để cách ly theo dõi.',
    cancelled_by: managerAId,
    cancelled_at: toSqlDateTime(subHours(now, 5)),
    special_requirements: 'SEED-DEMO-REFUND-REQUESTED',
  });
  await linkShipmentHorse(idRefund, getHorseId('Lôi Điện'), { declared_value: 1100000000, insurance_fee: 5000000 });
  await upsertRefundRecord(idRefund, 'vet_unfit', 85000000, 80000000, 5000000, 'pending_approval');

  // 10. requested (New request, specialist reviewing)
  const idRequested = await upsertShipment({
    ...baseContact,
    origin_location: 'Trạm Điều phối Thủ Đức (TP.HCM)',
    destination_location: 'Trạm Trung chuyển Long Biên (Hà Nội)',
    requested_date: toSqlDateTime(subHours(now, 1)),
    departure_date: toSqlDateTime(addDays(now, 10)),
    expected_arrival_date: toSqlDateTime(addDays(now, 12)),
    status: 'requested',
    total_cost: 38000000,
    transport_cost: 35000000,
    insurance_fee: 3000000,
    special_requirements: 'SEED-DEMO-REQUESTED',
  });
  await linkShipmentHorse(idRequested, getHorseId('Hồng Tiêu'), { declared_value: 1300000000, insurance_fee: 3000000 });

  // 11. change_requested (Specialist requested additional info/documents)
  const idChangeReq = await upsertShipment({
    ...baseContact,
    origin_location: 'Trạm Điều phối Thủ Đức (TP.HCM)',
    destination_location: 'Trạm Đối tác Phnom Penh (Campuchia)',
    requested_date: toSqlDateTime(subDays(now, 1)),
    departure_date: toSqlDateTime(addDays(now, 8)),
    expected_arrival_date: toSqlDateTime(addDays(now, 9)),
    status: 'change_requested',
    change_request_notes: 'Hồ sơ xét nghiệm EIA Coggins của ngựa Thần Mã đã quá hạn 60 ngày. Vui lòng cung cấp phiếu xét nghiệm bổ sung trước khi duyệt khả thi.',
    total_cost: 45000000,
    transport_cost: 42000000,
    insurance_fee: 3000000,
    special_requirements: 'SEED-DEMO-CHANGE-REQUESTED',
  });
  await linkShipmentHorse(idChangeReq, getHorseId('Thần Mã'), { declared_value: 1400000000, insurance_fee: 3000000 });

  // 12. cancelled (Cancelled by customer)
  const idCancelled = await upsertShipment({
    ...baseContact,
    origin_location: 'Trạm Điều phối Thủ Đức (TP.HCM)',
    destination_location: 'Trạm Đón trả Tây Nam Bộ (Cần Thơ)',
    requested_date: toSqlDateTime(subDays(now, 5)),
    departure_date: toSqlDateTime(subDays(now, 3)),
    status: 'cancelled',
    cancellation_category: 'customer_request',
    cancellation_reason: 'Khách hàng báo hoãn lịch giao dịch mua bán ngựa tại Cần Thơ.',
    cancelled_by: customerAId,
    cancelled_at: toSqlDateTime(subDays(now, 4)),
    total_cost: 22000000,
    transport_cost: 20000000,
    insurance_fee: 2000000,
    special_requirements: 'SEED-DEMO-CANCELLED',
  });
  await linkShipmentHorse(idCancelled, getHorseId('Bảo Mã'), { declared_value: 850000000, insurance_fee: 2000000 });

  console.log('✓ Successfully seeded 12 transport shipments covering all lifecycle statuses for Customer A!');
}

main().catch((err) => {
  console.error('Demo seed failed:', err);
  process.exitCode = 1;
});
