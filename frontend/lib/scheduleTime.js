export const toLocalDateTimeInput = (date) => {
  const localDate = new Date(
    date.getTime() - date.getTimezoneOffset() * 60000
  );
  return localDate.toISOString().slice(0, 16);
};

export const localDateTimeToIso = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid schedule date and time.");
  }
  return date.toISOString();
};
