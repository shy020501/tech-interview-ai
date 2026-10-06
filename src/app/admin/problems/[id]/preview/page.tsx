import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/session';
import { getAdminProblemDetail } from '@/lib/data/authoring';
import { getCategories } from '@/lib/data/categories';
import { getPublishedProblems } from '@/lib/data/problems';
import { ProblemWorkspace } from '@/components/problem-workspace';
export default async function PreviewPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{version?:string}>}) {
 await requireAdmin();const {id}=await params,{version}=await searchParams;
 const [detail,categories,problems]=await Promise.all([getAdminProblemDetail(id,version),getCategories(),getPublishedProblems()]);
 if(!detail)notFound();
 return <><div className="notice mb-5">Admin preview · Saved version {detail.version.version}. Interview actions are disabled. <Link className="text-link" scroll={false} href={`/admin/problems?problem=${id}&version=${detail.version.id}`}>Return to editor</Link></div><ProblemWorkspace problem={detail.problem} categories={categories} problems={problems} preview/></>;
}
