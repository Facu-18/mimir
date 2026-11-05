import type { Metadata } from 'next';
import { EmptyScreen } from '../../components/shell/empty-screen';

export const metadata: Metadata = { title: 'Documents' };

export default function DocumentsPage() {
  return (
    <EmptyScreen
      title="Documents"
      message="Your notes and rich documents will be listed here."
    />
  );
}
