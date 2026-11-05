import type { Metadata } from 'next';
import { EmptyScreen } from '../components/shell/empty-screen';

export const metadata: Metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <EmptyScreen
      title="Page not found"
      message="This page does not exist. Use the sidebar to go back to your work."
    />
  );
}
