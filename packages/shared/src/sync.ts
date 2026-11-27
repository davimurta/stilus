import { z } from "zod";
import { textKeySchema } from "./key.js";

export const MAX_SYNC_KEYS = 5000;

export const syncKeySchema = z.object({
  key: textKeySchema,
  defaultValue: z.string().max(10_000),
  description: z.string().max(500).optional(),
  page: z.string().max(100).optional(),
  kind: z.enum(["line", "multiline"]).optional(),
});

export const syncRequestSchema = z
  .object({ keys: z.array(syncKeySchema).min(1).max(MAX_SYNC_KEYS) })
  .refine((body) => new Set(body.keys.map((item) => item.key)).size === body.keys.length, {
    message: "Duplicate keys in the request.",
  });

export type SyncKey = z.infer<typeof syncKeySchema>;
export type SyncRequest = z.infer<typeof syncRequestSchema>;

export type SyncResult = {
  /** Keys that did not exist and were created with their default text. */
  created: string[];
  /** Active keys missing from the request, now marked `orphan`. */
  orphaned: string[];
  /** Keys that already existed (metadata refreshed, edited values kept). */
  unchanged: string[];
};
