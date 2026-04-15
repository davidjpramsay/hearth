export const getPlannerTimetableSlotHeight = (slotMinutes: 15 | 30 | 60): number => {
  switch (slotMinutes) {
    case 30:
      return 48;
    case 60:
      return 84;
    case 15:
    default:
      return 32;
  }
};
