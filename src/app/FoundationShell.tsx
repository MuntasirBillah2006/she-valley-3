import {useState, type FormEvent} from 'react';
import {Globe, PackageCheck, ShieldCheck, Sparkles} from 'lucide-react';
import {
  Alert,
  Badge,
  Breadcrumb,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Dropdown,
  EmptyState,
  FormField,
  Input,
  LoadingIndicator,
  Modal,
  RadioGroup,
  ResponsiveContainer,
  Select,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Textarea,
  ToastViewport,
} from '@/src/components';
import {BRAND_CONFIG} from '@/src/config/brand';
import {DOMAIN_MODULE_REGISTRY} from '@/src/features/registry';
import {useLocale} from '@/src/hooks/useLocale';
import {useToast} from '@/src/hooks/useToast';

const HERO_IMAGE_SRC = '/src/assets/images/she_valley_fabric_editorial_1794848670027.jpg';

const PALETTE_SWATCHES = [
  {name: 'Burgundy', hex: BRAND_CONFIG.colors.burgundy, swatchClass: 'bg-brand-burgundy text-brand-ivory-elevated'},
  {name: 'Warm Ivory', hex: BRAND_CONFIG.colors.warmIvory, swatchClass: 'bg-brand-ivory text-brand-charcoal'},
  {name: 'Charcoal', hex: BRAND_CONFIG.colors.charcoal, swatchClass: 'bg-brand-charcoal text-brand-ivory-elevated'},
  {name: 'Muted Rose', hex: BRAND_CONFIG.colors.mutedRose, swatchClass: 'bg-brand-rose text-brand-ivory-elevated'},
  {name: 'Dusty Nude', hex: BRAND_CONFIG.colors.dustyNude, swatchClass: 'bg-brand-nude text-brand-charcoal'},
] as const;

const BD_PHONE_REGEX = /^01[3-9]\d{8}$/;

