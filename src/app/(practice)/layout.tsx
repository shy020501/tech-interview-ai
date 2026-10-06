import { UserHeader } from '@/components/navigation';
import { getSessionDisplay } from '@/lib/auth/session';
export default async function PracticeLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionDisplay();
  return <><UserHeader session={session} />{children}</>;
}
