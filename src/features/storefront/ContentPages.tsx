import { useEffect, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { Alert } from '@/src/components/feedback/Alert';
import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import { FormField } from '@/src/components/ui/FormField';
import { Input } from '@/src/components/ui/Input';
import { Select } from '@/src/components/ui/Select';
import { Textarea } from '@/src/components/ui/Textarea';
import { useAuth } from '@/src/hooks/useAuth';
import { useLocale } from '@/src/hooks/useLocale';
import { useRouter } from '@/src/hooks/useRouter';
import { buildWhatsAppHref, trackMarketingEvent } from '@/src/lib/analytics';
import {
  apiClient,
  type StorefrontBlogPost,
  type StorefrontBootstrapData,
  type StorefrontContentPage,
  type StorefrontFaq,
} from '@/src/lib/apiClient';
import { ProductImage } from './ProductImage';

export function FaqPage({ faqs }: { faqs: StorefrontFaq[] }) {
  const { locale, messages } = useLocale();
  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-12 space-y-8">
      <h1 className="font-display text-4xl font-semibold text-brand-charcoal">{messages.nav.faq}</h1>
      <div className="space-y-4">
        {faqs.map((faq) => (
          <Card key={faq.id} className="space-y-2">
            <p className="text-xs text-brand-burgundy font-medium">{faq.category}</p>
            <h2 className="font-display text-2xl font-semibold text-brand-charcoal">
              {locale === 'bn' ? faq.questionBn : faq.questionEn}
            </h2>
            <p className="text-sm text-brand-charcoal-muted leading-relaxed">
              {locale === 'bn' ? faq.answerBn : faq.answerEn}
            </p>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function JournalListPage({ posts }: { posts: StorefrontBlogPost[] }) {
  const { locale, messages, formatDate } = useLocale();
  const { navigate } = useRouter();
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12 space-y-8">
      <h1 className="font-display text-4xl font-semibold text-brand-charcoal">
        {messages.storefront.journalTitle}
      </h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {posts.map((post) => (
          <Card
            key={post.id}
            padding="none"
            className="overflow-hidden cursor-pointer hover:shadow-[var(--shadow-soft)] transition-shadow"
            onClick={() => navigate(`/journal/${post.slug}`)}
          >
            {post.coverImageUrl && (
              <div className="aspect-[16/9] bg-brand-ivory-muted">
                <ProductImage
                  src={post.coverImageUrl}
                  alt={locale === 'bn' ? post.titleBn : post.titleEn}
                  className="h-full w-full"
                />
              </div>
            )}
            <div className="p-6 space-y-2">
              <p className="text-xs text-brand-charcoal-muted">
                {post.publishedAt ? formatDate(post.publishedAt, 'medium') : ''}
              </p>
              <h2 className="font-display text-2xl font-semibold text-brand-charcoal">
                {locale === 'bn' ? post.titleBn : post.titleEn}
              </h2>
              <p className="text-sm text-brand-charcoal-muted">
                {locale === 'bn' ? post.excerptBn : post.excerptEn}
              </p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function JournalDetailPage({ slug }: { slug: string }) {
  const { locale, messages, formatDate } = useLocale();
  const { navigate } = useRouter();
  const [post, setPost] = useState<StorefrontBlogPost | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    apiClient
      .get<{ post: StorefrontBlogPost }>(`/api/v1/storefront/blog/${slug}`)
      .then((d) => setPost(d.post))
      .catch(() => setError(true));
  }, [slug]);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 space-y-4">
        <Alert variant="warning">{messages.common.noResults}</Alert>
        <Button onClick={() => navigate('/journal')}>{messages.common.back}</Button>
      </div>
    );
  }

  if (!post) return null;

  return (
    <article className="mx-auto max-w-3xl px-4 sm:px-6 py-12 space-y-6">
      <button
        type="button"
        onClick={() => navigate('/journal')}
        className="text-xs font-medium text-brand-burgundy hover:underline cursor-pointer"
      >
        ← {messages.common.back}
      </button>
      <p className="text-xs text-brand-charcoal-muted">
        {post.publishedAt ? formatDate(post.publishedAt, 'long') : ''}
      </p>
      <h1 className="font-display text-4xl font-semibold text-brand-charcoal">
        {locale === 'bn' ? post.titleBn : post.titleEn}
      </h1>
      {post.coverImageUrl && (
        <div className="aspect-[16/9] rounded-2xl overflow-hidden border border-brand-border">
          <ProductImage
            src={post.coverImageUrl}
            alt={locale === 'bn' ? post.titleBn : post.titleEn}
            className="h-full w-full"
          />
        </div>
      )}
      <div className="text-base text-brand-charcoal leading-relaxed whitespace-pre-line">
        {locale === 'bn' ? post.contentBn : post.contentEn}
      </div>
    </article>
  );
}

export function StaticOrPolicyPage({
  slug,
  contactSocial,
}: {
  slug: string;
  contactSocial?: StorefrontBootstrapData['contactSocial'];
}) {
  const { locale, messages } = useLocale();
  const { navigate } = useRouter();
  const { user } = useAuth();
  const [page, setPage] = useState<StorefrontContentPage | null>(null);
  const [unpublished, setUnpublished] = useState(false);

  const [name, setName] = useState(user?.fullName || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [email, setEmail] = useState(user?.email || '');
  const [orderNumber, setOrderNumber] = useState('');
  const [category, setCategory] = useState<'GENERAL' | 'SIZING' | 'ORDER_INQUIRY' | 'COMPLAINT' | 'RETURN_EXCHANGE'>('GENERAL');
  const [subject, setSubject] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [ticketNumber, setTicketNumber] = useState<string | null>(null);

  useEffect(() => {
    setUnpublished(false);
    setPage(null);
    apiClient
      .get<{ page: StorefrontContentPage }>(`/api/v1/storefront/content/${slug}`)
      .then((d) => setPage(d.page))
      .catch(() => setUnpublished(true));
  }, [slug]);

  useEffect(() => {
    if (user) {
      if (!name) setName(user.fullName);
      if (!phone && user.phone) setPhone(user.phone);
      if (!email) setEmail(user.email);
    }
  }, [user, name, phone, email]);

  if (unpublished) {
    return (
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-14 space-y-4">
        <Alert
          variant="info"
          title={
            locale === 'bn'
              ? 'নীতিমালা পর্যালোচনার অধীনে রয়েছে'
              : 'Policy Pending Owner Sign-Off'
          }
        >
          {locale === 'bn'
            ? 'এই নীতিমালাটি এখনও চূড়ান্ত অনুমোদন ও প্রকাশের অপেক্ষায় রয়েছে।'
            : 'This policy page remains unpublished until final owner legal review and approval.'}
        </Alert>
        <Button variant="secondary" onClick={() => navigate('/')}>
          {messages.common.back}
        </Button>
      </div>
    );
  }

  if (!page) return null;

  const whatsappNumber = contactSocial?.whatsappNumber || '01828-298143';
  const messengerUrl = contactSocial?.messengerUrl || 'https://m.me/SheValley';
  const instagramHandle = contactSocial?.instagramHandle || '@she-valley';
  const instagramUrl = contactSocial?.instagramUrl || 'https://instagram.com/she-valley';

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const res = await apiClient.post<{ ticket: { ticketNumber: string } }>('/api/v1/support/contact', {
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || '',
        orderNumber: orderNumber.trim() || undefined,
        category,
        subject: subject.trim(),
        message: messageBody.trim(),
      });
      setTicketNumber(res.ticket.ticketNumber);
      setSubject('');
      setMessageBody('');
      trackMarketingEvent({
        eventName: 'Contact',
        metadata: { category, ticketNumber: res.ticket.ticketNumber },
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : messages.common.errorGeneric);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-12 space-y-8">
      <h1 className="font-display text-4xl font-semibold text-brand-charcoal">
        {locale === 'bn' ? page.titleBn : page.titleEn}
      </h1>
      <Card>
        <p className="text-base text-brand-charcoal leading-relaxed whitespace-pre-line">
          {locale === 'bn' ? page.bodyBn : page.bodyEn}
        </p>
      </Card>

      {slug === 'contact' && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
          <Card className="md:col-span-5 space-y-4">
            <h2 className="font-display text-2xl font-semibold text-brand-charcoal">
              {locale === 'bn' ? 'সরাসরি যোগাযোগ চ্যানেল' : 'Direct Care Channels'}
            </h2>
            <div className="space-y-3 text-sm">
              <a
                href={buildWhatsAppHref(whatsappNumber, 'Hi SHE-VALLEY, I need help with sizing or my order.')}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackMarketingEvent({ eventName: 'Lead', metadata: { channel: 'WHATSAPP' } })}
                className="flex items-center justify-between rounded-lg border border-brand-border bg-brand-ivory p-3 hover:bg-brand-ivory-muted transition-colors"
              >
                <span className="font-medium flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-brand-burgundy" aria-hidden="true" />
                  <span>WhatsApp</span>
                </span>
                <span className="font-mono text-xs text-brand-burgundy">{whatsappNumber}</span>
              </a>

              <a
                href={messengerUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackMarketingEvent({ eventName: 'Lead', metadata: { channel: 'MESSENGER' } })}
                className="flex items-center justify-between rounded-lg border border-brand-border bg-brand-ivory p-3 hover:bg-brand-ivory-muted transition-colors"
              >
                <span className="font-medium">{messages.social.messengerCta}</span>
                <span className="font-mono text-xs text-brand-burgundy">m.me/SheValley</span>
              </a>

              <a
                href={instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between rounded-lg border border-brand-border bg-brand-ivory p-3 hover:bg-brand-ivory-muted transition-colors"
              >
                <span className="font-medium">Instagram</span>
                <span className="font-mono text-xs text-brand-burgundy">{instagramHandle}</span>
              </a>
            </div>
          </Card>

          <Card className="md:col-span-7 space-y-4">
            <div className="space-y-1">
              <h2 className="font-display text-2xl font-semibold text-brand-charcoal">
                {messages.social.contactFormTitle}
              </h2>
              <p className="text-xs text-brand-charcoal-muted">{messages.social.contactFormSubtitle}</p>
            </div>

            {ticketNumber && (
              <Alert variant="success">
                {messages.social.contactSubmitted.replace('{ticketNumber}', ticketNumber)}
              </Alert>
            )}
            {formError && <Alert variant="error">{formError}</Alert>}

            <form onSubmit={handleContactSubmit} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormField id="cnt-name" label={messages.checkout.fullName} required>
                  <Input id="cnt-name" required value={name} onChange={(e) => setName(e.target.value)} />
                </FormField>
                <FormField id="cnt-phone" label={messages.checkout.phone} required>
                  <Input
                    id="cnt-phone"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="01XXXXXXXXX"
                  />
                </FormField>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormField id="cnt-cat" label={messages.social.contactCategory}>
                  <Select
                    id="cnt-cat"
                    value={category}
                    onChange={(e) =>
                      setCategory(
                        e.target.value as 'GENERAL' | 'SIZING' | 'ORDER_INQUIRY' | 'COMPLAINT' | 'RETURN_EXCHANGE',
                      )
                    }
                    options={[
                      { value: 'GENERAL', label: 'General Care' },
                      { value: 'SIZING', label: 'Discreet Sizing Help' },
                      { value: 'ORDER_INQUIRY', label: 'Order / Delivery Inquiry' },
                      { value: 'RETURN_EXCHANGE', label: 'Return / Exchange' },
                      { value: 'COMPLAINT', label: 'Complaint / Feedback' },
                    ]}
                  />
                </FormField>
                <FormField id="cnt-ord" label={messages.social.contactOrderOptional}>
                  <Input
                    id="cnt-ord"
                    value={orderNumber}
                    onChange={(e) => setOrderNumber(e.target.value)}
                    placeholder="SV-2026..."
                  />
                </FormField>
              </div>
              <FormField id="cnt-subj" label={messages.social.contactSubject} required>
                <Input id="cnt-subj" required value={subject} onChange={(e) => setSubject(e.target.value)} />
              </FormField>
              <FormField id="cnt-msg" label={messages.social.contactMessage} required>
                <Textarea
                  id="cnt-msg"
                  required
                  value={messageBody}
                  onChange={(e) => setMessageBody(e.target.value)}
                />
              </FormField>
              <Button type="submit" fullWidth isLoading={submitting}>
                {messages.common.submit}
              </Button>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
