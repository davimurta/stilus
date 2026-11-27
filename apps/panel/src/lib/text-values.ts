/** Hard cap for any text value, whatever the text's own max_length says. */
export const ABSOLUTE_MAX_LENGTH = 10_000;

// Control characters other than line feed. Tab is allowed.
const FORBIDDEN_CHARACTERS = /[\u0000-\u0008\u000B-\u001F\u007F]/;

export type ValueCheck =
  { ok: true; value: string } | { ok: false; code: "too_long" | "invalid_value"; message: string };

/**
 * Validates and normalizes a plain-text value. Values are never interpreted as HTML; they are
 * escaped when rendered, so markup is stored as typed.
 */
export function checkTextValue(
  raw: string,
  text: { kind: "line" | "multiline"; maxLength: number | null },
): ValueCheck {
  const value = raw.replace(/\r\n?/g, "\n");
  const limit = Math.min(text.maxLength ?? ABSOLUTE_MAX_LENGTH, ABSOLUTE_MAX_LENGTH);

  // Length in characters as people count them (code points), not UTF-16 units.
  if ([...value].length > limit) {
    return {
      ok: false,
      code: "too_long",
      message: `O texto pode ter no máximo ${limit} caracteres.`,
    };
  }
  if (FORBIDDEN_CHARACTERS.test(value)) {
    return { ok: false, code: "invalid_value", message: "O texto contém caracteres inválidos." };
  }
  if (text.kind === "line" && value.includes("\n")) {
    return { ok: false, code: "invalid_value", message: "Este texto deve ter uma linha só." };
  }
  return { ok: true, value };
}
