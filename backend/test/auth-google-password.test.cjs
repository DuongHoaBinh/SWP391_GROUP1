const { test } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { AuthService } = require('../dist/modules/auth/auth.service');
const {
  GOOGLE_OAUTH_NO_PASSWORD_MARKER,
  UserRole,
  hasLocalPasswordHash,
} = require('../dist/modules/auth/auth.types');

function makeAuthService(initialUser) {
  let storedUser = { ...initialUser };
  const store = {
    findUser: async (email) =>
      storedUser.email === email ? { ...storedUser } : undefined,
    findUserById: async (userId) =>
      storedUser.id === String(userId) ? { ...storedUser } : undefined,
    updateUserPassword: async (userId, passwordHash) => {
      if (storedUser.id === String(userId)) {
        storedUser = {
          ...storedUser,
          passwordHash,
          hasPassword: hasLocalPasswordHash(passwordHash),
        };
      }
    },
  };
  const jwtService = { signAsync: async () => 'signed-jwt-token' };
  const mailService = {};
  return {
    service: new AuthService(store, jwtService, mailService),
    getStoredUser: () => storedUser,
  };
}

test('Google OAuth sentinel is rejected by bcrypt and flagged as hasPassword=false', async () => {
  assert.equal(hasLocalPasswordHash(GOOGLE_OAUTH_NO_PASSWORD_MARKER), false);
  assert.equal(
    await bcrypt.compare(
      GOOGLE_OAUTH_NO_PASSWORD_MARKER,
      GOOGLE_OAUTH_NO_PASSWORD_MARKER,
    ),
    false,
  );
});

test('Google user without local password cannot log in via password form', async () => {
  const { service } = makeAuthService({
    id: '99',
    email: 'gmail.user@gmail.com',
    fullName: 'Gmail User',
    passwordHash: GOOGLE_OAUTH_NO_PASSWORD_MARKER,
    role: UserRole.CUSTOMER,
    authProvider: 'google',
    hasPassword: false,
    emailVerified: true,
    status: 'active',
    createdAt: '2026-11-20T00:00:00.000Z',
  });

  await assert.rejects(
    service.login({
      email: 'gmail.user@gmail.com',
      password: GOOGLE_OAUTH_NO_PASSWORD_MARKER,
    }),
    /Invalid email or password/,
  );

  const profile = await service.getProfile('99');
  assert.equal(profile.authProvider, 'google');
  assert.equal(profile.hasPassword, false);
});

test('Google user without local password can set initial password without currentPassword, then requires currentPassword afterward', async () => {
  const { service, getStoredUser } = makeAuthService({
    id: '99',
    email: 'gmail.user@gmail.com',
    fullName: 'Gmail User',
    passwordHash: GOOGLE_OAUTH_NO_PASSWORD_MARKER,
    role: UserRole.CUSTOMER,
    authProvider: 'google',
    hasPassword: false,
    emailVerified: true,
    status: 'active',
    createdAt: '2026-11-20T00:00:00.000Z',
  });

  const setupRes = await service.changePassword('99', {
    newPassword: 'MyPassword1',
    confirmPassword: 'MyPassword1',
  });
  assert.equal(setupRes.hasPassword, true);
  assert.equal(getStoredUser().hasPassword, true);

  const profileAfter = await service.getProfile('99');
  assert.equal(profileAfter.authProvider, 'google');
  assert.equal(profileAfter.hasPassword, true);

  // Can now sign in with Email + Password
  const loginRes = await service.login({
    email: 'gmail.user@gmail.com',
    password: 'MyPassword1',
  });
  assert.equal(loginRes.accessToken, 'signed-jwt-token');
  assert.equal(loginRes.user.hasPassword, true);

  // Subsequent password changes must require and validate currentPassword
  await assert.rejects(
    service.changePassword('99', {
      newPassword: 'MyPassword2',
      confirmPassword: 'MyPassword2',
    }),
    /Vui lòng nhập mật khẩu hiện tại/,
  );

  await assert.rejects(
    service.changePassword('99', {
      currentPassword: 'WrongPassword1',
      newPassword: 'MyPassword2',
      confirmPassword: 'MyPassword2',
    }),
    /Mật khẩu hiện tại không chính xác/,
  );

  const changeRes = await service.changePassword('99', {
    currentPassword: 'MyPassword1',
    newPassword: 'MyPassword2',
    confirmPassword: 'MyPassword2',
  });
  assert.equal(changeRes.hasPassword, true);
});
