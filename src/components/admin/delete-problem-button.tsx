'use client';

import { useRouter } from 'next/navigation';
import { deleteProblem } from '@/app/actions/admin';
import { Feedback, useAdminMutation } from './editor-fields';

export function DeleteProblemButton({ id, title, selected }: { id: string; title: string; selected: boolean }) {
  const { run, pending, result } = useAdminMutation();
  const router = useRouter();
  return <>
    <button type="button" className="button button-small button-secondary" disabled={pending} onClick={() => {
      if (window.confirm(`Delete problem "${title}" and all its versions permanently? Problems with saved interviews cannot be deleted. Any linked candidate will return to Pending Review. This cannot be undone.`)) {
        run(() => deleteProblem(id), () => { if (selected) router.replace('/admin/problems'); });
      }
    }}>{pending ? 'Deleting…' : 'Delete'}</button>
    <Feedback result={result}/>
  </>;
}
