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

