export type Category = "work" | "personal" | "health" | "learning" | "family" | "other";

export type ScheduleEvent = {
  id: string;
  title: string;
  description: string;
  location: string;
  category: Category;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
};

export type ScheduleValues = Omit<ScheduleEvent, "id" | "startAt" | "endAt"> & {
  date: string;
  startTime: string;
  endTime: string;
};

export type ScheduleMutation =
  | { operation: "create"; values: ScheduleValues }
  | { operation: "update"; eventId: string; values: ScheduleValues }
  | { operation: "delete"; eventId: string }
  | { operation: "deleteMany"; eventIds: string[] };

