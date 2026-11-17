import { useState } from 'react';
import {
  ArrowLeft,
  ClipboardList,
  CreditCard,
  FileText,
  LayoutDashboard,
  MessageSquare,
  Package,
  Shield,
  ShoppingBag,
  Truck,
  UserCheck,
  Users,
  Warehouse,
  Zap,
} from 'lucide-react';
import { Alert } from '@/src/components/feedback/Alert';
import { LoadingIndicator } from '@/src/components/feedback/LoadingIndicator';
import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import { FormField } from '@/src/components/ui/FormField';
import { Input } from '@/src/components/ui/Input';
import { useAuth } from '@/src/hooks/useAuth';
import { useLocale } from '@/src/hooks/useLocale';
import { useRouter } from '@/src/hooks/useRouter';
import { apiClient } from '@/src/lib/apiClient';
import { AdminInventorySection, AdminProductsSection } from './AdminCatalogInventorySection';
import {
  AdminAutomationLogsSection,
  AdminCrmSection,
  AdminInboxSupportSection,
} from './AdminCrmInboxAutomationSection';
import {
  AdminCouriersSection,
  AdminPaymentsFinanceSection,
} from './AdminFinanceCourierSection';
import {
  AdminAuditLogsSection,
  AdminContentSettingsSection,
  AdminOrdersSection,
  AdminStaffSection,
} from './AdminOrdersStaffContentSection';
import { AdminOverviewSection } from './AdminOverviewSection';

type AdminTab =
  | 'overview'
  | 'products'
  | 'inventory'
  | 'orders'
  | 'paymentsFinance'
  | 'couriers'
  | 'inboxSupport'
  | 'crm'
  | 'automationLogs'
  | 'staff'
  | 'content'
  | 'audit';

