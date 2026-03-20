import {
  pgTable,
  text,
  timestamp,
  jsonb,
  boolean,
  serial,
  index,
} from "drizzle-orm/pg-core";

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    title: text("title"),
    persona: text("persona").default("supportive"),
    messages: jsonb("messages").default([]),
    summary: text("summary"),
    isPublic: boolean("is_public").default(false),
    shareId: text("share_id"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_share_id_idx").on(table.shareId),
  ]
);

export const founderProfiles = pgTable("founder_profiles", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  context: text("context"),
  goals: text("goals"),
  lastSessionSummary: text("last_session_summary"),
  sessionCount: serial("session_count"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
