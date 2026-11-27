import { expect, test } from "@playwright/test";
import { OFFLINE_SITE_URL } from "./support/env";
import { DEFAULT_PAGES } from "./support/pages";

// This build points STILUS_API_URL at a port where nothing listens: the central API is down
// during the build and while serving. Reaching this test means the build itself succeeded.

for (const page of DEFAULT_PAGES) {
  test(`with the API down, ${page.path} serves the default texts`, async ({ request }) => {
    const response = await request.get(`${OFFLINE_SITE_URL}${page.path}`);
    expect(response.status()).toBe(200);

    const html = await response.text();
    expect(html).toContain(`<title>${page.title}</title>`);
    for (const text of page.texts) {
      expect(html).toContain(text);
    }
  });
}
