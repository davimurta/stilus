import { describe, expect, it } from "vitest";
import { readServerConfig } from "./config.js";

const valid = {
  STILUS_SITE_ID: "00000000-0000-4000-8000-000000000001",
  STILUS_API_URL: "https://stilus.example.com/",
  STILUS_SITE_KEY: "stilus_sk_abc",
};

describe("readServerConfig", () => {
  it("reads valid settings and trims the trailing slash of the API URL", () => {
    expect(readServerConfig(valid)).toEqual({
      config: {
        siteId: valid.STILUS_SITE_ID,
        apiUrl: "https://stilus.example.com",
        siteKey: "stilus_sk_abc",
      },
      problem: null,
    });
  });

  it("returns null and names the missing settings", () => {
    const result = readServerConfig({});
    expect(result.config).toBeNull();
    expect(result.problem).toContain("STILUS_SITE_ID");
    expect(result.problem).toContain("STILUS_API_URL");
    expect(result.problem).toContain("STILUS_SITE_KEY");
  });

  it("rejects a site id that is not a UUID", () => {
    expect(readServerConfig({ ...valid, STILUS_SITE_ID: "site-1" }).config).toBeNull();
  });

  it("rejects an invalid API URL", () => {
    expect(readServerConfig({ ...valid, STILUS_API_URL: "not a url" }).config).toBeNull();
  });

  it("rejects an empty site key", () => {
    expect(readServerConfig({ ...valid, STILUS_SITE_KEY: "" }).config).toBeNull();
  });
});
