import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createOneTimeToken, hashSecret, secretsMatch, signSession, verifySession } from './auth-security.ts';

const originalSecret = process.env.JWT_SECRET;
const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalSecret;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
});

test('session tokens round-trip their claims and reject tampering', () => {
  process.env.JWT_SECRET = 'test-session-secret';
  const token = signSession({ uid: 'user-1', role: 'Directeur DSE' });

  assert.deepEqual(verifySession(token).uid, 'user-1');
  assert.throws(() => verifySession(`${token}tampered`));
});

test('production requires a configured JWT secret', () => {
  delete process.env.JWT_SECRET;
  process.env.NODE_ENV = 'production';

  assert.throws(() => signSession({ uid: 'user-1' }), /JWT_SECRET/);
});

test('one-time tokens are unique and secret comparisons require the matching hash', () => {
  const first = createOneTimeToken();
  const second = createOneTimeToken();

  assert.match(first, /^SGSIS-CO-/);
  assert.notEqual(first, second);
  assert.equal(secretsMatch('secret', hashSecret('secret')), true);
  assert.equal(secretsMatch('other', hashSecret('secret')), false);
  assert.equal(secretsMatch('secret', null), false);
});
