import Link from "next/link";
import { logout } from "@/app/actions";
import type { AuthenticatedUser } from "@/lib/auth";
import { messages } from "@/lib/messages";

export function PanelHeader({ user }: { user: AuthenticatedUser }) {
  return (
    <header className="panel-header">
      <Link href="/sites" className="brand">
        {messages.appTitle}
      </Link>
      <nav aria-label="Painel" className="nav">
        <Link href="/sites">{messages.nav.sites}</Link>
        <Link href="/conta">{messages.nav.account}</Link>
      </nav>
      <form action={logout} className="user">
        <span>{user.name}</span>
        <button type="submit" className="link">
          {messages.nav.logout}
        </button>
      </form>
    </header>
  );
}
