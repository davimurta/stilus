# 0007. Package names and hosting

Date: 2026-11-28
Status: accepted

- The npm scope `@stilus` already belongs to another organization. Packages are published as
  `@davimurta/stilus-next` (SDK), `@davimurta/stilus` (CLI, command `stilus`) and
  `@davimurta/stilus-shared` (internal schemas the other two depend on). "Stilus" stays the
  product name; prefixes (`STILUS_*`, `data-stilus-*`, `stilus_edit`) do not change.
- Hosting: Railway is supported for the panel (with Railway Postgres) and for sites. The panel
  listens on `PORT`. Sites on Railway must keep a single replica unless a shared ISR cache handler
  is configured, because the revalidation webhook reaches one instance.
- Sites with `output: "export"` (static hosting) are not supported.
