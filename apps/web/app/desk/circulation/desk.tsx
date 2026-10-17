'use client';

import { useCallback, useState } from 'react';
import { Badge, Notice } from '@/components/ui';
import { call, newIdempotencyKey } from '@/lib/client-api';
import { formatDate, formatMoney } from '@/lib/format';
import type { Fine, Hold, Loan, Member, MemberDetail, Page } from '@/lib/types';

interface Entry {
  id: number;
  tone: 'good' | 'bad' | 'info';
  text: string;
}

let nextId = 1;

export function CirculationDesk() {
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<Member[]>([]);
  const [member, setMember] = useState<MemberDetail | null>(null);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [ready, setReady] = useState<Hold[]>([]);
  const [lendCode, setLendCode] = useState('');
  const [returnCode, setReturnCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<Entry[]>([]);

  const say = useCallback((tone: Entry['tone'], text: string) => {
    setLog((l) => [{ id: nextId++, tone, text }, ...l].slice(0, 8));
  }, []);

  const loadMember = useCallback(async (id: string) => {
    const [detail, open, holds] = await Promise.all([
      call<MemberDetail>('GET', `/members/${id}`),
      call<Page<Loan>>('GET', `/loans?memberId=${id}&status=open&limit=50`),
      call<Page<Hold>>('GET', `/holds?memberId=${id}&status=ready&limit=20`),
    ]);
    if (detail.ok && detail.data) setMember(detail.data);
    setLoans(open.data?.items ?? []);
    setReady(holds.data?.items ?? []);
  }, []);

  async function findMember() {
    const q = query.trim();
    if (!q) return;
    const r = await call<Page<Member>>('GET', `/members?q=${encodeURIComponent(q)}&limit=8`);
    const items = r.data?.items ?? [];
    const exact = items.find((m) => m.cardNumber.toLowerCase() === q.toLowerCase());
    const pick = exact ?? (items.length === 1 ? items[0] : undefined);
    if (pick) {
      setMatches([]);
      setQuery('');
      await loadMember(pick.id);
    } else {
      setMatches(items);
      if (items.length === 0) say('bad', `No member matches “${q}”.`);
    }
  }

  async function lend() {
    const code = lendCode.trim();
    if (!member || !code) return;
    setBusy(true);
    const r = await call<Loan>(
      'POST',
      '/loans',
      { memberId: member.id, barcode: code },
      { 'idempotency-key': newIdempotencyKey() },
    );
    setBusy(false);
    setLendCode('');
    if (r.ok && r.data) {
      say(
        'good',
        `Lent “${r.data.bookTitle}” (${r.data.barcode}) to ${member.name}, due ${formatDate(r.data.dueAt)}.`,
      );
      await loadMember(member.id);
    } else {
      say('bad', r.message ?? 'The loan could not be made.');
    }
  }

  async function giveBack(code: string) {
    const found = await call<Page<Loan>>(
      'GET',
      `/loans?barcode=${encodeURIComponent(code)}&status=open&limit=1`,
    );
    const loan = found.data?.items[0];
    if (!loan) return say('bad', `No open loan for ${code}.`);
    const r = await call<{ loan: Loan; fine: Fine | null }>('POST', `/loans/${loan.id}/return`, {});
    if (!r.ok || !r.data) return say('bad', r.message ?? 'The return failed.');
    let text = `Returned “${loan.bookTitle}” (${code}) from ${loan.memberName}.`;
    if (r.data.fine) text += ` Fine charged: ${formatMoney(r.data.fine.amountMinor)}.`;
    say(r.data.fine ? 'info' : 'good', text);
    // A returned copy may now be set aside for the next member in the queue.
    const holds = await call<Page<Hold>>('GET', '/holds?status=ready&limit=50');
    const set = holds.data?.items.find((h) => h.barcode === code);
    if (set)
      say(
        'info',
        `Set this copy aside at the desk for ${set.memberName} (until ${formatDate(set.expiresAt)}).`,
      );
    if (member) await loadMember(member.id);
  }

  async function renew(loan: Loan) {
    const r = await call<Loan>('POST', `/loans/${loan.id}/renew`, {});
    if (r.ok && r.data)
      say('good', `Renewed “${loan.bookTitle}”, now due ${formatDate(r.data.dueAt)}.`);
    else say('bad', r.message ?? 'Could not renew.');
    if (member) await loadMember(member.id);
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section aria-label="Member and lending" className="space-y-3">
        <h2 className="text-sm font-semibold">1. Member</h2>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void findMember();
          }}
        >
          <input
            className="input"
            placeholder="Scan the card or type a name"
            aria-label="Find a member"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <button className="btn btn-primary">Find</button>
        </form>
        {matches.length > 0 ? (
          <ul className="card divide-y divide-line">
            {matches.map((m) => (
              <li key={m.id}>
                <button
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-surface"
                  onClick={async () => {
                    setMatches([]);
                    setQuery('');
                    await loadMember(m.id);
                  }}
                >
                  <span>{m.name}</span>
                  <span className="text-muted">{m.cardNumber}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {member ? (
          <div className="card space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-semibold">{member.name}</div>
                <div className="text-xs text-muted">
                  {member.cardNumber} · {member.email}
                </div>
              </div>
              {member.status === 'suspended' ? (
                <Badge tone="bad">Suspended</Badge>
              ) : (
                <Badge tone="good">Active</Badge>
              )}
            </div>
            <div className="flex gap-4 text-sm">
              <span>{member.openLoans} on loan</span>
              <span className={member.unpaidFinesMinor > 0 ? 'text-bad' : 'text-muted'}>
                {member.unpaidFinesMinor > 0
                  ? `Owes ${formatMoney(member.unpaidFinesMinor)}`
                  : 'No fines'}
              </span>
            </div>
            {ready.length > 0 ? (
              <Notice tone="info">
                Reserved and waiting for pickup:{' '}
                {ready.map((h) => `“${h.bookTitle}” (${h.barcode})`).join(', ')}
              </Notice>
            ) : null}
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void lend();
              }}
            >
              <input
                className="input"
                placeholder="Scan the book's barcode to lend"
                aria-label="Barcode to lend"
                value={lendCode}
                onChange={(e) => setLendCode(e.target.value)}
              />
              <button className="btn btn-primary" disabled={busy || member.status !== 'active'}>
                Lend
              </button>
            </form>
            {loans.length > 0 ? (
              <ul className="divide-y divide-line text-sm">
                {loans.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div>
                      <div className="font-medium">{l.bookTitle}</div>
                      <div className="text-xs text-muted">
                        {l.barcode} · due {formatDate(l.dueAt)}
                        {l.overdue ? (
                          <span className="text-bad"> · {l.daysOverdue} days late</span>
                        ) : null}
                        {l.renewals > 0 ? ` · renewed ${l.renewals}×` : ''}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button className="btn" disabled={l.overdue} onClick={() => renew(l)}>
                        Renew
                      </button>
                      <button className="btn" onClick={() => giveBack(l.barcode)}>
                        Return
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No books on loan.</p>
            )}
          </div>
        ) : null}
      </section>

      <section aria-label="Returns and activity" className="space-y-3">
        <h2 className="text-sm font-semibold">2. Take a book back</h2>
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const code = returnCode.trim();
            if (!code) return;
            setReturnCode('');
            await giveBack(code);
          }}
        >
          <input
            className="input"
            placeholder="Scan the barcode to return (no member needed)"
            aria-label="Barcode to return"
            value={returnCode}
            onChange={(e) => setReturnCode(e.target.value)}
          />
          <button className="btn btn-primary">Return</button>
        </form>
        <h2 className="pt-2 text-sm font-semibold">Just now</h2>
        {log.length === 0 ? (
          <p className="text-sm text-muted">Nothing yet. What you do here appears in this list.</p>
        ) : (
          <ul className="space-y-2" aria-live="polite">
            {log.map((e) => (
              <li key={e.id}>
                <Notice tone={e.tone === 'bad' ? 'bad' : e.tone === 'good' ? 'good' : 'info'}>
                  {e.text}
                </Notice>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
