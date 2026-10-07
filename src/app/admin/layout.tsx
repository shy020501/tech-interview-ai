import { AdminSidebar } from "@/components/navigation";
import { requireAdmin } from "@/lib/auth/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <div className="admin-layout"><AdminSidebar /><div className="admin-main"><div className="admin-notice">Admin workspace · Manual content management · Review each version before publishing.</div><main id="main-content" className="admin-content">{children}</main></div></div>;
}