export function FoundationShell() {
  const {locale, messages, toggleLocale, formatCurrency, formatDate} = useLocale();
  const {pushToast} = useToast();

  const [imageFailed, setImageFailed] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSurfaceMode, setSelectedSurfaceMode] = useState('ivory');

  // Interactive form state for verifying Task 01.13 reusable controls
  const [recipientName, setRecipientName] = useState('');
  const [phone, setPhone] = useState('');
  const [zone, setZone] = useState('dhaka_metro');
  const [notes, setNotes] = useState('');
  const [discreetParcel, setDiscreetParcel] = useState(true);
  const [paymentMode, setPaymentMode] = useState('cod');
  const [formStatus, setFormStatus] = useState<{type: 'error' | 'success'; text: string} | null>(null);

  const handleValidateDemoForm = (event: FormEvent) => {
    event.preventDefault();
    const isNameValid = recipientName.trim().length >= 2;
    const isPhoneValid = BD_PHONE_REGEX.test(phone.trim());

    if (!isNameValid || !isPhoneValid) {
      setFormStatus({type: 'error', text: messages.common.validationError});
      return;
    }

    setFormStatus({type: 'success', text: messages.common.validationSuccess});
    pushToast({
      variant: 'success',
      title: messages.componentsSection.toastTitle,
      message: messages.componentsSection.toastMessage,
    });
  };

  const handleResetDemoForm = () => {
    setRecipientName('');
    setPhone('');
    setZone('dhaka_metro');
    setNotes('');
    setDiscreetParcel(true);
    setPaymentMode('cod');
    setFormStatus(null);
  };

  return (
    <div className="min-h-screen bg-brand-ivory text-brand-charcoal flex flex-col">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="sticky top-0 z-30 border-b border-brand-border bg-brand-ivory/95 backdrop-blur-xs">
        <ResponsiveContainer size="xl" className="flex items-center justify-between gap-8 py-3.5">
          {/* Zone 1: Single-element Brand wordmark */}
          <a
            href="#foundation"
            className="font-display text-2xl font-semibold tracking-wide text-brand-burgundy whitespace-nowrap shrink-0"
          >
            {messages.brand.name}
          </a>

          {/* Zone 2: Clean single-line navigation links */}
          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-brand-charcoal-muted"
          >
            <a href="#foundation" className="hover:text-brand-burgundy transition-colors whitespace-nowrap shrink-0">
              {messages.nav.foundation}
            </a>
            <a href="#tokens" className="hover:text-brand-burgundy transition-colors whitespace-nowrap shrink-0">
              {messages.nav.tokens}
            </a>
            <a href="#components" className="hover:text-brand-burgundy transition-colors whitespace-nowrap shrink-0">
              {messages.nav.components}
            </a>
            <a href="#architecture" className="hover:text-brand-burgundy transition-colors whitespace-nowrap shrink-0">
              {messages.nav.architecture}
            </a>
          </nav>

          {/* Zone 3: Single primary action — bilingual switcher */}
          <div className="flex items-center shrink-0">
            <Button
              variant="secondary"
              size="sm"
              onClick={toggleLocale}
              leftIcon={<Globe className="h-3.5 w-3.5 text-brand-burgundy" aria-hidden="true" />}
              aria-label={locale === 'en' ? 'Switch language to Bengali' : 'Switch language to English'}
            >
              {messages.nav.languageSwitch}
            </Button>
          </div>
        </ResponsiveContainer>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section id="foundation" className="py-10 sm:py-14 lg:py-18 border-b border-brand-border">
          <ResponsiveContainer size="xl">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-stretch">
              <div className="lg:col-span-7 flex flex-col justify-center space-y-6">
                <p className="text-xs font-medium tracking-wider uppercase text-brand-burgundy">
                  {messages.hero.kicker}
                </p>

                <h1 className="font-display text-4xl sm:text-5xl lg:text-[3.25rem] font-semibold leading-[1.12] text-brand-charcoal max-w-2xl">
                  {messages.hero.headline}
                </h1>

                <p className="text-base sm:text-lg text-brand-charcoal-muted max-w-xl leading-relaxed">
                  {messages.hero.subcopy}
                </p>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <Button
                    variant="primary"
                    size="lg"
                    onClick={() => document.getElementById('components')?.scrollIntoView({behavior: 'smooth'})}
                  >
                    {messages.hero.primaryAction}
                  </Button>
                  <Button
                    variant="secondary"
                    size="lg"
                    onClick={() => document.getElementById('architecture')?.scrollIntoView({behavior: 'smooth'})}
                  >
                    {messages.hero.secondaryAction}
                  </Button>
                </div>

                {/* Unboxed metadata strip — Zero-Pill discipline */}
                <div className="pt-4 border-t border-brand-border flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-brand-charcoal-muted">
                  <span>{messages.brand.slogan}</span>
                  <span aria-hidden="true">·</span>
                  <span>{messages.brand.categoryFocus}</span>
                  <span aria-hidden="true">·</span>
                  <span>{messages.brand.discreetNote}</span>
                </div>
              </div>

              <div className="lg:col-span-5">
                <div className="h-full min-h-[280px] rounded-xl border border-brand-border bg-brand-ivory-elevated overflow-hidden shadow-[var(--shadow-soft)]">
                  {!imageFailed ? (
                    <img
                      src={HERO_IMAGE_SRC}
                      alt="Folded warm ivory and dusty rose cotton-modal textiles beside a matte burgundy vessel"
                      referrerPolicy="no-referrer"
                      onError={() => setImageFailed(true)}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full min-h-[280px] flex flex-col items-center justify-center p-8 text-center bg-brand-ivory-muted/60">
                      <Sparkles className="h-7 w-7 text-brand-burgundy mb-3" aria-hidden="true" />
                      <p className="font-display text-2xl font-semibold text-brand-charcoal">
                        {messages.brand.name}
                      </p>
                      <p className="text-xs text-brand-charcoal-muted mt-1">{messages.brand.slogan}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Brand Values Row */}
            <div className="mt-10 pt-8 border-t border-brand-border grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {[
                messages.values.comfort,
                messages.values.confidence,
                messages.values.privacy,
                messages.values.care,
                messages.values.quality,
                messages.values.respect,
              ].map((valueLabel, idx) => (
                <div key={valueLabel} className="space-y-1">
                  <p className="font-mono text-xs text-brand-charcoal-muted tabular-nums">
                    0{idx + 1}.
                  </p>
                  <p className="font-display text-xl font-semibold text-brand-charcoal">{valueLabel}</p>
                </div>
              ))}
            </div>
          </ResponsiveContainer>
        </section>

        {/* Design Tokens & Bilingual Formatting Section */}
        <section id="tokens" className="py-12 sm:py-16 border-b border-brand-border">
          <ResponsiveContainer size="xl" className="space-y-8">
            <div className="max-w-2xl space-y-2">
              <h2 className="font-display text-3xl sm:text-4xl font-semibold text-brand-charcoal">
                {messages.tokensSection.title}
              </h2>
              <p className="text-sm sm:text-base text-brand-charcoal-muted">
                {messages.tokensSection.subtitle}
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Brand Palette */}
              <Card elevated className="lg:col-span-7">
                <CardHeader>
                  <CardTitle>{messages.tokensSection.paletteLabel}</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {PALETTE_SWATCHES.map((swatch) => (
                    <div
                      key={swatch.name}
                      className="rounded-lg border border-brand-border overflow-hidden bg-brand-ivory"
                    >
                      <div className={`h-16 w-full ${swatch.swatchClass}`} />
                      <div className="p-2.5">
                        <p className="text-xs font-semibold text-brand-charcoal">{swatch.name}</p>
                        <p className="font-mono text-[11px] text-brand-charcoal-muted tabular-nums">
                          {swatch.hex}
                        </p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Typography & Locale Formatting */}
              <Card elevated className="lg:col-span-5">
                <CardHeader>
                  <CardTitle>{messages.tokensSection.typeLabel}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-1.5">
                    <p className="font-display text-2xl font-semibold text-brand-charcoal leading-snug">
                      {messages.tokensSection.sampleHeading}
                    </p>
                    <p className="text-sm text-brand-charcoal-muted">
                      {messages.tokensSection.sampleBody}
                    </p>
                  </div>

                  <div className="pt-4 border-t border-brand-border space-y-2">
                    <p className="text-xs font-medium text-brand-charcoal-muted">
                      {messages.tokensSection.currencyLabel}
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-brand-charcoal-muted">
                          {messages.tokensSection.samplePriceLabel}
                        </p>
                        <p className="font-mono text-lg font-semibold text-brand-burgundy tabular-nums">
                          {formatCurrency(1450)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-brand-charcoal-muted">
                          {messages.tokensSection.sampleDateLabel}
                        </p>
                        <p className="text-sm font-medium text-brand-charcoal tabular-nums">
                          {formatDate('2026-11-16T09:00:00Z', 'medium')}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </ResponsiveContainer>
        </section>

        {/* Reusable Foundational Components Section */}
        <section id="components" className="py-12 sm:py-16 border-b border-brand-border">
          <ResponsiveContainer size="xl" className="space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div className="max-w-2xl space-y-2">
                <Breadcrumb
                  items={[
                    {label: messages.brand.name, href: '#foundation'},
                    {label: messages.nav.components},
                  ]}
                />
                <h2 className="font-display text-3xl sm:text-4xl font-semibold text-brand-charcoal">
                  {messages.componentsSection.title}
                </h2>
                <p className="text-sm sm:text-base text-brand-charcoal-muted">
                  {messages.componentsSection.subtitle}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <Dropdown
                  label="Surface Token"
                  selectedId={selectedSurfaceMode}
                  onSelect={setSelectedSurfaceMode}
                  items={[
                    {id: 'ivory', label: 'Warm Ivory (#F7F1EB)'},
                    {id: 'elevated', label: 'Elevated Ivory (#FBF8F5)'},
                    {id: 'nude', label: 'Dusty Nude (#DEC8BF)'},
                  ]}
                />
                <Button variant="secondary" size="md" onClick={() => setIsModalOpen(true)}>
                  {messages.componentsSection.modalButton}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Interactive Form Controls */}
              <Card elevated className="lg:col-span-7">
                <CardHeader>
                  <CardTitle>{messages.componentsSection.formTitle}</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleValidateDemoForm} className="space-y-4" noValidate>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormField
                        id="demo-recipient-name"
                        label={messages.componentsSection.nameLabel}
                        required
                      >
                        <Input
                          id="demo-recipient-name"
                          value={recipientName}
                          onChange={(e) => setRecipientName(e.target.value)}
                          placeholder={messages.componentsSection.namePlaceholder}
                          hasError={formStatus?.type === 'error' && recipientName.trim().length < 2}
                        />
                      </FormField>

                      <FormField
                        id="demo-bd-phone"
                        label={messages.componentsSection.phoneLabel}
                        hint={messages.componentsSection.phoneHint}
                        required
                      >
                        <Input
                          id="demo-bd-phone"
                          type="tel"
                          inputMode="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder={messages.componentsSection.phonePlaceholder}
                          hasError={formStatus?.type === 'error' && !BD_PHONE_REGEX.test(phone.trim())}
                        />
                      </FormField>
                    </div>

                    <FormField
                      id="demo-delivery-zone"
                      label={messages.componentsSection.divisionLabel}
                    >
                      <Select
                        id="demo-delivery-zone"
                        value={zone}
                        onChange={(e) => setZone(e.target.value)}
                        placeholder={messages.componentsSection.divisionPlaceholder}
                        options={[
                          {value: 'dhaka_metro', label: 'Dhaka Metro'},
                          {value: 'sub_dhaka', label: 'Sub-Dhaka (Gazipur / Savar / Narayanganj)'},
                          {value: 'outside_dhaka', label: 'Outside Dhaka (All 64 Districts)'},
                        ]}
                      />
                    </FormField>

                    <FormField
                      id="demo-notes"
                      label={messages.componentsSection.notesLabel}
                    >
                      <Textarea
                        id="demo-notes"
                        rows={3}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder={messages.componentsSection.notesPlaceholder}
                      />
                    </FormField>

                    <Checkbox
                      id="demo-discreet-check"
                      checked={discreetParcel}
                      onChange={(e) => setDiscreetParcel(e.target.checked)}
                      label={messages.componentsSection.discreetCheck}
                    />

                    <RadioGroup
                      name="demo-payment-mode"
                      legend={messages.componentsSection.paymentLabel}
                      value={paymentMode}
                      onChange={setPaymentMode}
                      options={[
                        {value: 'cod', label: messages.componentsSection.paymentCod},
                        {value: 'online', label: messages.componentsSection.paymentOnline, disabled: true},
                      ]}
                    />

                    {formStatus && (
                      <Alert
                        variant={formStatus.type === 'error' ? 'error' : 'success'}
                        title={formStatus.text}
                      />
                    )}

                    <div className="flex flex-wrap items-center gap-3 pt-2">
                      <Button type="submit" variant="primary">
                        {messages.componentsSection.submitButton}
                      </Button>
                      <Button type="button" variant="ghost" onClick={handleResetDemoForm}>
                        {messages.componentsSection.resetButton}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() =>
                          pushToast({
                            variant: 'info',
                            title: messages.componentsSection.toastTitle,
                            message: messages.componentsSection.toastMessage,
                          })
                        }
                      >
                        {messages.componentsSection.toastButton}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>

              {/* System Feedback States */}
              <div className="lg:col-span-5 space-y-5">
                <Card>
                  <CardHeader>
                    <CardTitle>{messages.componentsSection.statesTitle}</CardTitle>
                    <CardDescription>{selectedSurfaceMode.toUpperCase()} · AA Contrast Verified</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Alert variant="info" title={messages.componentsSection.alertTitle}>
                      {messages.componentsSection.alertBody}
                    </Alert>

                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="burgundy">CMD-01 Active</Badge>
                      <Badge variant="success">BDT Ready</Badge>
                      <Badge variant="warning">COD Verified</Badge>
                      <Badge variant="neutral">bn / en</Badge>
                    </div>

                    <div className="space-y-2.5 pt-2">
                      <LoadingIndicator label={messages.componentsSection.loadingLabel} />
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-4 w-1/2" />
                      </div>
                    </div>

                    <EmptyState
                      icon={<PackageCheck className="h-5 w-5" aria-hidden="true" />}
                      title={messages.componentsSection.emptyTitle}
                      description={messages.componentsSection.emptyBody}
                    />
                  </CardContent>
                </Card>
              </div>
            </div>
          </ResponsiveContainer>
        </section>

        {/* Modular Monolith Domain Boundaries */}
        <section id="architecture" className="py-12 sm:py-16">
          <ResponsiveContainer size="xl" className="space-y-6">
            <div className="max-w-2xl space-y-2">
              <h2 className="font-display text-3xl sm:text-4xl font-semibold text-brand-charcoal">
                {messages.architectureSection.title}
              </h2>
              <p className="text-sm sm:text-base text-brand-charcoal-muted">
                {messages.architectureSection.subtitle}
              </p>
            </div>

            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>#</TableHeaderCell>
                  <TableHeaderCell>{messages.architectureSection.moduleLabel}</TableHeaderCell>
                  <TableHeaderCell>{messages.architectureSection.responsibilityLabel}</TableHeaderCell>
                  <TableHeaderCell>{messages.architectureSection.phaseLabel}</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {DOMAIN_MODULE_REGISTRY.map((mod, idx) => (
                  <TableRow key={mod.id}>
                    <TableCell numeric className="text-brand-charcoal-muted w-12">
                      {String(idx + 1).padStart(2, '0')}
                    </TableCell>
                    <TableCell className="font-medium whitespace-nowrap">{mod.name}</TableCell>
                    <TableCell className="text-brand-charcoal-muted">{mod.responsibility}</TableCell>
                    <TableCell>
                      <Badge variant={mod.targetCommand === 'CMD-02' ? 'burgundy' : 'neutral'}>
                        {mod.targetCommand}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ResponsiveContainer>
        </section>
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-brand-border bg-brand-ivory-elevated py-8">
        <ResponsiveContainer
          size="xl"
          className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-brand-charcoal-muted"
        >
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-brand-burgundy shrink-0" aria-hidden="true" />
            <span>{messages.footer.copyright}</span>
          </div>
          <span>{messages.brand.slogan}</span>
        </ResponsiveContainer>
      </footer>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={messages.componentsSection.modalTitle}
        footer={
          <Button variant="primary" size="sm" onClick={() => setIsModalOpen(false)}>
            {messages.componentsSection.modalClose}
          </Button>
        }
      >
        <p className="leading-relaxed text-brand-charcoal-muted">
          {messages.componentsSection.modalBody}
        </p>
      </Modal>

      <ToastViewport dismissLabel={messages.common.dismiss} />
    </div>
  );
}
