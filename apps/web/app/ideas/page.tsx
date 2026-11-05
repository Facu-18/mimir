import type { Metadata } from 'next';
import { EmptyScreen } from '../../components/shell/empty-screen';

export const metadata: Metadata = { title: 'Ideas' };

export default function IdeasPage() {
  return (
    <EmptyScreen
      title="Ideas"
      message="Your canvases will appear here, free or linked to a project, with previews."
    />
  );
}
