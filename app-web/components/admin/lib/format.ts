export function formatDateTime(value?: string | null) {
  if (!value) {
    return '--';
  }

  return value.replace('T', ' ').slice(0, 16);
}

export function formatNumber(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '--';
  }

  return new Intl.NumberFormat('zh-CN').format(value);
}

export function stringifyJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

export function parseJsonInput(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return {};
  }

  return JSON.parse(trimmed) as Record<string, unknown>;
}

export function tryParseJsonInput(value: string) {
  try {
    return parseJsonInput(value);
  } catch {
    return null;
  }
}
