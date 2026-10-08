import { z } from "zod";
import { isCalendarDate } from "@/shared/calendar-date";
export const careerObservationSchema = z
  .object({
    clientCommandId: z.uuid(),
    kind: z.enum(["response", "no_response", "offer", "note"]),
    date: z.string().refine(isCalendarDate, {
      message: "Choose a valid actual observation date.",
    }),
    title: z.string().trim().min(1).max(200),
    notes: z.string().trim().max(20000).default(""),
    expectedApplicationVersion: z.number().int().positive(),
  })
  .strict();
