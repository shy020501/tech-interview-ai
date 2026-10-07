"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@/components/auth-form";

const userLinks = [{ href: "/problems", label: "Practice" }, { href: "/review", label: "Review" }];
const adminLinks = [
  { href: "/admin", label: "Overview", mark: "01" },
  { href: "/admin/sources", label: "Sources", mark: "02" },
  { href: "/admin/candidates", label: "Candidates", mark: "03" },
  { href: "/admin/problems", label: "Problems", mark: "04" },
  { href: "/admin/categories", label: "Categories", mark: "05" },
  { href: "/admin/evals", label: "Evaluations", mark: "06" },
  { href: "/admin/test", label: "Test", mark: "07" },
];

export function UserHeader({ session }: { session: { signedIn: boolean; isAdmin: boolean } }) {
  const path = usePathname();
  return <header className="app-header"><Link href="/problems" className="brand"><span className="brand-mark" aria-hidden="true">ti</span><span>tech-interview<span className="muted">-ai</span></span></Link><nav aria-label="Main navigation" className="header-nav">{userLinks.map((link) => <Link key={link.href} href={link.href} prefetch={link.href === "/review" ? false : undefined} aria-current={path.startsWith(link.href) ? "page" : undefined}>{link.label}</Link>)}</nav><div className="header-end"><span className="prototype-label">Practice workspace</span>{session.isAdmin && <Link href="/admin" prefetch={false} className="text-link">Admin</Link>}{session.signedIn ? <SignOutButton /> : <Link href={`/login?next=${encodeURIComponent(path)}`} className="text-link">Sign in</Link>}</div></header>;
}

export function AdminSidebar() {
  const path = usePathname();
  return <aside className="admin-sidebar"><Link href="/admin" className="brand"><span className="brand-mark" aria-hidden="true">ti</span><span>Content studio</span></Link><p className="eyebrow mt-10 mb-3">Workspace</p><nav aria-label="Admin navigation">{adminLinks.map((link) => <Link key={link.href} href={link.href} className="side-link" aria-current={path === link.href ? "page" : undefined}><span className="nav-index">{link.mark}</span>{link.label}</Link>)}</nav><div className="admin-sidebar-footer"><p className="muted text-sm mb-3">From source to thoughtful practice.</p><Link href="/problems" className="text-link">Back to practice →</Link><div className="mt-4"><SignOutButton /></div></div></aside>;
}
