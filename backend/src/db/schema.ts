import { relations } from "drizzle-orm"
import {
  timestamp,
  pgTable,
  text,
  primaryKey,
  integer
} from "drizzle-orm/pg-core"
import type { AdapterAccount } from "next-auth/adapters"
import { randomUUID } from "crypto";

const project_name = "executiveai"

export const users = pgTable("user", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").notNull(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  // createdAt: timestamp("createdAt").default(sql`CURRENT_TIMESTAMP`).notNull(),
  // updatedAt: timestamp("updatedAt"),
})

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  chatSessions: many(chatSessions),
}));


export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccount>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => ({
    compoundKey: primaryKey({ columns: [account.provider, account.providerAccountId] }),
  })
)

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
})

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => ({
    compoundKey: primaryKey({ columns: [vt.identifier, vt.token] }),
  })
)

export const chatSessions = pgTable(`${project_name}_chat_session`, {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title"),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull(),
})

export const chatSessionsRelations = relations(chatSessions, ({ one, many }) => ({
  user: one(users, {
    fields: [chatSessions.userId],
    references: [users.id]
  }),
  messages: many(messages)
}))


export const aiModels = pgTable(`${project_name}_ai_model`, {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  name: text("name").notNull(),
  provider: text("provider").notNull(),
  modelId: text("modelId").notNull(),
  // configuration: text("configuration"),
  description: text("description"),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull(),
})

export const aiModelsRelations = relations(aiModels, ({ many }) => ({
  messages: many(messages)
}))

export const aiAgents = pgTable(`${project_name}_ai_agent`, {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  name: text("name").notNull(),
  type: text("type").notNull(), // e.g., 'youtube', 'forms', etc.
  // configuration: text("configuration"),
  description: text("description"),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull(),
})

export const aiAgentsRelations = relations(aiAgents, ({ many }) => ({
  messages: many(messages)
}))

export const messages = pgTable(`${project_name}_message`, {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  sessionId: text("sessionId")
    .notNull()
    .references(() => chatSessions.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "ai"] }).notNull(),
  content: text("content").notNull(),
  aiModelId: text("aiModelId")
    .notNull()
    .references(() => aiModels.id),
  aiAgentId: text("aiAgentId")
    .references(() => aiAgents.id),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
})

export const messagesRelations = relations(messages, ({ one }) => ({
  chatSession: one(chatSessions, {
    fields: [messages.sessionId],
    references: [chatSessions.id]
  }),
  aiModel: one(aiModels, {
    fields: [messages.aiModelId],
    references: [aiModels.id]
  }),
  aiAgent: one(aiAgents, {
    fields: [messages.aiAgentId],
    references: [aiAgents.id]
  })
}))

export const waitlist = pgTable(`${project_name}_waitlist`, {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  email: text("email").notNull().unique(),
  role: text("role").notNull(),
  description: text("description"),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull(),
})
