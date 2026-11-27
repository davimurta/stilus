import { notFound, redirect } from "next/navigation";
import { getDb } from "../db/client";
import { getPanelUser, type AuthenticatedUser } from "./auth";
import { listUserSites, type SiteAccess } from "./users";

/** Logged-in panel user, or a redirect to the login page. */
export async function requirePanelUser(): Promise<AuthenticatedUser> {
  const user = await getPanelUser();
  if (!user) redirect("/entrar");
  return user;
}

/** The site, if the logged-in user is a member; a 404 otherwise (no hint that it exists). */
export async function requireSiteAccess(
  siteId: string,
): Promise<{ user: AuthenticatedUser; site: SiteAccess }> {
  const user = await requirePanelUser();
  const site = (await listUserSites(getDb(), user.id)).find((item) => item.id === siteId);
  if (!site) notFound();
  return { user, site };
}
