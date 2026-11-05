import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Badge } from './badge';
import { Button } from './button';
import { Card } from './card';
import { ConfirmDialog } from './confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from './dialog';
import { Input } from './input';
import { Label } from './label';

describe('Button', () => {
  it('runs on click and on keyboard', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');

    expect(onClick).toHaveBeenCalledTimes(3);
  });

  it('defaults to type button so it never submits a form by accident', () => {
    render(<Button>Save</Button>);

    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('does not run while disabled', async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Save
      </Button>,
    );

    await userEvent.click(screen.getByRole('button'));

    expect(onClick).not.toHaveBeenCalled();
  });

  it('applies the requested variant, keeping caller classes', () => {
    render(
      <Button variant="danger" className="mt-2">
        Delete
      </Button>,
    );

    expect(screen.getByRole('button')).toHaveClass('bg-danger', 'mt-2');
  });
});

describe('Input and Label', () => {
  it('connects by label and marks invalid fields', async () => {
    render(
      <>
        <Label htmlFor="name">Name</Label>
        <Input id="name" invalid />
      </>,
    );

    const input = screen.getByLabelText('Name');
    await userEvent.type(input, 'Mimir');

    expect(input).toHaveValue('Mimir');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('Badge and Card', () => {
  it('renders content with its variant', () => {
    render(
      <Card>
        <Badge variant="success">Done</Badge>
      </Card>,
    );

    expect(screen.getByText('Done')).toHaveClass('text-success-text');
  });
});

describe('ConfirmDialog', () => {
  const setup = () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Discard changes?"
        description="Your edits will be lost."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    return { onConfirm, onCancel };
  };

  it('returns focus to where it was when it closes', async () => {
    function Example() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <Input aria-label="Field" onKeyDown={() => setOpen(true)} />
          <ConfirmDialog
            open={open}
            title="Discard changes?"
            description="Your edits will be lost."
            confirmLabel="Discard"
            cancelLabel="Keep editing"
            onConfirm={() => setOpen(false)}
            onCancel={() => setOpen(false)}
          />
        </>
      );
    }
    render(<Example />);
    const field = screen.getByLabelText('Field');
    field.focus();

    await userEvent.keyboard('a');
    expect(screen.getByRole('button', { name: 'Keep editing' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(field).toHaveFocus();
  });

  it('starts on the safe choice', () => {
    setup();

    expect(
      screen.getByRole('alertdialog', { name: 'Discard changes?' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Keep editing' })).toHaveFocus();
  });

  it('cancels with Escape and confirms only on request', async () => {
    const { onConfirm, onCancel } = setup();

    await userEvent.keyboard('{Escape}');

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('confirms with its button', async () => {
    const { onConfirm } = setup();

    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));

    expect(onConfirm).toHaveBeenCalledOnce();
  });
});

describe('Dialog', () => {
  it('opens by keyboard, traps focus and returns it on Escape', async () => {
    render(
      <Dialog>
        <DialogTrigger asChild>
          <Button>Open</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogTitle>Rename</DialogTitle>
          <DialogDescription>Choose a new name.</DialogDescription>
          <Input aria-label="New name" />
        </DialogContent>
      </Dialog>,
    );

    await userEvent.tab();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('dialog', { name: 'Rename' })).toBeVisible();
    expect(screen.getByRole('dialog')).toContainElement(
      document.activeElement as HTMLElement,
    );

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus();
  });
});
