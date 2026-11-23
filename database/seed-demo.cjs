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
      { email: 'customer_a@example.com', name: 'Nguyễn Văn Chủ Ngựa (Khách A)', roleId: customerRoleId, phone: '0901111222' },
      { email: 'customer_b@example.com', name: 'Trần Thị Chủ Ngựa (Khách B)', roleId: customerRoleId, phone: '0902222333' },
      { email: 'manager_a@example.com', name: 'Ngô Văn Quản Lý (Manager 1)', roleId: managerRoleId, phone: '0903333444' },
      { email: 'manager_b@example.com', name: 'Vũ Thị Quản Lý (Manager 2 - SoD)', roleId: managerRoleId, phone: '0904444555' },
      { email: 'admin_demo@example.com', name: 'Admin Demo (Quản trị viên)', roleId: adminRoleId, phone: '0905555666' },
      { email: 'driver_demo1@example.com', name: 'Đặng Văn Lái 1 (Tài xế)', roleId: driverRoleId, phone: '0906666777' },
      { email: 'driver_demo2@example.com', name: 'Hoàng Văn Lái 2 (Tài xế)', roleId: driverRoleId, phone: '0907777888' },
      { email: 'escort_demo@example.com', name: 'BS. Phạm Thú Y (Áp tải lâm sàng)', roleId: driverRoleId, phone: '0908888999' },
    ];

    for (const u of demoUsers) {
      await db.execute(
        `INSERT INTO \`user\` (role_id, full_name, email, phone, password_hash, account_origin, auth_provider, email_verified, status)
         VALUES (?, ?, ?, ?, ?, 'system_created', 'local', TRUE, 'active')
         ON DUPLICATE KEY UPDATE full_name = VALUES(full_name), password_hash = VALUES(password_hash), phone = VALUES(phone), role_id = VALUES(role_id), status = 'active'`,
        [u.roleId, u.name, u.email, u.phone, passwordHash],
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
        gender: 'stallion',
        color: 'Hồng mã (Bay/Chestnut)',
        microchipNo: '9001820001',
        passportNo: 'VN-FEI-2026-001',
        requiresPrivateStall: false,
        declaredValue: 2000000000,
        status: 'active',
      },
      {
        ownerId: customerAId,
        name: 'Bạch Long',
        breed: 'Arabian',
        gender: 'gelding',
        color: 'Bạch mã (White/Grey)',
        microchipNo: '9001820002',
        passportNo: 'VN-FEI-2026-002',
        requiresPrivateStall: false,
        declaredValue: 800000000,
        status: 'active',
      },
      {
        ownerId: customerAId,
        name: 'Hắc Mã',
        breed: 'Quarter Horse',
        gender: 'mare',
        color: 'Hắc mã (Black)',
        microchipNo: '9001820003',
        passportNo: null,
        requiresPrivateStall: false,
        declaredValue: 500000000,
        status: 'active',
      },
      {
        ownerId: customerAId,
        name: 'Hoàng Phi (Chuồng riêng)',
        breed: 'Thoroughbred Champion',
        gender: 'stallion',
        color: 'Kim mã (Palomino)',
        microchipNo: '9001820004',
        passportNo: 'VN-FEI-2026-004',
        requiresPrivateStall: true,
        declaredValue: 3500000000,
        status: 'active',
      },
      // Customer B (for authorization matrix test)
      {
        ownerId: customerBId,
        name: 'Kiếm Phong (Khách B)',
        breed: 'Warmblood',
        gender: 'stallion',
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
        `INSERT INTO horse (owner_id, name, breed, microchip_no, passport_no, requires_private_stall, declared_value, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           breed = VALUES(breed),
           passport_no = VALUES(passport_no),
           requires_private_stall = VALUES(requires_private_stall),
           declared_value = VALUES(declared_value),
           status = VALUES(status)`,
        [h.ownerId, h.name, h.breed, h.microchipNo, h.passportNo, h.requiresPrivateStall, h.declaredValue, h.status],
      );
    }

    // Retrieve horse IDs
    const [horseRows] = await db.query('SELECT horse_id, name, owner_id FROM horse');
    const horseMap = new Map(horseRows.map((r) => [`${r.owner_id}:${r.name}`, r.horse_id]));

    const horseXichThoId = horseMap.get(`${customerAId}:Xích Thố`);
    const horseBachLongId = horseMap.get(`${customerAId}:Bạch Long`);
    const horseHoangPhiId = horseMap.get(`${customerAId}:Hoàng Phi (Chuồng riêng)`);
    const horseKiemPhongId = horseMap.get(`${customerBId}:Kiếm Phong (Khách B)`);

    // 6. Seed Documents (Valid, Expired, Expiring in 10 Days)
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
        docType: 'passport',
        docNumber: 'VN-FEI-2026-001',
        fileUrl: '/uploads/documents/demo_passport_xichtho.pdf',
        issueDate: minusYears(1),
        expiryDate: plusYears(4),
        status: 'approved',
      },
      {
        horseId: horseXichThoId,
        docType: 'vaccination',
        docNumber: 'VAC-2026-088',
        fileUrl: '/uploads/documents/demo_vaccine_xichtho.pdf',
        issueDate: minusDays(60),
        expiryDate: plusDays(300),
        status: 'approved',
      },
      {
        horseId: horseXichThoId,
        docType: 'coggins',
        docNumber: 'COG-2026-012',
        fileUrl: '/uploads/documents/demo_coggins_xichtho.pdf',
        issueDate: minusDays(90),
        expiryDate: plusDays(275),
        status: 'approved',
      },
      // Bạch Long: passport valid, vaccine expired 1 month ago
      {
        horseId: horseBachLongId,
        docType: 'passport',
        docNumber: 'VN-FEI-2026-002',
        fileUrl: '/uploads/documents/demo_passport_bachlong.pdf',
        issueDate: minusYears(2),
        expiryDate: plusYears(3),
        status: 'approved',
      },
      {
        horseId: horseBachLongId,
        docType: 'vaccination',
        docNumber: 'VAC-2025-OLD',
        fileUrl: '/uploads/documents/demo_vaccine_bachlong_expired.pdf',
        issueDate: minusYears(1),
        expiryDate: minusDays(30), // Expired 30 days ago
        status: 'expired',
      },
      // Hoàng Phi: passport valid, health cert expiring in 10 days
      {
        horseId: horseHoangPhiId,
        docType: 'passport',
        docNumber: 'VN-FEI-2026-004',
        fileUrl: '/uploads/documents/demo_passport_hoangphi.pdf',
        issueDate: minusYears(1),
        expiryDate: plusYears(4),
        status: 'approved',
      },
      {
        horseId: horseHoangPhiId,
        docType: 'health_certificate',
        docNumber: 'HC-2026-EXPIRING',
        fileUrl: '/uploads/documents/demo_health_hoangphi_expiring.pdf',
        issueDate: minusDays(20),
        expiryDate: plusDays(10), // Expiring in ~10 days
        status: 'approved',
      },
      // Kiếm Phong (Customer B)
      {
        horseId: horseKiemPhongId,
        docType: 'passport',
        docNumber: 'VN-FEI-2026-005',
        fileUrl: '/uploads/documents/demo_passport_kiemphong.pdf',
        issueDate: minusYears(1),
        expiryDate: plusYears(4),
        status: 'approved',
      },
    ];

    for (const d of demoDocs) {
      if (!d.horseId) continue;
      await db.execute(
        `INSERT INTO horse_document (horse_id, doc_type, doc_number, file_url, issue_date, expiry_date, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           file_url = VALUES(file_url),
           expiry_date = VALUES(expiry_date),
           status = VALUES(status)`,
        [d.horseId, d.docType, d.docNumber, d.fileUrl, d.issueDate, d.expiryDate, d.status],
      );
    }

    console.log('✓ Demo data seeded successfully!');
    console.log('====================================================');
    console.log('DEMO ACCOUNTS (Password: %s):', DEMO_PASSWORD);
    console.log('  Customer A: customer_a@example.com (4 horses, docs ready/expiring)');
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

main().catch((err) => {
  console.error('Demo seed failed:', err);
  process.exitCode = 1;
});
