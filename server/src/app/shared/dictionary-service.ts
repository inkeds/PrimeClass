import type { Pool, RowDataPacket } from 'mysql2/promise';

import { queryFirst, queryRows } from '../../common/db/query.js';

type DictionaryItemRow = RowDataPacket & {
  id: string;
  item_code: string;
  item_name: string;
  sort_order: number;
  extra_json: string | Record<string, unknown> | null;
};

export type DictionaryItem = {
  id: string;
  item_code: string;
  item_name: string;
  sort_order: number;
  extra: Record<string, unknown>;
};

export type DictionaryTone = 'blue' | 'green' | 'gold' | 'red' | 'slate' | 'violet';

export type DictionaryPresentation = {
  code: string;
  label: string;
  tone: DictionaryTone;
};

export async function listEnabledDictionaryItems(db: Pool, typeCode: string) {
  const rows = await queryRows<DictionaryItemRow>(
    db,
    `
      SELECT
        i.id,
        i.item_code,
        i.item_name,
        i.sort_order,
        i.extra_json
      FROM dict_items i
      INNER JOIN dict_types t ON t.id = i.type_id
      WHERE t.type_code = :typeCode
        AND t.status = 'enabled'
        AND i.status = 'enabled'
      ORDER BY i.sort_order DESC, i.id ASC
    `,
    { typeCode },
  );

  return rows.map((row) => ({
    id: row.id,
    item_code: row.item_code,
    item_name: row.item_name,
    sort_order: row.sort_order,
    extra: parseJsonObject(row.extra_json),
  }));
}

export async function findEnabledDictionaryItem(db: Pool, typeCode: string, value: string) {
  const row = await queryFirst<DictionaryItemRow>(
    db,
    `
      SELECT
        i.id,
        i.item_code,
        i.item_name,
        i.sort_order,
        i.extra_json
      FROM dict_items i
      INNER JOIN dict_types t ON t.id = i.type_id
      WHERE t.type_code = :typeCode
        AND t.status = 'enabled'
        AND i.status = 'enabled'
        AND (i.item_code = :value OR i.item_name = :value)
      LIMIT 1
    `,
    {
      typeCode,
      value,
    },
  );

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    item_code: row.item_code,
    item_name: row.item_name,
    sort_order: row.sort_order,
    extra: parseJsonObject(row.extra_json),
  };
}

export async function buildDictionaryMatchValues(db: Pool, typeCode: string, value?: string) {
  if (!value) {
    return [];
  }

  const dictionaryItem = await findEnabledDictionaryItem(db, typeCode, value);
  const rawValues = [value, dictionaryItem?.item_code, dictionaryItem?.item_name];

  return Array.from(new Set(rawValues.filter((item): item is string => Boolean(item))));
}

export function buildDictionaryLookup(items: DictionaryItem[]) {
  const lookup = new Map<string, DictionaryItem>();

  for (const item of items) {
    lookup.set(item.item_code, item);
    lookup.set(item.item_name, item);
  }

  return lookup;
}

export function normalizeDictionaryTone(value: unknown, fallback: DictionaryTone = 'blue'): DictionaryTone {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();

  if (['blue', 'green', 'gold', 'red', 'slate', 'violet'].includes(normalized)) {
    return normalized as DictionaryTone;
  }

  return fallback;
}

export function resolveDictionaryPresentation(
  value: string | null | undefined,
  lookup: Map<string, DictionaryItem>,
  fallbackTone: DictionaryTone = 'blue',
): DictionaryPresentation | null {
  if (!value) {
    return null;
  }

  const matched = lookup.get(value);

  if (!matched) {
    return {
      code: value,
      label: value,
      tone: fallbackTone,
    };
  }

  return {
    code: matched.item_code,
    label: matched.item_name,
    tone: normalizeDictionaryTone(matched.extra.tone, fallbackTone),
  };
}

export function matchesDictionaryExtra(
  extra: Record<string, unknown>,
  key: string,
  candidates: string[],
) {
  if (candidates.length === 0) {
    return true;
  }

  const configuredValues = Array.from(
    new Set([
      ...readStringList(extra[key]),
      ...readStringList(extra[`${key}_codes`]),
      ...readStringList(extra[`${key}_names`]),
      ...readStringList(extra[`${key}_values`]),
    ]),
  );

  if (configuredValues.length === 0) {
    return true;
  }

  return configuredValues.some((value) => candidates.includes(value));
}

function parseJsonObject(value: string | Record<string, unknown> | null) {
  if (!value) {
    return {};
  }

  if (typeof value === 'object') {
    return value;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function readStringList(value: unknown) {
  if (typeof value === 'string') {
    return value.trim() ? [value.trim()] : [];
  }

  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}
