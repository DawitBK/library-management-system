'use client';

import { useMutation } from '@/components/form';
import type { Copy } from '@/lib/types';

/** Staff may mark a copy lost, withdrawn or back on the shelf; one on loan can only be returned. */
export function CopyActions({ copy }: { copy: Copy }) {
  const m = useMutation();
  if (copy.status === 'on_loan') return <span className="text-xs text-muted">Return it first</span>;
  const set = (status: 'available' | 'lost' | 'withdrawn') =>
    m.run('PATCH', `/copies/${copy.id}`, { version: copy.version, status });
  return (
    <span className="inline-flex flex-col items-end">
      <span className="inline-flex gap-2">
        {copy.status !== 'available' && copy.status !== 'held' ? (
          <button className="btn" disabled={m.busy} onClick={() => set('available')}>
            Back on shelf
          </button>
        ) : null}
        {copy.status !== 'lost' ? (
          <button className="btn" disabled={m.busy} onClick={() => set('lost')}>
            Mark lost
          </button>
        ) : null}
        {copy.status !== 'withdrawn' ? (
          <button className="btn text-bad" disabled={m.busy} onClick={() => set('withdrawn')}>
            Withdraw
          </button>
        ) : null}
      </span>
      {m.error ? <span className="mt-1 max-w-56 text-xs text-bad">{m.error}</span> : null}
    </span>
  );
}
