import { z } from "zod";

/**
 * Text key format: lowercase segments separated by dots, e.g. `home.hero.title`.
 * The first segment allows only letters and digits; later segments also allow hyphens.
 */
export const TEXT_KEY_PATTERN = /^[a-z0-9]+(\.[a-z0-9-]+)*$/;

export const textKeySchema = z
  .string()
  .regex(TEXT_KEY_PATTERN, "Invalid text key. Use lowercase segments separated by dots.");

export type TextKey = z.infer<typeof textKeySchema>;

export function isValidTextKey(value: unknown): value is TextKey {
  return textKeySchema.safeParse(value).success;
}
