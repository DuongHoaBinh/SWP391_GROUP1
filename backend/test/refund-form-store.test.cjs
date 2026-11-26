// Hồi quy: form hoàn tiền (company_cannot_fulfil) từng luôn lỗi 500 vì query cột `user.role` không tồn tại.
// Bảng `user` chỉ có `role_id`; người nhận thông báo phải lấy qua JOIN bảng `role`.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { OrdersStore } = require('../dist/modules/orders/orders.store');
const { STAFF_REVIEWER_ROLE_NAMES_SQL } = require('../dist/modules/orders/prepaid-policy');

const assertRoleJoinSql = (sql) => {
  assert.ok(!/WHERE\s+role\s+IN/i.test(sql), `SQL không được lọc theo cột user.role không tồn tại: ${sql}`);
  assert.match(sql, /JOIN\s+`role`\s+r\s+ON\s+r\.role_id\s*=\s*u\.role_id/i);
  assert.match(sql, /r\.role_name\s+IN\s*\(/i);
  assert.match(sql, /u\.status\s*=\s*'active'/i);
};

test('Danh sách vai trò nhận thông báo dùng tên trong bảng role', () => {
  assert.match(STAFF_REVIEWER_ROLE_NAMES_SQL, /'Logistics Manager'/);
  assert.match(STAFF_REVIEWER_ROLE_NAMES_SQL, /'Admin'/);
});

test('submitRefundForm: tạo refund record và thông báo Manager/Admin qua JOIN role (không dùng user.role)', async () => {
  const sqls = [];
  const db = {
    execute: async (sql, args) => {
      sqls.push(sql);
      if (/SELECT \* FROM shipment WHERE shipment_id/.test(sql)) {
        return [[{ shipment_id: 100, customer_id: 6, status: 'refund_requested', total_cost: 7000000, transport_cost: 4000000, insurance_fee: 3000000 }]];
      }
      if (/FROM shipment_refund_record/.test(sql)) return [[]];
      if (/INSERT INTO shipment_refund_record/.test(sql)) return [{ insertId: 55 }];
      return [{ affectedRows: 7 }];
    },
  };
  const store = new OrdersStore();
  store.transaction = (action) => action(db);

  const res = await store.submitRefundForm(100, 6, {
    bankName: 'Vietcombank',
    accountNumber: '0123456789',
    accountHolder: 'Nguyen Van A',
    confirmAmount: 7000000,
  });

  assert.equal(res.refundId, 55);
  assert.equal(res.status, 'pending_approval');
  assert.equal(res.accountHolder, 'NGUYEN VAN A');
  const notifySql = sqls.find((s) => /INSERT INTO notification/.test(s));
  assert.ok(notifySql, 'phải gửi thông báo cho Manager/Admin');
  assertRoleJoinSql(notifySql);
});

test('Không còn câu SQL nào trong orders lọc theo cột user.role', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const dir = path.join(__dirname, '..', 'src', 'modules', 'orders');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.ts'))) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.ok(!/`?user`?\s+WHERE\s+role\s+IN/i.test(src), `${f} còn query user.role`);
  }
});
