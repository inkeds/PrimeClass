export type AppContentFilter = {
  version_code: string | null;
  version_name: string | null;
  grade_code: string | null;
  grade_name?: string | null;
};

const CONTENT_FILTER_KEY = 'primeclass.app.content-filter';

export function readContentFilter() {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(CONTENT_FILTER_KEY);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AppContentFilter;
  } catch {
    window.localStorage.removeItem(CONTENT_FILTER_KEY);
    return null;
  }
}

export function writeContentFilter(filter: AppContentFilter) {
  if (typeof window === 'undefined') {
    return;
  }

  if (!filter.version_code && !filter.grade_code) {
    window.localStorage.removeItem(CONTENT_FILTER_KEY);
    return;
  }

  window.localStorage.setItem(CONTENT_FILTER_KEY, JSON.stringify(filter));
}