export function AdminPortal() {
  const { locale, messages } = useLocale();
  const { navigate, switchLanguageAndRoute } = useRouter();
  const { user, isLoading, isStaff, login, verifyMfa, logout } = useAuth();

  const [tab, setTab] = useState<AdminTab>('overview');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<{
    orders: { id: string; orderNumber: string; guestName: string }[];
    products: { productId: string; name: string }[];
  } | null>(null);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-ivory">
        <LoadingIndicator label={messages.common.loading} />
      </div>
    );
  }

  // Staff Sign-In Gate
  if (!user || !isStaff) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-ivory px-4">
        <Card className="w-full max-w-md space-y-6">
          <div className="space-y-1 text-center">
            <p className="text-xs font-medium tracking-widest uppercase text-brand-burgundy">SHE-VALLEY</p>
            <h1 className="font-display text-3xl font-semibold">{messages.admin.title}</h1>
          </div>

          {user && !isStaff && (
            <Alert variant="warning">
              Signed in as {user.email}. Staff privileges are required for the Admin Console.
            </Alert>
          )}
          {authError && <Alert variant="error">{authError}</Alert>}

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setAuthError(null);
              setAuthLoading(true);
              try {
                await login(identifier.trim(), password);
              } catch (err) {
                setAuthError(err instanceof Error ? err.message : messages.common.errorGeneric);
              } finally {
                setAuthLoading(false);
              }
            }}
            className="space-y-4"
          >
            <FormField id="adm-id" label="Staff Email" required>
              <Input
                id="adm-id"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="staff@she-valley.com"
              />
            </FormField>
            <FormField id="adm-pw" label="Password" required>
              <Input
                id="adm-pw"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </FormField>
            <Button type="submit" fullWidth isLoading={authLoading}>
              {messages.account.signInBtn}
            </Button>
          </form>

          <div className="text-center">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="text-xs text-brand-burgundy hover:underline cursor-pointer"
            >
              ← {messages.admin.backToStore}
            </button>
          </div>
        </Card>
      </div>
    );
  }

  // Privileged MFA Verification Gate
  if (user.mfaEnabled && !user.mfaVerified) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-ivory px-4">
        <Card className="w-full max-w-md space-y-5">
          <div className="space-y-1 text-center">
            <Shield className="h-8 w-8 text-brand-burgundy mx-auto" />
            <h1 className="font-display text-3xl font-semibold">{messages.admin.mfaTitle}</h1>
            <p className="text-sm text-brand-charcoal-muted">{messages.admin.mfaSubtitle}</p>
          </div>
          {authError && <Alert variant="error">{authError}</Alert>}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setAuthError(null);
              setAuthLoading(true);
              try {
                await verifyMfa(mfaCode.trim());
              } catch (err) {
                setAuthError(err instanceof Error ? err.message : messages.common.errorGeneric);
              } finally {
                setAuthLoading(false);
              }
            }}
            className="space-y-4"
          >
            <FormField id="adm-mfa" label="MFA Passcode" required>
              <Input
                id="adm-mfa"
                type="password"
                required
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                placeholder="••••••"
              />
            </FormField>
            <Button type="submit" fullWidth isLoading={authLoading}>
              {messages.admin.verifyMfa}
            </Button>
          </form>
        </Card>
      </div>
    );
  }

  const navItems: { id: AdminTab; label: string; icon: typeof LayoutDashboard }[] = [
    { id: 'overview', label: messages.admin.overview, icon: LayoutDashboard },
    { id: 'orders', label: messages.admin.orders, icon: Package },
    { id: 'paymentsFinance', label: messages.admin.paymentsFinance, icon: CreditCard },
    { id: 'couriers', label: messages.admin.couriers, icon: Truck },
    { id: 'inboxSupport', label: messages.admin.inboxSupport, icon: MessageSquare },
    { id: 'crm', label: messages.admin.crm, icon: UserCheck },
    { id: 'products', label: messages.admin.products, icon: ShoppingBag },
    { id: 'inventory', label: messages.admin.inventory, icon: Warehouse },
    { id: 'automationLogs', label: messages.admin.automationLogs, icon: Zap },
    { id: 'staff', label: messages.admin.staff, icon: Users },
    { id: 'content', label: messages.admin.content, icon: FileText },
    { id: 'audit', label: messages.admin.auditLogs, icon: ClipboardList },
  ];

  const handleGlobalSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTerm.trim()) {
      setSearchResults(null);
      return;
    }
    const res = await apiClient.get<NonNullable<typeof searchResults>>(
      `/api/v1/admin/search?q=${encodeURIComponent(searchTerm.trim())}`,
    );
    setSearchResults(res);
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-brand-ivory text-brand-charcoal">
      {/* 250px Sidebar Navigation */}
      <aside className="w-full lg:w-64 bg-brand-ivory-elevated border-b lg:border-b-0 lg:border-r border-brand-border flex flex-col justify-between shrink-0">
        <div className="p-5 space-y-6">
          <div className="space-y-1">
            <p className="font-display text-2xl font-semibold tracking-wider text-brand-burgundy">
              SHE-VALLEY
            </p>
            <p className="text-xs text-brand-charcoal-muted">
              {user.fullName} · {user.roles[0]}
            </p>
          </div>

          <nav className="flex lg:flex-col gap-1 overflow-x-auto pb-1 lg:pb-0">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`inline-flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    active
                      ? 'bg-brand-burgundy text-brand-ivory-elevated'
                      : 'text-brand-charcoal hover:bg-brand-ivory-muted'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-5 border-t border-brand-border hidden lg:flex flex-col gap-2">
          <Button variant="secondary" size="sm" leftIcon={<ArrowLeft className="h-3.5 w-3.5" />} onClick={() => navigate('/')}>
            {messages.admin.backToStore}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await logout();
              navigate('/');
            }}
          >
            {messages.account.signOut}
          </Button>
        </div>
      </aside>

      {/* Main Operations Canvas */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-brand-ivory-elevated border-b border-brand-border px-6 h-16 flex items-center justify-between gap-4">
          <div className="text-sm font-medium text-brand-charcoal whitespace-nowrap">
            Admin / <span className="text-brand-burgundy">{navItems.find((n) => n.id === tab)?.label}</span>
          </div>

          <div className="flex items-center gap-3">
            <form onSubmit={handleGlobalSearch} className="hidden sm:flex items-center gap-2">
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search order #, phone, SKU..."
                className="w-56 min-h-9 py-1.5 text-xs"
              />
            </form>
            <button
              type="button"
              onClick={() => switchLanguageAndRoute()}
              className="min-h-9 px-2.5 rounded-lg border border-brand-border text-xs font-medium hover:bg-brand-ivory-muted cursor-pointer"
            >
              {locale === 'en' ? 'বাংলা' : 'English'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="lg:hidden text-xs font-medium text-brand-burgundy hover:underline cursor-pointer"
            >
              Store
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
          {searchResults && (
            <Card padding="sm" className="flex items-center justify-between gap-4 text-xs">
              <div>
                Search hits: {searchResults.orders.length} orders, {searchResults.products.length} products
              </div>
              <Button size="sm" variant="ghost" onClick={() => setSearchResults(null)}>
                {messages.common.close}
              </Button>
            </Card>
          )}

          {tab === 'overview' && <AdminOverviewSection onNavigateTab={(t) => setTab(t as AdminTab)} />}
          {tab === 'products' && <AdminProductsSection />}
          {tab === 'inventory' && <AdminInventorySection />}
          {tab === 'orders' && <AdminOrdersSection />}
          {tab === 'paymentsFinance' && <AdminPaymentsFinanceSection />}
          {tab === 'couriers' && <AdminCouriersSection />}
          {tab === 'inboxSupport' && <AdminInboxSupportSection />}
          {tab === 'crm' && <AdminCrmSection />}
          {tab === 'automationLogs' && <AdminAutomationLogsSection />}
          {tab === 'staff' && <AdminStaffSection />}
          {tab === 'content' && <AdminContentSettingsSection />}
          {tab === 'audit' && <AdminAuditLogsSection />}
        </main>
      </div>
    </div>
  );
}
