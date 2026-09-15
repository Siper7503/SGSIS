export const SCHOOL_YEAR_START = 2020;
export const SCHOOL_YEAR_END = 2099;
export const DEFAULT_SCHOOL_YEAR = '2025-2026';

export const SCHOOL_YEARS = Array.from(
  { length: SCHOOL_YEAR_END - SCHOOL_YEAR_START + 1 },
  (_, index) => {
    const start = SCHOOL_YEAR_START + index;
    return `${start}-${start + 1}`;
  }
);

export function isValidSchoolYear(value: unknown): value is string {
  return typeof value === 'string' && SCHOOL_YEARS.includes(value);
}
