import { beforeEach } from "vitest";
import { resetDatabase } from "./helpers";

beforeEach(async () => {
  await resetDatabase();
});
