'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  ['/desk', 'Overview', false],
  ['/desk/circulation', 'Lend and return', false],
  ['/desk/loans', 'Loans', false],
  ['/desk/holds', 'Holds', false],
  ['/desk/fines', 'Fines', false],
  ['/desk/members', 'Members', false],
  ['/desk/books', 'Books', false],
  ['/desk/genres', 'Genres', false],
  ['/desk/staff', 'Staff', true],
  ['/', 'Public catalogue', false],
] as const;

export function DeskNav({ admin }: { admin: boolean }) {
  const pathname = usePathname();
  const items = ITEMS.filter(([, , adminOnly]) => admin || !adminOnly);
  const active = (href: string) =>
    href === '/desk' ? pathname === '/desk' : pathname === href || pathname.startsWith(`${href}/`);
  const best = items
    .filter(([href]) => active(href))
    .sort((a, b) => b[0].length - a[0].length)[0]?.[0];
  return (
    <nav aria-label="Desk">
      <ul className="space-y-0.5">
        {items.map(([href, text]) => (
          <li key={href}>
            <Link
              href={href}
              aria-current={best === href ? 'page' : undefined}
              className={`block rounded-md px-2 py-1.5 text-sm ${
                best === href ? 'bg-brand/10 font-medium text-brand' : 'hover:bg-surface'
              }`}
            >
              {text}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
