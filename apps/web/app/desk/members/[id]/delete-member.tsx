'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMutation } from '@/components/form';
import { Notice } from '@/components/ui';

export function DeleteMember({ memberId }: { memberId: string }) {
  const router = useRouter();
  const m = useMutation();
  const [asked, setAsked] = useState(false);
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        className="btn text-bad"
        disabled={m.busy}
        onClick={async () => {
          if (!asked) return setAsked(true);
          const r = await m.run('DELETE', `/members/${memberId}`, undefined, { refresh: false });
          if (r.ok) router.push('/desk/members');
          else setAsked(false);
        }}
      >
        {asked ? 'Confirm removal' : 'Remove member'}
      </button>
      {m.error ? (
        <div className="max-w-64">
          <Notice tone="bad">{m.error}</Notice>
        </div>
      ) : null}
    </span>
  );
}
