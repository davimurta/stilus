import type { Metadata } from "next";
import Link from "next/link";
import { PanelHeader } from "@/components/header";
import { getDb } from "@/db/client";
import { messages } from "@/lib/messages";
import { requirePanelUser } from "@/lib/panel-access";
import { listUserSites } from "@/lib/users";

export const metadata: Metadata = { title: messages.sites.title };

export default async function SitesPage() {
  const user = await requirePanelUser();
  const sites = await listUserSites(getDb(), user.id);
  return (
    <>
      <PanelHeader user={user} />
      <main>
        <h1>{messages.sites.title}</h1>
        {sites.length === 0 ? (
          <p className="muted">{messages.sites.empty}</p>
        ) : (
          <ul className="site-list">
            {sites.map((site) => (
              <li key={site.id}>
                <Link href={`/sites/${site.id}`}>{site.name}</Link>{" "}
                <span className="muted">
                  {site.domain} · {messages.sites.role[site.role]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
