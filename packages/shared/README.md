# @davimurta/stilus-shared

Internal package with types and zod schemas shared by the Stilus SDK, CLI and central API.

## Text keys

Keys follow `page.section.name`: lowercase, dot-separated, hyphens allowed after the first segment.

```ts
import { isValidTextKey, textKeySchema } from "@davimurta/stilus-shared";

isValidTextKey("home.hero.title"); // true
textKeySchema.parse("Home.Hero"); // throws
```
