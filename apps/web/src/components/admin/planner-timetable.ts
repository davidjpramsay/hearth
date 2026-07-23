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

interface ComparablePlannerEditorBlock {
  clientId: string;
  userId: number;
  name: string;
  colour: string;
  notes?: string | null;
  startTime: string;
  endTime: string;
}

export const arePlannerEditorBlocksEqual = (
  left: ComparablePlannerEditorBlock[],
  right: ComparablePlannerEditorBlock[],
): boolean =>
  left.length === right.length &&
  left.every((block, index) => {
    const other = right[index];
    return (
      other !== undefined &&
      block.clientId === other.clientId &&
      block.userId === other.userId &&
      block.name === other.name &&
      block.colour === other.colour &&
      block.notes === other.notes &&
      block.startTime === other.startTime &&
      block.endTime === other.endTime
    );
  });
