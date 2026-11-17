import { useCallback, useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import { Alert } from '@/src/components/feedback/Alert';
import { LoadingIndicator } from '@/src/components/feedback/LoadingIndicator';
import { Badge } from '@/src/components/ui/Badge';
import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import { Checkbox } from '@/src/components/ui/Checkbox';
import { Input } from '@/src/components/ui/Input';
import { Modal } from '@/src/components/ui/Modal';
import { Select } from '@/src/components/ui/Select';
import { Textarea } from '@/src/components/ui/Textarea';
import { useLocale } from '@/src/hooks/useLocale';
import { useToast } from '@/src/hooks/useToast';
import { apiClient } from '@/src/lib/apiClient';

interface MessagingChannel {
  channel: string;
  status: string;
  note: string;
}

interface InboxMessage {
  id: string;
  senderType: string;
  senderName: string | null;
  body: string;
  isInternalNote: boolean;
  createdAt: string;
}

interface InboxConversation {
  id: string;
  channel: string;
  guestName: string | null;
  guestPhone: string | null;
  subject: string | null;
  status: string;
  priority: string;
  category: string;
  lastMessageAt: string;
  messages: InboxMessage[];
}

interface SupportTicketRow {
  id: string;
  ticketNumber: string;
  contactPhone: string | null;
  category: string;
  priority: string;
  status: string;
  resolutionSummary: string | null;
  createdAt: string;
}

const QUICK_REPLIES = [
  'Thank you for reaching SHE-VALLEY! Our parcel ships in 100% plain discreet packaging with zero product details on the label.',
  'Dhaka Metro delivery takes 24–48 hours (৳70); Nationwide takes 2–4 business days (৳130).',
  'For sizing between band sizes, we recommend choosing one band size up for breathable humid-weather comfort.',
];

export function AdminInboxSupportSection() {
  const { messages, formatDate } = useLocale();
  const { showToast } = useToast();

  const [channels, setChannels] = useState<MessagingChannel[]>([]);
  const [conversations, setConversations] = useState<InboxConversation[]>([]);
  const [tickets, setTickets] = useState<SupportTicketRow[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [replyBody, setReplyBody] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadInbox = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<{
        channels: MessagingChannel[];
        conversations: InboxConversation[];
        tickets: SupportTicketRow[];
      }>('/api/v1/admin/inbox');
      setChannels(res.channels ?? []);
      setConversations(res.conversations ?? []);
      setTickets(res.tickets ?? []);
      if (res.conversations?.[0] && !selectedId) {
        setSelectedId(res.conversations[0].id);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : messages.common.errorGeneric);
    } finally {
      setLoading(false);
    }
  }, [messages.common.errorGeneric, selectedId]);

  useEffect(() => {
    void loadInbox();
  }, [loadInbox]);

  if (loading) return <LoadingIndicator label={messages.common.loading} />;
  if (error) return <Alert variant="error">{error}</Alert>;

  const activeConv = conversations.find((c) => c.id === selectedId) ?? conversations[0] ?? null;

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConv || !replyBody.trim()) return;
    try {
      await apiClient.post(`/api/v1/admin/inbox/${activeConv.id}/messages`, {
        body: replyBody.trim(),
        isInternalNote,
      });
      setReplyBody('');
      showToast({ title: isInternalNote ? 'Internal note saved' : 'Reply queued', variant: 'success' });
      await loadInbox();
    } catch (err) {
      showToast({ title: messages.common.errorGeneric, message: err instanceof Error ? err.message : undefined, variant: 'error' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Real Channel Connection Statuses */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        {channels.map((ch) => (
          <Card key={ch.channel} className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-semibold">{ch.channel}</span>
              <Badge variant={ch.status === 'ACTIVE' ? 'success' : 'neutral'}>{ch.status}</Badge>
            </div>
            <p className="text-[11px] text-brand-charcoal-muted">{ch.note}</p>
          </Card>
        ))}
      </div>

      {/* Unified Inbox Split Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <Card padding="none" className="lg:col-span-5 divide-y divide-brand-border max-h-[520px] overflow-y-auto">
          <div className="px-4 py-3 bg-brand-ivory-muted/70 font-semibold text-xs">
            Customer Conversations ({conversations.length})
          </div>
          {conversations.length === 0 ? (
            <p className="p-6 text-xs text-brand-charcoal-muted">
              No inbound inquiries yet. Real contact form inquiries & verified webhook messages appear here.
            </p>
          ) : (
            conversations.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedId(c.id)}
                className={`w-full text-left px-4 py-3 space-y-1 hover:bg-brand-ivory/70 cursor-pointer ${
                  activeConv?.id === c.id ? 'bg-brand-burgundy-soft/30' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-brand-charcoal">{c.guestName || c.guestPhone || 'Guest'}</span>
                  <span className="font-mono text-[11px] text-brand-charcoal-muted">{c.channel}</span>
                </div>
                <p className="text-xs text-brand-charcoal truncate">{c.subject || 'Inquiry'}</p>
                <p className="text-[11px] text-brand-charcoal-muted">
                  {c.status} · {c.priority} · {formatDate(c.lastMessageAt, 'short')}
                </p>
              </button>
            ))
          )}
        </Card>

        <Card className="lg:col-span-7 space-y-4">
          {!activeConv ? (
            <p className="text-xs text-brand-charcoal-muted">Select a conversation to view details and reply.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-border pb-3">
                <div>
                  <h3 className="font-semibold text-sm">{activeConv.subject || activeConv.guestName}</h3>
                  <p className="text-xs text-brand-charcoal-muted">
                    {activeConv.guestName} · {activeConv.guestPhone} · {activeConv.channel}
                  </p>
                </div>
                <Select
                  aria-label="Conversation status"
                  value={activeConv.status}
                  onChange={async (e) => {
                    await apiClient.patch(`/api/v1/admin/inbox/${activeConv.id}`, { status: e.target.value });
                    await loadInbox();
                  }}
                  className="w-40 min-h-8 py-1 text-xs"
                  options={[
                    { value: 'OPEN', label: 'Open' },
                    { value: 'IN_PROGRESS', label: 'In Progress' },
                    { value: 'WAITING_CUSTOMER', label: 'Waiting Customer' },
                    { value: 'RESOLVED', label: 'Resolved' },
                    { value: 'CLOSED', label: 'Closed' },
                  ]}
                />
              </div>

              <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                {activeConv.messages.map((m) => (
                  <div
                    key={m.id}
                    className={`rounded-lg p-3 text-xs space-y-1 border ${
                      m.isInternalNote
                        ? 'bg-status-warning-bg/30 border-brand-border'
                        : m.senderType === 'STAFF'
                          ? 'bg-brand-burgundy-soft/30 border-brand-border ml-6'
                          : 'bg-brand-ivory border-brand-border mr-6'
                    }`}
                  >
                    <div className="flex justify-between text-[11px] text-brand-charcoal-muted">
                      <span className="font-semibold text-brand-charcoal">
                        {m.senderName || m.senderType} {m.isInternalNote ? '(Internal Note)' : ''}
                      </span>
                      <span>{formatDate(m.createdAt, 'short')}</span>
                    </div>
                    <p className="text-brand-charcoal leading-relaxed">{m.body}</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {QUICK_REPLIES.map((qr, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setReplyBody(qr)}
                    className="px-2.5 py-1 rounded-md border border-brand-border bg-brand-ivory text-[11px] hover:bg-brand-ivory-muted cursor-pointer"
                  >
                    Quick Reply {i + 1}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSendReply} className="space-y-2.5">
                <Textarea
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  placeholder="Write customer reply or internal care note..."
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Checkbox
                    id="conv-int"
                    label="Internal Staff Note Only (hidden from customer)"
                    checked={isInternalNote}
                    onChange={(e) => setIsInternalNote(e.target.checked)}
                  />
                  <Button type="submit" size="sm" leftIcon={<Send className="h-3.5 w-3.5" />}>
                    {isInternalNote ? 'Save Note' : 'Send Reply'}
                  </Button>
                </div>
              </form>
            </>
          )}
        </Card>
      </div>

      {/* Support Tickets */}
      <Card padding="none" className="overflow-x-auto">
        <div className="px-4 py-3 border-b border-brand-border">
          <h3 className="text-sm font-semibold">Support Tickets ({tickets.length})</h3>
        </div>
        <table className="w-full text-left text-xs">
          <thead className="bg-brand-ivory-muted border-b border-brand-border text-brand-charcoal-muted">
            <tr>
              <th className="px-4 py-2.5">Ticket #</th>
              <th className="px-4 py-2.5">Category</th>
              <th className="px-4 py-2.5">Priority</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5 text-right">Update</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-border tabular-nums">
            {tickets.map((t) => (
              <tr key={t.id} className="h-10">
                <td className="px-4 py-2 font-mono font-semibold text-brand-burgundy">{t.ticketNumber}</td>
                <td className="px-4 py-2">{t.category}</td>
                <td className="px-4 py-2">{t.priority}</td>
                <td className="px-4 py-2">
                  <Badge variant={t.status === 'RESOLVED' || t.status === 'CLOSED' ? 'success' : 'burgundy'}>
                    {t.status}
                  </Badge>
                </td>
                <td className="px-4 py-2 text-right">
                  <Select
                    aria-label="Update ticket status"
                    value={t.status}
                    onChange={async (e) => {
                      await apiClient.patch(`/api/v1/admin/tickets/${t.id}`, { status: e.target.value });
                      await loadInbox();
                    }}
                    className="inline-block w-36 min-h-8 py-1 text-xs"
                    options={[
                      { value: 'OPEN', label: 'Open' },
                      { value: 'IN_PROGRESS', label: 'In Progress' },
                      { value: 'WAITING_CUSTOMER', label: 'Waiting' },
                      { value: 'RESOLVED', label: 'Resolved' },
                      { value: 'CLOSED', label: 'Closed' },
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

interface CrmCustomerRow {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  ordersCount: number;
  totalSpendBdt: number;
  isRepeatCustomer: boolean;
  computedSegment: string;
  tags: string[];
  openTicketsCount: number;
  notes: string | null;
}

export function AdminCrmSection() {
  const { messages, formatCurrency } = useLocale();
  const { showToast } = useToast();

  const [customers, setCustomers] = useState<CrmCustomerRow[]>([]);
  const [retention, setRetention] = useState({ totalCustomers: 0, repeatCustomers: 0, vipCustomers: 0, retentionRatePercent: 0 });
  const [segmentFilter, setSegmentFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [detailModal, setDetailModal] = useState<{
    customer: CrmCustomerRow;
    orders: { id: string; orderNumber: string; totalBdt: string; status: string }[];
  } | null>(null);
  const [newTag, setNewTag] = useState('');
  const [crmNotes, setCrmNotes] = useState('');

  const loadCrm = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<{ customers: CrmCustomerRow[]; retention: typeof retention }>(
        '/api/v1/admin/crm/customers',
      );
      setCustomers(res.customers ?? []);
      setRetention(res.retention);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : messages.common.errorGeneric);
    } finally {
      setLoading(false);
    }
  }, [messages.common.errorGeneric]);

  useEffect(() => {
    void loadCrm();
  }, [loadCrm]);

  if (loading) return <LoadingIndicator label={messages.common.loading} />;
  if (error) return <Alert variant="error">{error}</Alert>;

  const visibleCustomers = segmentFilter
    ? customers.filter((c) => c.computedSegment === segmentFilter)
    : customers;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 tabular-nums">
        <Card><p className="text-xs text-brand-charcoal-muted">Total Customers</p><p className="text-2xl font-semibold">{retention.totalCustomers}</p></Card>
        <Card><p className="text-xs text-brand-charcoal-muted">Repeat Customers</p><p className="text-2xl font-semibold">{retention.repeatCustomers}</p></Card>
        <Card><p className="text-xs text-brand-charcoal-muted">VIP Segment (৳5k+)</p><p className="text-2xl font-semibold">{retention.vipCustomers}</p></Card>
        <Card><p className="text-xs text-brand-charcoal-muted">Retention Rate</p><p className="text-2xl font-semibold">{retention.retentionRatePercent}%</p></Card>
      </div>

      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-xl font-semibold">Customer Segmentation & Care Directory</h2>
        <Select
          aria-label="Filter CRM segment"
          value={segmentFilter}
          onChange={(e) => setSegmentFilter(e.target.value)}
          className="w-44"
          options={[
            { value: '', label: 'All Segments' },
            { value: 'VIP', label: 'VIP' },
            { value: 'REPEAT', label: 'Repeat' },
            { value: 'FIRST_TIME', label: 'First Time' },
            { value: 'PROSPECT', label: 'Prospect' },
          ]}
        />
      </div>

      <Card padding="none" className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-brand-ivory-muted border-b border-brand-border text-brand-charcoal-muted">
            <tr>
              <th className="px-4 py-2.5">Customer</th>
              <th className="px-4 py-2.5">Segment</th>
              <th className="px-4 py-2.5">Tags</th>
              <th className="px-4 py-2.5 text-right">Orders</th>
              <th className="px-4 py-2.5 text-right">Spend</th>
              <th className="px-4 py-2.5 text-right">Profile</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-border tabular-nums">
            {visibleCustomers.map((c) => (
              <tr key={c.id} className="h-11">
                <td className="px-4 py-2">
                  <p className="font-semibold">{c.fullName}</p>
                  <p className="text-[11px] text-brand-charcoal-muted">{c.phone}</p>
                </td>
                <td className="px-4 py-2">
                  <Badge variant={c.computedSegment === 'VIP' ? 'burgundy' : c.isRepeatCustomer ? 'success' : 'neutral'}>
                    {c.computedSegment}
                  </Badge>
                </td>
                <td className="px-4 py-2 text-[11px] font-mono text-brand-charcoal-muted">
                  {c.tags.length > 0 ? c.tags.join(', ') : '—'}
                </td>
                <td className="px-4 py-2 text-right">{c.ordersCount}</td>
                <td className="px-4 py-2 text-right font-semibold">{formatCurrency(c.totalSpendBdt)}</td>
                <td className="px-4 py-2 text-right">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      const d = await apiClient.get<{ customer: CrmCustomerRow; orders: { id: string; orderNumber: string; totalBdt: string; status: string }[] }>(
                        `/api/v1/admin/crm/customers/${c.id}`,
                      );
                      setDetailModal(d);
                      setCrmNotes(d.customer.notes || '');
                    }}
                  >
                    Open
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Modal
        isOpen={Boolean(detailModal)}
        onClose={() => setDetailModal(null)}
        title={detailModal?.customer.fullName || ''}
        size="md"
      >
        {detailModal && (
          <div className="space-y-4 text-xs">
            <p className="text-brand-charcoal-muted">{detailModal.customer.phone} · {detailModal.customer.email || 'No email'}</p>
            <div className="flex gap-2">
              <Input value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="Add tag (e.g. FIT_ASSISTED)" />
              <Button
                size="sm"
                onClick={async () => {
                  if (!newTag.trim()) return;
                  await apiClient.post(`/api/v1/admin/crm/customers/${detailModal.customer.id}/tags`, { tag: newTag.trim() });
                  setNewTag('');
                  showToast({ title: 'Tag added', variant: 'success' });
                  await loadCrm();
                }}
              >
                Add Tag
              </Button>
            </div>
            <div className="space-y-2">
              <p className="font-semibold">Care & Fit Notes (Private)</p>
              <Textarea value={crmNotes} onChange={(e) => setCrmNotes(e.target.value)} />
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  await apiClient.patch(`/api/v1/admin/crm/customers/${detailModal.customer.id}/notes`, { notes: crmNotes });
                  showToast({ title: 'Customer note saved', variant: 'success' });
                  await loadCrm();
                }}
              >
                Save Notes
              </Button>
            </div>
            <div className="border-t border-brand-border pt-3 space-y-1.5">
              <p className="font-semibold">Order History ({detailModal.orders.length})</p>
              {detailModal.orders.map((o) => (
                <div key={o.id} className="flex justify-between">
                  <span className="font-mono">{o.orderNumber} · {o.status}</span>
                  <span className="tabular-nums font-semibold">{formatCurrency(Number(o.totalBdt))}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export function AdminAutomationLogsSection() {
  const { messages, formatDate } = useLocale();
  const { showToast } = useToast();

  const [jobs, setJobs] = useState<{ id: string; eventType: string; dedupeKey: string; status: string; attempts: number; lastError: string | null; createdAt: string }[]>([]);
  const [registry, setRegistry] = useState<Record<string, { description: string; defaultRequiresApproval: boolean }>>({});
  const [notifLogs, setNotifLogs] = useState<{ id: string; channel: string; templateKey: string; recipient: string; status: string; attemptCount: number; errorMessage: string | null }[]>([]);
  const [marketingCounts, setMarketingCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [aRes, nRes, mRes] = await Promise.all([
        apiClient.get<{ jobs: typeof jobs; registry: typeof registry }>('/api/v1/admin/automation/jobs'),
        apiClient.get<{ logs: typeof notifLogs }>('/api/v1/admin/notifications/logs'),
        apiClient.get<{ countsByEvent: Record<string, number> }>('/api/v1/admin/marketing/analytics'),
      ]);
      setJobs(aRes.jobs ?? []);
      setRegistry(aRes.registry ?? {});
      setNotifLogs(nRes.logs ?? []);
      setMarketingCounts(mRes.countsByEvent ?? {});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  if (loading) return <LoadingIndicator label={messages.common.loading} />;

  return (
    <div className="space-y-6">
      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold">Marketing & Funnel Analytics Events</h2>
          <span className="text-xs text-brand-charcoal-muted">Deduplicated via eventId + consent gate</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 tabular-nums text-xs">
          {['ViewContent', 'Search', 'AddToCart', 'InitiateCheckout', 'Purchase', 'Contact', 'Lead'].map((ev) => (
            <div key={ev} className="rounded-lg border border-brand-border bg-brand-ivory p-3">
              <p className="text-brand-charcoal-muted">{ev}</p>
              <p className="text-lg font-semibold">{marketingCounts[ev] ?? 0}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card padding="none" className="overflow-x-auto">
        <div className="px-4 py-3 border-b border-brand-border flex justify-between items-center">
          <h2 className="font-display text-lg font-semibold">Event-Driven Automation Workflows ({Object.keys(registry).length})</h2>
        </div>
        <table className="w-full text-left text-xs">
          <thead className="bg-brand-ivory-muted border-b border-brand-border text-brand-charcoal-muted">
            <tr>
              <th className="px-4 py-2.5">Workflow Event</th>
              <th className="px-4 py-2.5">Approval Gate</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-border tabular-nums">
            {jobs.slice(0, 20).map((j) => (
              <tr key={j.id} className="h-10">
                <td className="px-4 py-2">
                  <p className="font-mono font-semibold">{j.eventType}</p>
                  <p className="text-[11px] text-brand-charcoal-muted">{j.dedupeKey}</p>
                </td>
                <td className="px-4 py-2">{formatDate(j.createdAt, 'short')}</td>
                <td className="px-4 py-2">
                  <Badge variant={j.status === 'SUCCEEDED' ? 'success' : j.status === 'DEAD_LETTER' || j.status === 'FAILED' ? 'error' : 'warning'}>
                    {j.status}
                  </Badge>
                </td>
                <td className="px-4 py-2 text-right">
                  {j.status !== 'SUCCEEDED' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={async () => {
                        await apiClient.post(`/api/v1/admin/automation/jobs/${j.id}/retry`, {});
                        showToast({ title: 'Automation job executed', variant: 'success' });
                        await loadAll();
                      }}
                    >
                      {j.status === 'WAITING_APPROVAL' ? 'Approve & Run' : 'Retry'}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card padding="none" className="overflow-x-auto">
        <div className="px-4 py-3 border-b border-brand-border">
          <h2 className="font-display text-lg font-semibold">Notification Delivery Logs ({notifLogs.length})</h2>
        </div>
        <table className="w-full text-left text-xs">
          <thead className="bg-brand-ivory-muted border-b border-brand-border text-brand-charcoal-muted">
            <tr>
              <th className="px-4 py-2.5">Channel</th>
              <th className="px-4 py-2.5">Template</th>
              <th className="px-4 py-2.5">Recipient</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-border tabular-nums">
            {notifLogs.slice(0, 20).map((n) => (
              <tr key={n.id} className="h-10">
                <td className="px-4 py-2 font-mono">{n.channel}</td>
                <td className="px-4 py-2">{n.templateKey}</td>
                <td className="px-4 py-2">{n.recipient}</td>
                <td className="px-4 py-2">
                  <Badge variant={n.status === 'SENT' || n.status === 'MOCK_SENT' ? 'success' : n.status === 'FAILED' || n.status === 'DEAD_LETTER' ? 'error' : 'warning'}>
                    {n.status}
                  </Badge>
                </td>
                <td className="px-4 py-2 text-right">
                  {n.status !== 'SENT' && n.status !== 'MOCK_SENT' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={async () => {
                        await apiClient.post(`/api/v1/admin/notifications/${n.id}/retry`, {});
                        await loadAll();
                      }}
                    >
                      Approve / Retry
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
