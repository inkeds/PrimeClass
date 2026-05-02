import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const PASSWORD_PREFIX = 'scrypt';
const KEY_LENGTH = 64;

export function hashPassword(password: string, salt = randomBytes(16).toString('hex')): string {
  const hash = scryptSync(password, salt, KEY_LENGTH).toString('hex');
  return `${PASSWORD_PREFIX}$${salt}$${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (storedHash.startsWith(`${PASSWORD_PREFIX}$`)) {
    const segments = storedHash.split('$');

    if (segments.length !== 3 || !segments[1] || !segments[2]) {
      return false;
    }

    const hash = scryptSync(password, segments[1], KEY_LENGTH);
    return safeCompareHex(hash, segments[2]);
  }

  if (storedHash.startsWith('plain$')) {
    return safeCompareString(password, storedHash.slice('plain$'.length));
  }

  return safeCompareString(password, storedHash);
}

function safeCompareString(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function safeCompareHex(left: Buffer, rightHex: string): boolean {
  const rightBuffer = Buffer.from(rightHex, 'hex');

  if (left.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(left, rightBuffer);
}
