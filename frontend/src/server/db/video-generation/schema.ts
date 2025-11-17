import {
  text,
  timestamp,
  jsonb,
  varchar,
  pgTableCreator,
} from "drizzle-orm/pg-core";
import { users } from "../auth/schema";

/**
 * Table creator for video generation tables with video_ prefix.
 */
export const createVideoTable = pgTableCreator((name) => `video_${name}`);

export const videoSessions = createVideoTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  status: varchar("status", { length: 50 }).notNull().default("created"),
  topic: varchar("topic", { length: 200 }),
  learningObjective: text("learning_objective"),
  extractedFacts: jsonb("extracted_facts"), // All extracted facts (pending review)
  confirmedFacts: jsonb("confirmed_facts"), // Only confirmed facts (after user approval)
  generatedScript: jsonb("generated_script"), // Generated script (editable by user)
  currentStep: varchar("current_step", { length: 50 }),
  workflowContext: jsonb("workflow_context"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const videoAssets = createVideoTable("asset", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => videoSessions.id),
  assetType: varchar("asset_type", { length: 50 }).notNull(),
  url: text("url"),
  s3Key: text("s3_key"), // S3 key path: users/{userID}/{sessionID}/images/selected/{filename}
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const conversationMessages = createVideoTable("conversation_message", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => videoSessions.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 20 }).notNull(), // 'user' | 'assistant' | 'system'
  content: text("content").notNull(),
  parts: jsonb("parts"), // Store UIMessage parts structure
  metadata: jsonb("metadata"), // Store workflow context, structured outputs reference, etc.
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
