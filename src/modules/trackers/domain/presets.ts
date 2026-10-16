import { definitionSchema, type Field } from "./tracker";
const text = (key: string, label: string, required = false): Field => ({
  key,
  label,
  type: "text",
  required,
  retired: false,
  validation: {},
  options: [],
});
const date = (key: string, label: string): Field => ({
  ...text(key, label),
  type: "date",
});
const status: Field = {
  ...text("status", "Status", true),
  type: "single_select",
  default: "planned",
  options: [
    { key: "planned", label: "Planned", retired: false },
    { key: "active", label: "In progress", retired: false },
    { key: "completed", label: "Completed", retired: false },
  ],
};
export const presets = {
  learning: definitionSchema.parse({
    name: "Learning",
    fields: [
      text("topic", "Topic", true),
      text("technology", "Technology"),
      status,
      date("started", "Started"),
      date("completed_date", "Completion date"),
      date("due", "Deadline"),
      text("notes", "Notes"),
    ],
    titleKey: "topic",
    statusKey: "status",
    deadlineKey: "due",
    completedStatusKeys: ["completed"],
  }),
  books: definitionSchema.parse({
    name: "Books",
    fields: [
      text("title", "Title", true),
      text("author", "Author"),
      {
        ...text("rating", "Rating"),
        type: "number",
        validation: { min: "0", max: "5" },
      },
      { ...text("finished", "Finished"), type: "checkbox", default: false },
      date("completed_date", "Completion date"),
    ],
    titleKey: "title",
    statusKey: null,
    deadlineKey: null,
    completionKey: "finished",
  }),
  tasks: definitionSchema.parse({
    name: "Personal Tasks",
    fields: [
      text("title", "Title", true),
      {
        ...text("priority", "Priority"),
        type: "single_select",
        options: [
          { key: "low", label: "Low", retired: false },
          { key: "normal", label: "Normal", retired: false },
          { key: "high", label: "High", retired: false },
        ],
        default: "normal",
      },
      status,
      date("due", "Due date"),
    ],
    titleKey: "title",
    statusKey: "status",
    deadlineKey: "due",
    completedStatusKeys: ["completed"],
  }),
};
