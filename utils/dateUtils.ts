
// Helper to add days to a date
export const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

// Helper to get the total number of days between two dates (inclusive)
export const getDaysBetween = (startDate: Date, endDate: Date): number => {
  // Normalize to midnight to ensure correct day difference calculation regardless of time
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  
  const differenceInTime = end.getTime() - start.getTime();
  return Math.round(differenceInTime / (1000 * 3600 * 24)) + 1;
};

// Formats a date to YYYY-MM-DD in a timezone-safe way
export const formatDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
};
