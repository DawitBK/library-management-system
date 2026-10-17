'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMutation } from '@/components/form';
import { Notice } from '@/components/ui';

export function DeleteBook({ bookId }: { bookId: string }) {
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
          const r = await m.run('DELETE', `/books/${bookId}`, undefined, { refresh: false });
          if (r.ok) router.push('/desk/books');
          else setAsked(false);
        }}
      >
        {asked ? 'Confirm removal' : 'Remove book'}
      </button>
      {m.error ? (
        <div className="max-w-64">
          <Notice tone="bad">{m.error}</Notice>
        </div>
      ) : null}
    </span>
  );
}
