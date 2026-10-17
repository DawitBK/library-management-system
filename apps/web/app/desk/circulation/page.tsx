import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui';
import { CirculationDesk } from './desk';

export const metadata: Metadata = { title: 'Lend and return', robots: { index: false } };

export default function CirculationPage() {
  return (
    <>
      <PageHeader
        title="Lend and return"
        subtitle="Scan a card, scan a book. Returns need no member."
      />
      <CirculationDesk />
    </>
  );
}
