import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  index,
} from "drizzle-orm/pg-core";

export const membershipRole = pgEnum("membership_role", ["admin", "editor"]);
export const textKind = pgEnum("text_kind", ["line", "multiline"]);
export const textStatus = pgEnum("text_status", ["active", "orphan"]);

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// users, sessions, accounts and verifications follow the Better Auth schema.
// The password hash (argon2) lives in accounts.password, as Better Auth expects.
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    // Always stored lowercase (enforced by a check), so a plain unique constraint is enough.
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [check("users_email_lowercase", sql`${table.email} = lower(${table.email})`)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    token: text("token").notNull().unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("sessions_user_idx").on(table.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("accounts_user_idx").on(table.userId)],
);

export const verifications = pgTable("verifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sites = pgTable("sites", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  domain: text("domain").notNull(),
  // SHA-256 hex of the site API key. The key itself is shown once and never stored.
  apiKeyHash: text("api_key_hash").notNull().unique(),
  revalidateUrl: text("revalidate_url").notNull(),
  // Stored as-is: the central API needs it to sign webhook bodies (HMAC).
  revalidateSecret: text("revalidate_secret").notNull(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  createdAt: createdAt(),
});

export const memberships = pgTable(
  "memberships",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    role: membershipRole("role").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.siteId] })],
);

export const texts = pgTable(
  "texts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    page: text("page"),
    description: text("description"),
    value: text("value").notNull(),
    defaultValue: text("default_value").notNull(),
    kind: textKind("kind").notNull().default("line"),
    maxLength: integer("max_length"),
    status: textStatus("status").notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  },
  (table) => [
    uniqueIndex("texts_site_key_unique").on(table.siteId, table.key),
    check("texts_max_length_positive", sql`${table.maxLength} IS NULL OR ${table.maxLength} > 0`),
  ],
);

export const textVersions = pgTable(
  "text_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    textId: uuid("text_id")
      .notNull()
      .references(() => texts.id, { onDelete: "cascade" }),
    value: text("value").notNull(),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    // clock_timestamp(), not now(): versions written in one transaction must keep their order.
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (table) => [index("text_versions_text_created_idx").on(table.textId, table.createdAt)],
);

export const activityLog = pgTable(
  "activity_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    siteId: uuid("site_id").references(() => sites.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    detail: text("detail"),
    createdAt: createdAt(),
  },
  (table) => [index("activity_log_site_created_idx").on(table.siteId, table.createdAt)],
);
