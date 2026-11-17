import {fireEvent, render, screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import {FoundationShell} from '@/src/app/FoundationShell';
import {LocaleProvider} from '@/src/hooks/useLocale';
import {ToastProvider} from '@/src/hooks/useToast';
import {
  Alert,
  Badge,
  Breadcrumb,
  Button,
  Card,
  CardContent,
  CardTitle,
  Checkbox,
  Dropdown,
  EmptyState,
  ErrorBoundary,
  FormField,
  Input,
  LoadingIndicator,
  Modal,
  RadioGroup,
  Select,
  Textarea,
} from '@/src/components';

function ThrowingChild(): never {
  throw new Error('Sensitive internal failure detail');
}

describe('Reusable UI Components & Foundation Shell (Task 01.13 & 01.14)', () => {
  it('renders interactive Button states cleanly', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save Preference</Button>);
    const btn = screen.getByRole('button', {name: 'Save Preference'});
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);

    const {rerender} = render(<Button isLoading>Saving</Button>);
    rerender(<Button isLoading>Saving</Button>);
    expect(screen.getByRole('button', {name: 'Saving'})).toBeDisabled();
  });

  it('renders FormField, Input, Textarea, Select, Checkbox, and RadioGroup', () => {
    const onRadioChange = vi.fn();
    const onCheckChange = vi.fn();

    render(
      <div>
        <FormField id="test-input" label="Customer Name" required error="Name is required">
          <Input id="test-input" hasError defaultValue="" />
        </FormField>
        <Textarea aria-label="Notes" defaultValue="Discreet delivery" />
        <Select
          aria-label="Zone"
          defaultValue="dhaka"
          options={[
            {value: 'dhaka', label: 'Dhaka'},
            {value: 'chattogram', label: 'Chattogram'},
          ]}
        />
        <Checkbox id="chk" label="Plain parcel" checked={true} onChange={onCheckChange} />
        <RadioGroup
          name="pay"
          legend="Payment"
          value="cod"
          onChange={onRadioChange}
          options={[
            {value: 'cod', label: 'Cash on Delivery'},
            {value: 'online', label: 'Online'},
          ]}
        />
      </div>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Name is required');
    expect(screen.getByLabelText(/Customer Name/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Notes')).toHaveValue('Discreet delivery');
    expect(screen.getByLabelText('Zone')).toHaveValue('dhaka');
    fireEvent.click(screen.getByLabelText('Online'));
    expect(onRadioChange).toHaveBeenCalledWith('online');
  });

  it('renders Card, Badge, Modal, Dropdown, Alert, EmptyState, LoadingIndicator, and Breadcrumb', () => {
    const onClose = vi.fn();
    const onSelect = vi.fn();

    render(
      <div>
        <Breadcrumb items={[{label: 'Home', href: '/'}, {label: 'Design System'}]} />
        <Card>
          <CardTitle>Tokens</CardTitle>
          <CardContent>
            <Badge variant="burgundy">CMD-01</Badge>
          </CardContent>
        </Card>
        <Dropdown
          label="Choose"
          items={[{id: 'a', label: 'Option A'}, {id: 'b', label: 'Option B'}]}
          onSelect={onSelect}
        />
        <Alert variant="success" title="Saved">
          Operation completed.
        </Alert>
        <LoadingIndicator label="Loading data" />
        <EmptyState title="Nothing yet" description="Placeholder empty state" />
        <Modal isOpen={true} onClose={onClose} title="Size Guide">
          Modal content
        </Modal>
      </div>,
    );

    expect(screen.getByRole('navigation', {name: 'Breadcrumb'})).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(document, {key: 'Escape'});
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', {name: 'Choose'}));
    fireEvent.click(screen.getByRole('menuitem', {name: 'Option B'}));
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('catches errors in ErrorBoundary without exposing internal error messages', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary fallbackTitle="Safe fallback title">
        <ThrowingChild />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Safe fallback title')).toBeInTheDocument();
    expect(screen.queryByText(/Sensitive internal failure/)).not.toBeInTheDocument();
    spy.mockRestore();
  });

  it('switches FoundationShell between English and Bengali and validates demo form', () => {
    render(
      <LocaleProvider>
        <ToastProvider>
          <FoundationShell />
        </ToastProvider>
      </LocaleProvider>,
    );
    expect(document.documentElement.lang).toBe('en');
    expect(screen.getAllByText('BE COMFORTABLE. BE CONFIDENT.').length).toBeGreaterThanOrEqual(1);

    // Switch to Bengali
    const langBtn = screen.getByRole('button', {name: 'Switch language to Bengali'});
    fireEvent.click(langBtn);
    expect(document.documentElement.lang).toBe('bn');
    expect(screen.getByText('ফেজ ০১ ফাউন্ডেশন ও ডিজাইন সিস্টেম')).toBeInTheDocument();

    // Switch back to English and submit invalid then valid form
    fireEvent.click(screen.getByRole('button', {name: 'Switch language to English'}));
    expect(document.documentElement.lang).toBe('en');

    fireEvent.click(screen.getByRole('button', {name: 'Validate Form State'}));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Please enter a valid recipient name and 11-digit mobile number.',
    );

    fireEvent.change(screen.getByLabelText(/Recipient Name/), {target: {value: 'Nadia Rahman'}});
    fireEvent.change(screen.getByLabelText(/Bangladesh Mobile Number/), {
      target: {value: '01712345678'},
    });
    fireEvent.click(screen.getByRole('button', {name: 'Validate Form State'}));
    expect(screen.getByText('All form constraints passed cleanly.')).toBeInTheDocument();
  });
});
