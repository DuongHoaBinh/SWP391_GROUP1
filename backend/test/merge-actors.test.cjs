// Step 1 sau review 11/2026: Transport Specialist + Fleet & Route Coordinator gộp vào Logistics Manager.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Reflector } = require('@nestjs/core');
const { UserRole, normalizeUserRole } = require('../dist/modules/auth/auth.types');
const { JwtAuthGuard } = require('../dist/common/guards/jwt-auth.guard');
const { RolesGuard } = require('../dist/common/guards/roles.guard');
const { ROLES_KEY } = require('../dist/common/decorators/roles.decorator');
const { DocumentsController } = require('../dist/modules/documents/documents.controller');
const { RoutesController } = require('../dist/modules/routes/routes.controller');
const { FleetController } = require('../dist/modules/fleet/fleet.controller');

test('normalizeUserRole maps legacy Specialist/Coordinator roles to LOGISTICS_MANAGER', () => {
  assert.equal(normalizeUserRole(UserRole.TRANSPORT_SPECIALIST), UserRole.LOGISTICS_MANAGER);
  assert.equal(normalizeUserRole(UserRole.FLEET_ROUTE_COORDINATOR), UserRole.LOGISTICS_MANAGER);
  assert.equal(normalizeUserRole('COORDINATOR'), UserRole.LOGISTICS_MANAGER);
  assert.equal(normalizeUserRole('Transport Specialist'), UserRole.LOGISTICS_MANAGER);
  assert.equal(normalizeUserRole('Fleet & Route Coordinator'), UserRole.LOGISTICS_MANAGER);
  for (const role of [UserRole.CUSTOMER, UserRole.DRIVER_ESCORT, UserRole.ADMIN, UserRole.LOGISTICS_MANAGER]) {
    assert.equal(normalizeUserRole(role), role);
  }
});

test('JwtAuthGuard normalizes a legacy Coordinator token to LOGISTICS_MANAGER', async () => {
  const jwt = { verifyAsync: async () => ({ sub: 4, email: 'coord@test.local', role: 'FLEET_ROUTE_COORDINATOR' }) };
  const guard = new JwtAuthGuard(jwt);
  const request = { headers: { authorization: 'Bearer legacy-token' } };
  const ctx = { switchToHttp: () => ({ getRequest: () => request }) };
  assert.equal(await guard.canActivate(ctx), true);
  assert.equal(request.user.role, UserRole.LOGISTICS_MANAGER);
});

function rolesOf(controllerClass) {
  const reflector = new Reflector();
  const proto = controllerClass.prototype;
  const classRoles = reflector.get(ROLES_KEY, controllerClass) || [];
  const all = [];
  for (const name of Object.getOwnPropertyNames(proto)) {
    if (name === 'constructor') continue;
    const roles = reflector.get(ROLES_KEY, proto[name]);
    if (roles) all.push({ name, roles });
  }
  return { classRoles, all };
}

test('No controller endpoint still requires a merged legacy role', () => {
  for (const ctrl of [DocumentsController, RoutesController, FleetController]) {
    const { classRoles, all } = rolesOf(ctrl);
    const legacy = [UserRole.TRANSPORT_SPECIALIST, UserRole.FLEET_ROUTE_COORDINATOR];
    assert.ok(!classRoles.some((r) => legacy.includes(r)), `${ctrl.name} class roles still reference a legacy role`);
    for (const { name, roles } of all) {
      assert.ok(!roles.some((r) => legacy.includes(r)), `${ctrl.name}.${name} still references a legacy role`);
    }
  }
});

test('Logistics Manager can reach former Specialist (regulations) and Coordinator (submit plan) endpoints; Customer cannot', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);
  const ctxFor = (handler, role) => ({
    getHandler: () => handler,
    getClass: () => Object,
    switchToHttp: () => ({ getRequest: () => ({ user: { id: '9', role } }) }),
  });

  const docProto = DocumentsController.prototype;
  const specialistOnly = Object.getOwnPropertyNames(docProto).filter((n) => {
    const roles = reflector.get(ROLES_KEY, docProto[n]);
    return roles && !roles.includes(UserRole.CUSTOMER);
  });
  assert.ok(specialistOnly.length > 0, 'expected staff-only document endpoints');
  for (const name of specialistOnly) {
    assert.equal(guard.canActivate(ctxFor(docProto[name], UserRole.LOGISTICS_MANAGER)), true, `manager blocked on ${name}`);
    assert.throws(() => guard.canActivate(ctxFor(docProto[name], UserRole.CUSTOMER)), /Access denied/);
  }

  const submit = RoutesController.prototype.submitPlanForApproval;
  assert.equal(guard.canActivate(ctxFor(submit, UserRole.LOGISTICS_MANAGER)), true);
  assert.throws(() => guard.canActivate(ctxFor(submit, UserRole.DRIVER_ESCORT)), /Access denied/);
});
