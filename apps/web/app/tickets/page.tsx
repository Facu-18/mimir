import type { Metadata } from 'next';
import { EmptyScreen } from '../../components/shell/empty-screen';

export const metadata: Metadata = { title: 'Tickets' };

export default function TicketsPage() {
  return (
    <EmptyScreen
      title="Tickets"
      message="Your tickets will appear here as a board and as a filterable list."
    />
  );
}
