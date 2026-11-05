'use client';

import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  Reveal,
  ThemeSwitcher,
  Tooltip,
} from '@mimir/ui';
import { Plus } from 'lucide-react';

/** Temporary component gallery; UI-002 replaces it with the app shell. */
export default function GalleryPage() {
  return (
    <main>
      <Reveal className="mx-auto flex max-w-3xl flex-col gap-6 p-6 sm:p-10">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Mimir</h1>
            <p className="text-sm text-text-muted">
              Component gallery for the visual system.
            </p>
          </div>
          <ThemeSwitcher />
        </header>

        <Card className="flex flex-col gap-4">
          <h2 className="font-medium">Buttons</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Delete</Button>
            <Button disabled>Disabled</Button>
            <Tooltip content="New ticket">
              <Button variant="secondary" size="icon" aria-label="New ticket">
                <Plus aria-hidden className="size-4" />
              </Button>
            </Tooltip>
          </div>
        </Card>

        <Card className="flex flex-col gap-4">
          <h2 className="font-medium">Fields</h2>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">Title</Label>
            <Input id="title" placeholder="Name this ticket" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="key">Project key</Label>
            <Input id="key" defaultValue="not valid" invalid />
            <p className="text-sm text-danger-text">
              Use two to ten capital letters.
            </p>
          </div>
        </Card>

        <Card className="flex flex-col gap-4">
          <h2 className="font-medium">Status</h2>
          <div className="flex flex-wrap gap-2">
            <Badge>Backlog</Badge>
            <Badge variant="accent">In progress</Badge>
            <Badge variant="success">Saved</Badge>
            <Badge variant="warning">Conflict</Badge>
            <Badge variant="danger">Error</Badge>
          </div>
          <p className="text-sm text-text-muted">
            Code uses <code className="text-text">SB-001</code> and stays
            stable.
          </p>
        </Card>

        <Card className="flex flex-col items-start gap-4">
          <h2 className="font-medium">Floating surface</h2>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="secondary">Open dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogTitle>Rename project</DialogTitle>
              <DialogDescription>
                The key stays the same, so ticket codes do not change.
              </DialogDescription>
              <div className="mt-4 flex flex-col gap-1.5">
                <Label htmlFor="project-name">Name</Label>
                <Input id="project-name" defaultValue="Sandbox" />
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <DialogClose asChild>
                  <Button variant="ghost">Cancel</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button>Save</Button>
                </DialogClose>
              </div>
            </DialogContent>
          </Dialog>
        </Card>
      </Reveal>
    </main>
  );
}
