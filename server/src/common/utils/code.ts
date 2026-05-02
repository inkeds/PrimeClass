import { randomBytes } from 'node:crypto';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateRandomCode(length: number): string {
  const bytes = randomBytes(length);
  let result = '';

  for (let index = 0; index < length; index += 1) {
    const byte = bytes[index] ?? 0;
    result += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  }

  return result;
}

export function generateUniqueCodes(count: number, length: number): string[] {
  const set = new Set<string>();

  while (set.size < count) {
    set.add(generateRandomCode(length));
  }

  return [...set];
}

export function buildSerial(prefix: string, randomLength = 6): string {
  return `${prefix}${formatCompactDate(new Date())}${generateRandomCode(randomLength)}`;
}

function formatCompactDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}
