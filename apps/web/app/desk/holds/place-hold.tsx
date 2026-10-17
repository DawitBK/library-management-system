'use client';

import { useState } from 'react';
import { Field, Modal, useMutation } from '@/components/form';
import { Notice } from '@/components/ui';

interface Option {
  id: string;
  label: string;
}

export function PlaceHold({ members, books }: { members: Option[]; books: Option[] }) {
  const [open, setOpen] = useState(false);
  const [memberId, setMemberId] = useState('');
  const [bookId, setBookId] = useState('');
  const m = useMutation();
  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        Place a hold
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Place a hold">
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await m.run('POST', '/holds', { memberId, bookId });
            if (r.ok) {
              setOpen(false);
              setMemberId('');
              setBookId('');
            }
          }}
        >
          <Field label="Member" error={m.fieldErrors['memberId']}>
            <select
              className="input"
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              required
            >
              <option value="">Choose…</option>
              {members.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Book"
            hint="Only books whose copies are all out can be held"
            error={m.fieldErrors['bookId']}
          >
            <select
              className="input"
              value={bookId}
              onChange={(e) => setBookId(e.target.value)}
              required
            >
              <option value="">Choose…</option>
              {books.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          </Field>
          {m.error ? <Notice tone="bad">{m.error}</Notice> : null}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" disabled={m.busy || !memberId || !bookId}>
              Place hold
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
