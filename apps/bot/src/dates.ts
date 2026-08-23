const GERMAN_DATE = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/;

export function parseDateInput(input: string): Date | null {
  const german = GERMAN_DATE.exec(input.trim());
  if (german) {
    const [, day, month, year, hour = "0", minute = "0"] = german;
    const date = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
    );
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
