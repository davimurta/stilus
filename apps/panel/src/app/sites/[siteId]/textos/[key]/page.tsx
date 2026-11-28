import { textKeySchema } from "@davimurta/stilus-shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { restoreTextVersion, saveText } from "@/app/sites/[siteId]/actions";
import { ActionButton } from "@/components/action-button";
import { PanelHeader } from "@/components/header";
import { RevalidationBanner } from "@/components/revalidation-banner";
import { TextEditor } from "@/components/text-editor";
import { getDb } from "@/db/client";
import { getText, listVersions } from "@/lib/history";
import { messages } from "@/lib/messages";
import { requireSiteAccess } from "@/lib/panel-access";
import { getRevalidationStatus } from "@/lib/revalidation";

type Props = { params: Promise<{ siteId: string; key: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: decodeURIComponent((await params).key) };
}

const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium" });

export default async function TextPage({ params }: Props) {
  const { siteId, key: rawKey } = await params;
  const { user, site } = await requireSiteAccess(siteId);
  const key = textKeySchema.safeParse(decodeURIComponent(rawKey));
  if (!key.success) notFound();

  const db = getDb();
  const text = await getText(db, site.id, key.data);
  if (!text) notFound();
  const [versions, revalidation] = await Promise.all([
    listVersions(db, text.id),
    getRevalidationStatus(db, site.id),
  ]);
  const m = messages.text;

  return (
    <>
      <PanelHeader user={user} />
      <main className="stack">
        <p>
          <Link href={`/sites/${site.id}`}>{m.back}</Link>
        </p>
        <h1 className="key-title">{text.key}</h1>
        <RevalidationBanner siteId={site.id} status={revalidation} />
        {text.status === "orphan" ? <p className="banner">{m.orphanNotice}</p> : null}
        <dl className="meta">
          <dt>{m.description}</dt>
          <dd>{text.description ?? "—"}</dd>
          <dt>{m.page}</dt>
          <dd>{text.page ?? "—"}</dd>
          <dt>{m.defaultValue}</dt>
          <dd className="value">{text.defaultValue}</dd>
          <dt>Tipo</dt>
          <dd>{m.kind[text.kind]}</dd>
        </dl>

        <TextEditor
          action={saveText.bind(null, site.id, text.key)}
          value={text.value}
          kind={text.kind}
          maxLength={text.maxLength}
        />

        <section role="region" aria-label={m.history}>
          <h2>{m.history}</h2>
          {versions.length === 0 ? (
            <p className="muted">{m.historyEmpty}</p>
          ) : (
            <ol className="history">
              {versions.map((version, index) => (
                <li key={version.id}>
                  <div className="value">{version.value}</div>
                  <div className="muted">
                    {dateFormat.format(version.createdAt)} · {version.authorName ?? m.unknownAuthor}
                  </div>
                  {index === 0 ? (
                    <span className="badge new">{m.currentVersion}</span>
                  ) : (
                    <ActionButton
                      action={restoreTextVersion.bind(null, site.id, text.key)}
                      label={m.restore}
                      hidden={{ versionId: version.id }}
                      className="secondary"
                    />
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>
      </main>
    </>
  );
}
