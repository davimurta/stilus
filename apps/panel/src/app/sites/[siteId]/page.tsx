import type { Metadata } from "next";
import Link from "next/link";
import { PanelHeader } from "@/components/header";
import { RevalidationBanner } from "@/components/revalidation-banner";
import { getDb } from "@/db/client";
import { messages } from "@/lib/messages";
import { requireSiteAccess } from "@/lib/panel-access";
import { getRevalidationStatus } from "@/lib/revalidation";
import { listSitePages, listSiteTexts, textFiltersSchema } from "@/lib/site-texts";

export const metadata: Metadata = { title: "Textos" };

type Props = {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

export default async function SiteTextsPage({ params, searchParams }: Props) {
  const { siteId } = await params;
  const { user, site } = await requireSiteAccess(siteId);
  const raw = await searchParams;
  const filters = textFiltersSchema.parse({
    q: typeof raw.q === "string" ? raw.q : undefined,
    page: typeof raw.page === "string" && raw.page ? raw.page : undefined,
    status: typeof raw.status === "string" ? raw.status : undefined,
  });
  const db = getDb();
  const [rows, pages, revalidation] = await Promise.all([
    listSiteTexts(db, site.id, filters),
    listSitePages(db, site.id),
    getRevalidationStatus(db, site.id),
  ]);
  const t = messages.texts;

  return (
    <>
      <PanelHeader user={user} />
      <main>
        <h1>{t.title(site.name)}</h1>
        <RevalidationBanner siteId={site.id} status={revalidation} />
        <form className="filters" role="search">
          <label className="field">
            {t.search}
            <input
              name="q"
              type="search"
              defaultValue={filters.q ?? ""}
              placeholder={t.searchPlaceholder}
            />
          </label>
          <label className="field">
            {t.page}
            <select name="page" defaultValue={filters.page ?? ""}>
              <option value="">{t.allPages}</option>
              {pages.map((page) => (
                <option key={page} value={page}>
                  {page}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {t.status}
            <select name="status" defaultValue={filters.status ?? "active"}>
              <option value="active">{t.statusActive}</option>
              <option value="orphan">{t.statusOrphan}</option>
              <option value="all">{t.statusAll}</option>
            </select>
          </label>
          <button type="submit">{t.filter}</button>
        </form>

        <p className="muted">
          {t.count(rows.length)} · {t.orphanHelp}
        </p>
        {rows.length === 0 ? (
          <p>{t.empty}</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t.columns.key}</th>
                <th>{t.columns.value}</th>
                <th>{t.columns.page}</th>
                <th>{t.columns.updated}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} data-key={row.key}>
                  <td className="key">
                    <Link
                      href={`/sites/${site.id}/textos/${row.key}`}
                      aria-label={`${t.edit} ${row.key}`}
                    >
                      {row.key}
                    </Link>
                    {row.status === "orphan" ? (
                      <span className="badge orphan">{t.badgeOrphan}</span>
                    ) : null}
                    {row.isNew ? <span className="badge new">{t.badgeNew}</span> : null}
                  </td>
                  <td className="value">
                    {row.value}
                    {row.description ? <div className="muted">{row.description}</div> : null}
                  </td>
                  <td>{row.page}</td>
                  <td>{dateFormat.format(row.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </>
  );
}
