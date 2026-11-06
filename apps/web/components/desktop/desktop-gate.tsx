'use client';

import { Button, Card, Input, Label } from '@mimir/ui';
import { LoaderCircle } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import {
  backend,
  isDesktop,
  type BackendStatus,
} from '../../features/desktop/backend';

const POLL_STARTING_MS = 500;
/** A local call is cheap, and a stopped API should show within a second. */
const POLL_READY_MS = 1000;
const NO_ANSWER: BackendStatus = {
  kind: 'failed',
  message: 'The desktop app did not answer.',
};

const sameStatus = (a: BackendStatus | null, b: BackendStatus) =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * In the desktop app, holds the screens back until the local API is ready.
 * Once the app has been shown, a later failure only adds a banner, so the
 * page and its unsaved edits stay. In a browser it renders the app directly.
 */
export function DesktopGate({ children }: { children: ReactNode }) {
  const [desktop, setDesktop] = useState(false);
  const [status, setStatus] = useState<BackendStatus | null>(null);
  const [wasReady, setWasReady] = useState(false);
  const [editing, setEditing] = useState(false);
  const pollNow = useRef<() => void>(() => {});
  const windowShown = useRef(false);

  useEffect(() => {
    if (!isDesktop()) return;
    setDesktop(true);
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      clearTimeout(timer);
      const next = await backend.status().catch(() => NO_ANSWER);
      if (stopped) return;
      setStatus((current) => (sameStatus(current, next) ? current : next));
      if (next.kind === 'ready') setWasReady(true);
      timer = setTimeout(
        poll,
        next.kind === 'ready' ? POLL_READY_MS : POLL_STARTING_MS,
      );
    };
    pollNow.current = () => void poll();
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (status === null || windowShown.current) return;
    windowShown.current = true;
    void backend.showWindow().catch(() => {});
  }, [status]);

  const restart = useCallback((action: () => Promise<void>) => {
    return action().then(() => {
      setEditing(false);
      setStatus({ kind: 'starting' });
      pollNow.current();
    });
  }, []);

  const retry = () => void restart(backend.retry).catch(() => {});

  // The app stays mounted through any later failure, unsaved edits included.
  if (!desktop || status?.kind === 'ready' || (wasReady && status)) {
    return (
      <>
        {children}
        {desktop && status && <ApiBanner status={status} onRetry={retry} />}
      </>
    );
  }

  if (status === null || status.kind === 'starting') return <StartingScreen />;
  if (status.kind === 'needsDatabase' || editing) {
    return (
      <DatabaseScreen
        message={status.kind === 'needsDatabase' ? status.message : null}
        onSave={(url) => restart(() => backend.saveDatabaseUrl(url))}
      />
    );
  }
  return (
    <FailureScreen
      message={status.message}
      onRetry={retry}
      onChangeConnection={() => setEditing(true)}
    />
  );
}

function GateLayout({ children }: { children: ReactNode }) {
  return (
    <main
      data-desktop-gate
      className="grid min-h-dvh place-items-center bg-bg p-4 text-text"
    >
      {children}
    </main>
  );
}

function StartingScreen() {
  return (
    <GateLayout>
      <h1 className="sr-only">Mimir</h1>
      <div role="status" className="flex items-center gap-3 text-text-muted">
        <LoaderCircle aria-hidden className="size-5 animate-spin" />
        Starting Mimir…
      </div>
    </GateLayout>
  );
}

function DatabaseScreen({
  message,
  onSave,
}: {
  message: string | null;
  onSave: (url: string) => Promise<void>;
}) {
  const fieldId = useId();
  const helpId = useId();
  const errorId = useId();
  const field = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const shown = error ?? message;

  useEffect(() => {
    field.current?.focus();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = url.trim();
    if (!value || saving) return;
    setSaving(true);
    try {
      await onSave(value);
    } catch (reason) {
      setError(typeof reason === 'string' ? reason : 'Could not save it.');
      setSaving(false);
      field.current?.focus();
    }
  }

  return (
    <GateLayout>
      <Card className="flex w-full max-w-md flex-col gap-4 p-6">
        <h1 className="text-lg font-semibold">Connect to PostgreSQL</h1>
        <p className="text-sm text-text-muted">
          Mimir needs PostgreSQL to store your work. Install it, or run it with
          Docker, then enter its connection URL.
        </p>
        <form className="flex flex-col gap-2" onSubmit={submit} noValidate>
          <Label htmlFor={fieldId}>Connection URL</Label>
          <Input
            id={fieldId}
            ref={field}
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="postgresql://user:password@localhost:5432/mimir"
            autoComplete="off"
            spellCheck={false}
            invalid={error !== null}
            aria-describedby={shown ? `${errorId} ${helpId}` : helpId}
          />
          <p id={helpId} className="text-xs text-text-muted">
            The database is created if it does not exist. The URL is saved on
            this computer.
          </p>
          {shown && (
            <p id={errorId} role="alert" className="text-sm text-danger-text">
              {shown}
            </p>
          )}
          <Button type="submit" className="mt-2 self-end" disabled={saving}>
            Connect
          </Button>
        </form>
      </Card>
    </GateLayout>
  );
}

function FailureScreen({
  message,
  onRetry,
  onChangeConnection,
}: {
  message: string;
  onRetry: () => void;
  onChangeConnection: () => void;
}) {
  return (
    <GateLayout>
      <Card className="flex w-full max-w-md flex-col gap-4 p-6">
        <h1 className="text-lg font-semibold">Mimir could not start</h1>
        <p role="alert" className="text-sm text-danger-text">
          {message}
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onChangeConnection}>
            Change database connection
          </Button>
          <Button onClick={onRetry}>Try again</Button>
        </div>
      </Card>
    </GateLayout>
  );
}

function ApiBanner({
  status,
  onRetry,
}: {
  status: BackendStatus;
  onRetry: () => void;
}) {
  const className =
    'glass fixed bottom-4 left-1/2 z-50 flex w-[min(32rem,calc(100%-2rem))] -translate-x-1/2 items-center gap-3 rounded-lg p-3 text-sm';

  if (status.kind === 'ready') return null;
  if (status.kind === 'starting') {
    return (
      <div role="status" className={className}>
        <LoaderCircle aria-hidden className="size-4 animate-spin" />
        Reconnecting to the local API…
      </div>
    );
  }
  const message =
    status.kind === 'failed'
      ? status.message
      : (status.message ?? 'The database is not available.');
  return (
    <div role="alert" className={className}>
      <span className="flex-1">{message}</span>
      <Button size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
