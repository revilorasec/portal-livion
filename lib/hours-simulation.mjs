import { closing, officialOptions, optionIncludesDay } from './hours-calculations.mjs?v=2';

export function simulateOptions(employeeId, days, settings, overrides, entries, rates) {
  return officialOptions.map(option => {
    const eligible = days.filter(day => optionIncludesDay(day, option.key));
    const result = closing(employeeId, eligible, settings, overrides, entries, { active_option: option.key, [option.field]: rates[option.field] ?? null });
    return { ...option, ...result };
  });
}
