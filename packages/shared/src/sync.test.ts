import { describe, expect, it } from "vitest";
import { MAX_SYNC_KEYS, syncRequestSchema } from "./sync.js";

const item = (key: string) => ({ key, defaultValue: "Texto" });

describe("syncRequestSchema", () => {
  it("accepts keys with optional metadata", () => {
    const body = {
      keys: [
        item("home.title"),
        {
          key: "home.body",
          defaultValue: "",
          description: "Corpo",
          page: "home",
          kind: "multiline",
        },
      ],
    };
    expect(syncRequestSchema.parse(body)).toEqual(body);
  });

  it("rejects an empty list (it would orphan every key)", () => {
    expect(syncRequestSchema.safeParse({ keys: [] }).success).toBe(false);
  });

  it("rejects duplicate keys", () => {
    expect(syncRequestSchema.safeParse({ keys: [item("home.a"), item("home.a")] }).success).toBe(
      false,
    );
  });

  it("rejects invalid keys and kinds", () => {
    expect(syncRequestSchema.safeParse({ keys: [item("Home.A")] }).success).toBe(false);
    expect(
      syncRequestSchema.safeParse({ keys: [{ ...item("home.a"), kind: "html" }] }).success,
    ).toBe(false);
  });

  it(`rejects more than ${MAX_SYNC_KEYS} keys`, () => {
    const keys = Array.from({ length: MAX_SYNC_KEYS + 1 }, (_, index) => item(`home.k${index}`));
    expect(syncRequestSchema.safeParse({ keys }).success).toBe(false);
  });

  it("rejects a default text above 10 000 characters", () => {
    const body = { keys: [{ key: "home.a", defaultValue: "a".repeat(10_001) }] };
    expect(syncRequestSchema.safeParse(body).success).toBe(false);
  });
});
