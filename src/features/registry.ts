import type {DomainModuleDescriptor} from '@/src/types';

/**
 * Modular Monolith Domain Registry (Task 01.05 & 01.09).
 * Enforces explicit module boundaries before business logic is implemented in Commands 02-04.
 */
export const DOMAIN_MODULE_REGISTRY: readonly DomainModuleDescriptor[] = [
  {id: 'auth', name: 'Authentication', responsibility: 'Session issuance, OTP/password auth, token lifecycle', targetCommand: 'CMD-02'},
  {id: 'users', name: 'Users', responsibility: 'Account identities and staff profiles', targetCommand: 'CMD-02'},
  {id: 'roles', name: 'Roles', responsibility: 'RBAC role definitions (Customer, Moderator, Store Manager, Super Admin)', targetCommand: 'CMD-03'},
  {id: 'permissions', name: 'Permissions', responsibility: 'Capability policy matrix and authorization guards', targetCommand: 'CMD-03'},
  {id: 'customers', name: 'Customers', responsibility: 'Customer profiles, BD saved addresses, wishlist', targetCommand: 'CMD-02'},
  {id: 'products', name: 'Products', responsibility: 'Catalog items, variants, bilingual ProductTranslations', targetCommand: 'CMD-02'},
  {id: 'categories', name: 'Categories', responsibility: 'Hierarchical taxonomy and hygiene returnability flags', targetCommand: 'CMD-02'},
  {id: 'inventory', name: 'Inventory', responsibility: 'Stock balances, reservations, immutable StockMovements ledger', targetCommand: 'CMD-03'},
  {id: 'orders', name: 'Orders', responsibility: 'Checkout orchestration, COD verification, order lifecycle', targetCommand: 'CMD-02'},
  {id: 'payments', name: 'Payments', responsibility: 'COD tracking, bKash/Nagad/SSLCommerz adapters, refunds', targetCommand: 'CMD-03'},
  {id: 'shipping', name: 'Shipping', responsibility: 'Bangladesh delivery zones, courier booking & tracking', targetCommand: 'CMD-03'},
  {id: 'crm', name: 'CRM', responsibility: 'Customer segmentation, care notes, lifetime insights', targetCommand: 'CMD-03'},
  {id: 'support', name: 'Support', responsibility: 'Customer support tickets, fit inquiries, resolution threads', targetCommand: 'CMD-02'},
  {id: 'marketing', name: 'Marketing', responsibility: 'Banners, editorial promos, blog CMS, SEO metadata', targetCommand: 'CMD-04'},
  {id: 'analytics', name: 'Analytics', responsibility: 'Conversion, category performance, RTO metrics', targetCommand: 'CMD-04'},
  {id: 'automation', name: 'Automation', responsibility: 'Event-driven jobs, retries, scheduled workflows', targetCommand: 'CMD-04'},
  {id: 'notifications', name: 'Notifications', responsibility: 'SMS, Email, WhatsApp, and in-app templates', targetCommand: 'CMD-04'},
  {id: 'reporting', name: 'Reporting', responsibility: 'Financial summaries, COD reconciliation, exports', targetCommand: 'CMD-04'},
  {id: 'settings', name: 'Settings', responsibility: 'Platform configuration, delivery charges, feature flags', targetCommand: 'CMD-03'},
  {id: 'audit-logs', name: 'Audit Logs', responsibility: 'Immutable security and administrative mutation log', targetCommand: 'CMD-03'},
] as const;

export type DomainModuleId = (typeof DOMAIN_MODULE_REGISTRY)[number]['id'];
