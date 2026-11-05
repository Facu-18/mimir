import type { Metadata } from 'next';
import { EmptyScreen } from '../../components/shell/empty-screen';

export const metadata: Metadata = { title: 'Projects' };

export default function ProjectsPage() {
  return (
    <EmptyScreen
      title="Projects"
      message="Your projects will be listed here, with search, favorites and the archive."
    />
  );
}
