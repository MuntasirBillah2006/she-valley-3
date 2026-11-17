import { eq } from 'drizzle-orm';
import { DEFAULT_DELIVERY_CHARGES } from '../config/bangladesh.ts';
import { db } from './index.ts';
import {
  banners,
  blogPosts,
  categories,
  categoryTranslations,
  contentPages,
  customers,
  faqs,
  inventory,
  permissions,
  productImages,
  products,
  productTranslations,
  productVariants,
  reviews,
  rolePermissions,
  roles,
  settings,
  stockMovements,
  suppliers,
  userRoles,
  users,
  warehouses,
} from './schema.ts';
import { hashPassword, type PermissionCode, type RoleCode } from '../server/auth.ts';
import { appLogger } from '../lib/logger.ts';

const SYSTEM_PERMISSIONS: { code: PermissionCode; name: string; description: string }[] = [
  { code: 'view', name: 'View', description: 'View operational dashboards, orders, and catalog' },
  { code: 'create', name: 'Create', description: 'Create catalog items, inventory movements, and content' },
  { code: 'edit', name: 'Edit', description: 'Edit orders, products, pricing, and content' },
  { code: 'delete', name: 'Delete', description: 'Archive or delete eligible records' },
  { code: 'approve', name: 'Approve', description: 'Approve orders, reviews, and editorial drafts' },
  { code: 'export', name: 'Export', description: 'Export orders, inventory, and financial CSV reports' },
  { code: 'refund', name: 'Refund', description: 'Authorize refunds and financial adjustments' },
  { code: 'manage_users', name: 'Manage Users', description: 'Create staff accounts and assign RBAC roles' },
  { code: 'manage_settings', name: 'Manage Settings', description: 'Modify platform-wide store and delivery settings' },
];

const SYSTEM_ROLES: {
  code: RoleCode;
  name: string;
  description: string;
  permissions: PermissionCode[];
}[] = [
  {
    code: 'SUPER_ADMIN',
    name: 'Super Admin',
    description: 'Full administrative control across platform, staff, finances, and security',
    permissions: ['view', 'create', 'edit', 'delete', 'approve', 'export', 'refund', 'manage_users', 'manage_settings'],
  },
  {
    code: 'STORE_MANAGER',
    name: 'Store Manager',
    description: 'Manages catalog, pricing, inventory, orders, and operational exports',
    permissions: ['view', 'create', 'edit', 'approve', 'export'],
  },
  {
    code: 'ORDER_MANAGER',
    name: 'Order Manager',
    description: 'Verifies COD orders, updates fulfillment stages, and exports dispatch lists',
    permissions: ['view', 'edit', 'approve', 'export'],
  },
  {
    code: 'CUSTOMER_SUPPORT',
    name: 'Customer Support',
    description: 'Assists customers with order updates, sizing help, and support notes',
    permissions: ['view', 'edit'],
  },
  {
    code: 'MODERATOR',
    name: 'Moderator',
    description: 'Reviews customer feedback and verifies order inquiries without admin or pricing rights',
    permissions: ['view', 'approve'],
  },
  {
    code: 'INVENTORY_STAFF',
    name: 'Inventory Staff',
    description: 'Handles stock-in, stock-out, adjustments, and warehouse reconciliations',
    permissions: ['view', 'create', 'edit'],
  },
  {
    code: 'ACCOUNTANT',
    name: 'Accountant',
    description: 'Audits financial ledgers, exports reports, and processes approved refunds',
    permissions: ['view', 'export', 'refund'],
  },
  {
    code: 'MARKETING_MANAGER',
    name: 'Marketing Manager',
    description: 'Manages homepage banners, featured collections, and campaigns',
    permissions: ['view', 'create', 'edit'],
  },
  {
    code: 'CONTENT_MANAGER',
    name: 'Content Manager',
    description: 'Manages journal articles, FAQs, and bilingual informational pages',
    permissions: ['view', 'create', 'edit', 'approve'],
  },
  {
    code: 'CUSTOMER',
    name: 'Customer',
    description: 'Standard registered customer account',
    permissions: [],
  },
];

let bootstrapPromise: Promise<void> | null = null;

/**
 * Ensures mandatory system roles, permissions, default warehouse, delivery settings,
 * and unpublished policy scaffolds exist. Safe & idempotent in all environments.
 */
export async function ensureSystemBootstrap(): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = runBootstrap().catch((err) => {
      bootstrapPromise = null;
      throw err;
    });
  }
  return bootstrapPromise;
}

async function runBootstrap(): Promise<void> {
  // 1. Seed permissions
  for (const perm of SYSTEM_PERMISSIONS) {
    await db
      .insert(permissions)
      .values(perm)
      .onConflictDoUpdate({
        target: permissions.code,
        set: { name: perm.name, description: perm.description },
      });
  }
  const allPerms = await db.select().from(permissions);
  const permByCode = new Map(allPerms.map((p) => [p.code, p.id]));

  // 2. Seed roles and role-permission mappings
  for (const roleDef of SYSTEM_ROLES) {
    await db
      .insert(roles)
      .values({
        code: roleDef.code,
        name: roleDef.name,
        description: roleDef.description,
        isSystem: true,
      })
      .onConflictDoUpdate({
        target: roles.code,
        set: { name: roleDef.name, description: roleDef.description },
      });

    const [roleRow] = await db.select().from(roles).where(eq(roles.code, roleDef.code)).limit(1);
    if (roleRow) {
      for (const permCode of roleDef.permissions) {
        const permId = permByCode.get(permCode);
        if (permId) {
          await db
            .insert(rolePermissions)
            .values({ roleId: roleRow.id, permissionId: permId })
            .onConflictDoNothing();
        }
      }
    }
  }

  // 3. Default warehouse (Task 02.107)
  await db
    .insert(warehouses)
    .values({
      code: 'DHK-MAIN',
      name: 'Dhaka Central Fulfillment',
      address: '[PLACEHOLDER: Dhaka Warehouse Address]',
      isDefault: true,
      isActive: true,
    })
    .onConflictDoNothing();

  // 4. Default store, delivery, contact/social, payment, courier, marketing & automation settings
  const defaultSettings = [
    {
      key: 'delivery_zones',
      group: 'SHIPPING',
      valueJson: DEFAULT_DELIVERY_CHARGES,
      isPublic: true,
    },
    {
      key: 'store_profile',
      group: 'GENERAL',
      valueJson: {
        brandName: 'SHE-VALLEY',
        slogan: 'BE COMFORTABLE. BE CONFIDENT.',
        supportEmail: '[PLACEHOLDER: support@she-valley.com]',
        supportPhone: '01828-298143',
        whatsappNumber: '01828-298143',
        messengerUrl: 'https://m.me/SheValley',
        brandHandle: '@she-valley',
        officeAddress: '[PLACEHOLDER: Dhaka Operations Address]',
        discreetPackagingDefault: true,
        codEnabled: true,
        onlinePaymentsEnabled: false,
      },
      isPublic: true,
    },
    {
      key: 'contact_social',
      group: 'SOCIAL',
      valueJson: {
        whatsappNumber: '01828-298143',
        messengerUrl: 'https://m.me/SheValley',
        facebookPageUrl: 'https://facebook.com/SheValley',
        instagramHandle: '@she-valley',
        instagramUrl: 'https://instagram.com/she-valley',
        supportEmail: 'support@she-valley.com',
        floatingWhatsappEnabled: true,
        whatsappCloudApiStatus: process.env.WHATSAPP_ACCESS_TOKEN ? 'CONFIGURED' : 'NOT_CONNECTED',
        messengerApiStatus: process.env.META_APP_SECRET ? 'CONFIGURED' : 'NOT_CONNECTED',
      },
      isPublic: true,
    },
    {
      key: 'payment_config',
      group: 'PAYMENTS',
      valueJson: {
        codEnabled: true,
        codMaxAmountBdt: 25000,
        liveActivationApprovedByOwner: false,
        sandboxModeEnabled: process.env.NODE_ENV !== 'production',
        providers: {
          COD: { enabled: true, mode: 'ACTIVE', feeRatePercent: 0 },
          BKASH: {
            enabled: true,
            mode: process.env.BKASH_APP_KEY ? 'SANDBOX_OR_LIVE' : 'PENDING_CREDENTIALS',
            feeRatePercent: 1.5,
          },
          NAGAD: {
            enabled: true,
            mode: process.env.NAGAD_MERCHANT_ID ? 'SANDBOX_OR_LIVE' : 'PENDING_CREDENTIALS',
            feeRatePercent: 1.4,
          },
          SSLCOMMERZ: {
            enabled: true,
            mode: process.env.SSLCOMMERZ_STORE_ID ? 'SANDBOX_OR_LIVE' : 'PENDING_CREDENTIALS',
            feeRatePercent: 2.5,
          },
        },
      },
      isPublic: false,
    },
    {
      key: 'courier_config',
      group: 'SHIPPING',
      valueJson: {
        defaultProvider: 'STEADFAST',
        discreetParcelLabelDefault: true,
        hideInnerwearDescriptionOnLabel: true,
        sandboxDispatchAllowed: process.env.NODE_ENV !== 'production',
        providers: {
          PATHAO: { enabled: true, mode: process.env.PATHAO_CLIENT_ID ? 'CONFIGURED' : 'PENDING_CREDENTIALS' },
          STEADFAST: { enabled: true, mode: process.env.STEADFAST_API_KEY ? 'CONFIGURED' : 'PENDING_CREDENTIALS' },
          REDX: { enabled: true, mode: process.env.REDX_API_TOKEN ? 'CONFIGURED' : 'PENDING_CREDENTIALS' },
          PAPERFLY: { enabled: true, mode: 'PENDING_CREDENTIALS' },
          ECOURIER: { enabled: true, mode: 'PENDING_CREDENTIALS' },
        },
      },
      isPublic: false,
    },
    {
      key: 'marketing_config',
      group: 'MARKETING',
      valueJson: {
        ga4MeasurementId: '',
        gtmContainerId: '',
        metaPixelId: process.env.META_PIXEL_ID || '',
        searchConsoleVerification: '',
        capiEnabled: Boolean(process.env.META_CAPI_ACCESS_TOKEN),
        requireCookieConsentForMarketing: true,
      },
      isPublic: true,
    },
    {
      key: 'notification_config',
      group: 'NOTIFICATIONS',
      valueJson: {
        sendRealExternalMessages: false,
        ownerApprovedExternalDispatch: false,
        channels: {
          IN_APP: { enabled: true, mode: 'ACTIVE' },
          EMAIL: { enabled: true, mode: process.env.SMTP_HOST ? 'CONFIGURED' : 'MOCK_SANDBOX' },
          SMS: { enabled: true, mode: process.env.SMS_API_KEY ? 'CONFIGURED' : 'MOCK_SANDBOX' },
          WHATSAPP: { enabled: true, mode: process.env.WHATSAPP_ACCESS_TOKEN ? 'CONFIGURED' : 'MOCK_SANDBOX' },
        },
      },
      isPublic: false,
    },
    {
      key: 'automation_config',
      group: 'AUTOMATION',
      valueJson: {
        enabled: true,
        n8nWebhookUrl: process.env.N8N_WEBHOOK_URL || '',
        workflows: {
          NEW_ORDER_ADMIN_ALERT: { enabled: true, requiresApproval: false },
          CONFIRMED_ORDER_CUSTOMER_NOTIFY: { enabled: true, requiresApproval: true },
          PAYMENT_SUCCESS_UPDATE: { enabled: true, requiresApproval: false },
          LOW_STOCK_ADMIN_ALERT: { enabled: true, requiresApproval: false },
          OUT_OF_STOCK_AVAILABILITY_UPDATE: { enabled: true, requiresApproval: false },
          COURIER_STATUS_ORDER_TIMELINE: { enabled: true, requiresApproval: false },
          DELIVERED_ORDER_FEEDBACK_REQUEST: { enabled: true, requiresApproval: true },
          NEW_TICKET_MODERATOR_ASSIGN: { enabled: true, requiresApproval: false },
          FAILED_NOTIFICATION_RETRY: { enabled: true, requiresApproval: false },
          FAILED_AUTOMATION_ERROR_LOG: { enabled: true, requiresApproval: false },
        },
      },
      isPublic: false,
    },
  ];

  for (const s of defaultSettings) {
    await db.insert(settings).values(s).onConflictDoNothing();
  }

  // Sync legacy Command 02 placeholder store_profile if untouched
  const [existingStoreProfile] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, 'store_profile'))
    .limit(1);
  if (existingStoreProfile) {
    const val = existingStoreProfile.valueJson as Record<string, unknown>;
    if (!val.messengerUrl || val.supportPhone === '[PLACEHOLDER: +880-1XXX-XXXXXX]') {
      await db
        .update(settings)
        .set({
          valueJson: {
            ...val,
            supportPhone: '01828-298143',
            whatsappNumber: '01828-298143',
            messengerUrl: 'https://m.me/SheValley',
            brandHandle: '@she-valley',
          },
          updatedAt: new Date(),
        })
        .where(eq(settings.id, existingStoreProfile.id));
    }
  }

  // 5. Static & Policy Content Pages (Task 02.145: policies stay unpublished until owner approves!)
  const basePages = [
    {
      slug: 'about',
      pageType: 'STATIC',
      titleEn: 'About SHE-VALLEY',
      titleBn: 'SHE-VALLEY সম্পর্কে',
      bodyEn:
        'SHE-VALLEY is a Bangladesh-based women’s comfort and lifestyle brand founded on six values: Comfort, Confidence, Privacy, Care, Quality, and Respect.',
      bodyBn:
        'SHE-VALLEY বাংলাদেশের নারীদের জন্য একটি আরাম ও লাইফস্টাইল ব্র্যান্ড—যার মূল ভিত্তি হলো আরাম, আত্মবিশ্বাস, গোপনীয়তা, যত্ন, মান এবং সম্মান।',
      isPublished: true,
      ownerApproved: true,
    },
    {
      slug: 'contact',
      pageType: 'STATIC',
      titleEn: 'Contact & Fit Care',
      titleBn: 'যোগাযোগ ও ফিট পরামর্শ',
      bodyEn:
        'Reach our discreet women-led customer care team on WhatsApp (01828-298143), Messenger (https://m.me/SheValley), Instagram (@she-valley), or via support@she-valley.com.',
      bodyBn:
        'আমাদের গোপনীয় ও যত্নশীল কাস্টমার কেয়ার টিমের সাথে যোগাযোগ করুন হোয়াটসঅ্যাপ (01828-298143), মেসেঞ্জার (https://m.me/SheValley), ইনস্টাগ্রাম (@she-valley) অথবা support@she-valley.com-এ।',
      isPublished: true,
      ownerApproved: true,
    },
    {
      slug: 'privacy-policy',
      pageType: 'POLICY',
      titleEn: 'Privacy Policy (Draft — Pending Owner Approval)',
      titleBn: 'গোপনীয়তা নীতিমালা (খসড়া — মালিকের অনুমোদনের অপেক্ষায়)',
      bodyEn:
        '[DRAFT PLACEHOLDER] Formal legal privacy policy terms awaiting final owner legal review and approval before public publication.',
      bodyBn:
        '[খসড়া প্লেসহোল্ডার] চূড়ান্ত প্রকাশের আগে মালিকের আইনি পর্যালোচনা ও অনুমোদনের অপেক্ষায় রয়েছে।',
      isPublished: false,
      ownerApproved: false,
    },
    {
      slug: 'return-policy',
      pageType: 'POLICY',
      titleEn: 'Return & Hygiene Exchange Policy (Draft — Pending Owner Approval)',
      titleBn: 'রিটার্ন ও হাইজিন এক্সচেঞ্জ নীতিমালা (খসড়া — অনুমোদনের অপেক্ষায়)',
      bodyEn:
        '[DRAFT PLACEHOLDER] Hygiene-conscious exchange and return terms awaiting owner sign-off before publication.',
      bodyBn:
        '[খসড়া প্লেসহোল্ডার] মালিকের চূড়ান্ত অনুমোদনের পর প্রকাশ করা হবে।',
      isPublished: false,
      ownerApproved: false,
    },
    {
      slug: 'shipping-policy',
      pageType: 'POLICY',
      titleEn: 'Shipping & COD Policy (Draft — Pending Owner Approval)',
      titleBn: 'ডেলিভারি ও ক্যাশ অন ডেলিভারি নীতিমালা (খসড়া)',
      bodyEn:
        '[DRAFT PLACEHOLDER] Standard Dhaka Metro and Nationwide Bangladesh COD shipping policy awaiting final owner approval.',
      bodyBn:
        '[খসড়া প্লেসহোল্ডার] মালিকের চূড়ান্ত অনুমোদনের পর প্রকাশ করা হবে।',
      isPublished: false,
      ownerApproved: false,
    },
  ];

  for (const page of basePages) {
    await db.insert(contentPages).values(page).onConflictDoNothing();
  }

  // 6. Seed development-only sample data when NOT in production (Task 02.07)
  if (process.env.NODE_ENV !== 'production') {
    await seedDevelopmentSampleData();
  }
}

async function seedDevelopmentSampleData(): Promise<void> {
  // Check if catalog already exists so seed is strictly idempotent
  const existingProducts = await db.select({ id: products.id }).from(products).limit(1);
  if (existingProducts.length > 0) {
    return;
  }

  appLogger.info('Seeding development-only sample catalog and demo roles', {
    environment: process.env.NODE_ENV || 'development',
  });

  // Development-only demo staff & customer accounts (never seeded in production)
  const devAdminHash = await hashPassword('SheValleyAdmin!2026');
  const devMfaHash = await hashPassword('246810');
  const devModHash = await hashPassword('SheValleyMod!2026');
  const devCustomerHash = await hashPassword('SheValleyCustomer!2026');

  const [superAdminRole] = await db.select().from(roles).where(eq(roles.code, 'SUPER_ADMIN')).limit(1);
  const [moderatorRole] = await db.select().from(roles).where(eq(roles.code, 'MODERATOR')).limit(1);
  const [customerRole] = await db.select().from(roles).where(eq(roles.code, 'CUSTOMER')).limit(1);

  const [adminUser] = await db
    .insert(users)
    .values({
      email: 'admin@shevalley.local',
      phone: '01700000001',
      passwordHash: devAdminHash,
      fullName: 'Dev Super Admin',
      status: 'ACTIVE',
      emailVerified: true,
      mfaEnabled: true,
      mfaPasscodeHash: devMfaHash,
    })
    .onConflictDoNothing()
    .returning();

  if (adminUser && superAdminRole) {
    await db.insert(userRoles).values({ userId: adminUser.id, roleId: superAdminRole.id }).onConflictDoNothing();
  }

  const [modUser] = await db
    .insert(users)
    .values({
      email: 'moderator@shevalley.local',
      phone: '01700000002',
      passwordHash: devModHash,
      fullName: 'Dev Moderator',
      status: 'ACTIVE',
      emailVerified: true,
      mfaEnabled: false,
    })
    .onConflictDoNothing()
    .returning();

  if (modUser && moderatorRole) {
    await db.insert(userRoles).values({ userId: modUser.id, roleId: moderatorRole.id }).onConflictDoNothing();
  }

  const [custUser] = await db
    .insert(users)
    .values({
      email: 'customer@shevalley.local',
      phone: '01700000003',
      passwordHash: devCustomerHash,
      fullName: 'Nadia Rahman (Dev)',
      status: 'ACTIVE',
      emailVerified: true,
      mfaEnabled: false,
    })
    .onConflictDoNothing()
    .returning();

  if (custUser && customerRole) {
    await db.insert(userRoles).values({ userId: custUser.id, roleId: customerRole.id }).onConflictDoNothing();
    await db
      .insert(customers)
      .values({
        userId: custUser.id,
        fullName: 'Nadia Rahman (Dev)',
        phone: '01700000003',
        email: 'customer@shevalley.local',
      })
      .onConflictDoNothing();
  }

  // Default Warehouse & Sample Supplier
  const [defaultWh] = await db.select().from(warehouses).where(eq(warehouses.code, 'DHK-MAIN')).limit(1);
  await db
    .insert(suppliers)
    .values({
      name: '[DEV SAMPLE] Dhaka Knitwear Studio',
      contactPerson: 'Production Desk',
      phone: '01700000099',
      address: 'Gazipur, Bangladesh',
      notes: 'Development-only sample supplier',
    })
    .onConflictDoNothing();

  // Categories & Subcategories (with EN & BN translations)
  const [rootInnerwear] = await db
    .insert(categories)
    .values({
      slug: 'womens-innerwear',
      imageUrl: '/src/assets/images/she_valley_fabric_editorial_1794848670027.jpg',
      isActive: true,
      isReturnableByHygiene: false,
      sortOrder: 1,
      launchPhase: 'ACTIVE',
    })
    .returning();

  await db.insert(categoryTranslations).values([
    {
      categoryId: rootInnerwear.id,
      locale: 'en',
      name: "Women's Innerwear",
      description: 'Breathable everyday comfort designed for Bangladesh’s warm climate.',
    },
    {
      categoryId: rootInnerwear.id,
      locale: 'bn',
      name: 'নারীদের ইনারওয়্যার',
      description: 'বাংলাদেশের আবহাওয়ার উপযোগী শ্বাস-প্রশ্বাসযোগ্য ও আরামদায়ক প্রতিদিনের ইনারওয়্যার।',
    },
  ]);

  const subcats = [
    {
      slug: 'everyday-bras',
      imageUrl: '/src/assets/images/product_wireless_cotton_bra_1794849869916.jpg',
      isReturnableByHygiene: true,
      sortOrder: 2,
      nameEn: 'Everyday & Wireless Bras',
      nameBn: 'প্রতিদিনের ওয়্যারলেস ব্রা',
      descEn: 'Soft combed cotton and modal support without digging wires.',
      descBn: 'তারবিহীন নরম কটন ও মোডাল সাপোর্ট যা সারাদিন স্বস্তি দেয়।',
    },
    {
      slug: 'organic-briefs',
      imageUrl: '/src/assets/images/product_organic_brief_pack_1794849870145.jpg',
      isReturnableByHygiene: false,
      sortOrder: 3,
      nameEn: 'Cotton Briefs & Multipacks',
      nameBn: 'কটন ব্রিফ ও মাল্টিপ্যাক',
      descEn: 'Tag-free, breathable organic cotton essentials.',
      descBn: 'ট্যাগবিহীন, বাতাস চলাচলযোগ্য অর্গানিক কটন ব্রিফ।',
    },
    {
      slug: 'maternity-comfort',
      imageUrl: '/src/assets/images/product_maternity_nursing_bra_1794849870728.jpg',
      isReturnableByHygiene: true,
      sortOrder: 4,
      nameEn: 'Maternity & Nursing',
      nameBn: 'ম্যাটারনিটি ও নার্সিং',
      descEn: 'Gentle, adaptable support for expectant and new mothers.',
      descBn: 'নতুন মায়েদের জন্য নরম ও সহজলভ্য সাপোর্ট।',
    },
  ];

  const catIdBySlug = new Map<string, string>();
  for (const sub of subcats) {
    const [row] = await db
      .insert(categories)
      .values({
        parentId: rootInnerwear.id,
        slug: sub.slug,
        imageUrl: sub.imageUrl,
        isActive: true,
        isReturnableByHygiene: sub.isReturnableByHygiene,
        sortOrder: sub.sortOrder,
        launchPhase: 'ACTIVE',
      })
      .returning();
    catIdBySlug.set(sub.slug, row.id);
    await db.insert(categoryTranslations).values([
      { categoryId: row.id, locale: 'en', name: sub.nameEn, description: sub.descEn },
      { categoryId: row.id, locale: 'bn', name: sub.nameBn, description: sub.descBn },
    ]);
  }

  // Future categories (inactive placeholder taxonomy ready for future expansion)
  const [nightwearCat] = await db
    .insert(categories)
    .values({
      slug: 'nightwear-sleepwear',
      isActive: false,
      isReturnableByHygiene: true,
      sortOrder: 10,
      launchPhase: 'PLANNED',
    })
    .returning();
  await db.insert(categoryTranslations).values([
    { categoryId: nightwearCat.id, locale: 'en', name: 'Nightwear & Sleepwear', description: 'Upcoming collection.' },
    { categoryId: nightwearCat.id, locale: 'bn', name: 'নাইটওয়্যার ও স্লিপওয়্যার', description: 'আসন্ন কালেকশন।' },
  ]);

  // Sample Products + Translations + Variants + Images + Inventory + Initial Stock Movements
  const devProducts = [
    {
      categorySlug: 'everyday-bras',
      slug: 'cloud-cotton-wireless-everyday-bra',
      skuPrefix: 'SV-WB',
      basePriceBdt: '950.00',
      isFeatured: true,
      isNewArrival: true,
      fabricSpecEn: '95% Combed Organic Cotton, 5% Elastane · Soft brushed band',
      fabricSpecBn: '৯৫% কোম্বড অর্গানিক কটন, ৫% ইলাস্টেন · নরম ব্রাশড ব্যান্ড',
      careEn: 'Hand wash or cold gentle machine cycle in laundry bag. Dry flat in shade.',
      careBn: 'লন্ড্রি ব্যাগে ঠান্ডা পানিতে হালকা ধোয়া বা হাতে ধোয়া উত্তম। ছায়ায় শুকান।',
      nameEn: 'Cloud Cotton Wireless Everyday Bra',
      nameBn: 'ক্লাউড কটন ওয়্যারলেস এভরিডে ব্রা',
      shortEn: 'Breathable wire-free support tailored for humid days.',
      shortBn: 'আর্দ্র আবহাওয়ার জন্য তারবিহীন, আরামদায়ক ও শ্বাস-প্রশ্বাসযোগ্য সাপোর্ট।',
      descEn:
        'Designed for 12-hour everyday ease in Bangladesh’s warm climate. Double-layered cotton cups offer gentle shaping without foam bulk or rigid underwires.',
      descBn:
        'বাংলাদেশের উষ্ণ আবহাওয়ায় দীর্ঘ সময় পরার উপযোগী করে তৈরি। ভারী প্যাড বা শক্ত তার ছাড়াই ডাবল-লেয়ার কটন কাপ দেয় স্বাভাবিক ও আরামদায়ক ফিট।',
      fitNotesEn: 'True to standard band & cup sizing. Choose one band size up if between sizes.',
      fitNotesBn: 'স্বাভাবিক মাপ অনুযায়ী তৈরি। দুই সাইজের মাঝামাঝি হলে এক ধাপ বড় ব্যান্ড বেছে নিন।',
      imageUrl: '/src/assets/images/product_wireless_cotton_bra_1794849869916.jpg',
      variants: [
        { sku: 'SV-WB-32B-ROSE', size: '32B', colorName: 'Muted Rose', colorHex: '#B87A88', price: '950.00', cost: '520.00', qty: 18 },
        { sku: 'SV-WB-34B-ROSE', size: '34B', colorName: 'Muted Rose', colorHex: '#B87A88', price: '950.00', cost: '520.00', qty: 24 },
        { sku: 'SV-WB-36C-NUDE', size: '36C', colorName: 'Dusty Nude', colorHex: '#DEC8BF', price: '980.00', cost: '540.00', qty: 4 },
      ],
    },
    {
      categorySlug: 'everyday-bras',
      slug: 'burgundy-modal-ribbed-comfort-bralette',
      skuPrefix: 'SV-RB',
      basePriceBdt: '1150.00',
      isFeatured: true,
      isNewArrival: true,
      fabricSpecEn: '92% Beechwood Modal, 8% Spandex · Ribbed seamless knit',
      fabricSpecBn: '৯২% বীচউড মোডাল, ৮% স্প্যানডেক্স · রিবড সিমলেস নিট',
      careEn: 'Cold gentle wash with mild detergent. Do not bleach or iron.',
      careBn: 'হালকা ডিটারজেন্ট দিয়ে ঠান্ডা পানিতে ধুয়ে নিন। ব্লিচ বা ইস্ত্রি করবেন না।',
      nameEn: 'Modal Ribbed Lounge Bralette',
      nameBn: 'মোডাল রিবড কমফোর্ট ব্রালেট',
      shortEn: 'Silky beechwood modal with wide chafe-free shoulder straps.',
      shortBn: 'চওড়া স্ট্র্যাপ ও মোলায়েম বীচউড মোডাল ফ্যাব্রিকে তৈরি।',
      descEn:
        'Cool-to-the-touch modal rib texture drapes naturally for work, rest, and sleep. Zero metallic clasp irritation.',
      descBn:
        'কাজের সময় কিংবা ঘরে বিশ্রামের জন্য মসৃণ মোডাল রিবড ব্রালেট। কোনো ধাতব হুকের অস্বস্তি নেই।',
      fitNotesEn: 'Flexible stretch fit; S (30–32), M (34–36), L (38–40).',
      fitNotesBn: 'নমনীয় স্ট্রেচ ফিট; S (৩০–৩২), M (৩৪–৩৬), L (৩৮–৪০)।',
      imageUrl: '/src/assets/images/product_ribbed_comfort_bralette_1794849870227.jpg',
      variants: [
        { sku: 'SV-RB-S-BURG', size: 'S', colorName: 'Deep Burgundy', colorHex: '#6E1F35', price: '1150.00', cost: '640.00', qty: 14 },
        { sku: 'SV-RB-M-BURG', size: 'M', colorName: 'Deep Burgundy', colorHex: '#6E1F35', price: '1150.00', cost: '640.00', qty: 20 },
        { sku: 'SV-RB-L-IVORY', size: 'L', colorName: 'Warm Ivory', colorHex: '#F7F1EB', price: '1150.00', cost: '640.00', qty: 3 },
      ],
    },
    {
      categorySlug: 'organic-briefs',
      slug: 'organic-cotton-high-rise-brief-pack-3',
      skuPrefix: 'SV-BR',
      basePriceBdt: '1290.00',
      isFeatured: true,
      isNewArrival: false,
      fabricSpecEn: '100% GOTS-inspired Combed Cotton Body · Double cotton gusset',
      fabricSpecBn: '১০০% কোম্বড কটন · ডাবল কটন গাসেট',
      careEn: 'Machine wash cold at 30°C. Sun or shade dry.',
      careBn: '৩০°সে. ঠান্ডা পানিতে ধোয়া যাবে।',
      nameEn: 'Organic Cotton High-Rise Briefs (Pack of 3)',
      nameBn: 'অর্গানিক কটন হাই-রাইজ ব্রিফ (৩ পিস প্যাক)',
      shortEn: 'Tag-free, stay-put waistband in Ivory, Dusty Nude, and Muted Rose.',
      shortBn: 'আইভরি, ডাস্টি ন্যুড ও মিউটেড রোজ রঙে ৩ পিসের আরামদায়ক প্যাক।',
      descEn:
        'Full-coverage high-rise silhouettes that stay smooth beneath salwar kameez, saree, or denim without rolling.',
      descBn:
        'শাড়ি, সালোয়ার কামিজ বা যেকোনো পোশাকের নিচে মসৃণভাবে মানিয়ে যাওয়া হাই-রাইজ ডিজাইন।',
      fitNotesEn: 'True to hip measurement; tag-free printed care label.',
      fitNotesBn: 'হিপের মাপ অনুযায়ী সঠিক ফিট; কোনো খোঁচা দেওয়া ট্যাগ নেই।',
      imageUrl: '/src/assets/images/product_organic_brief_pack_1794849870145.jpg',
      variants: [
        { sku: 'SV-BR-M-TRIO', size: 'M', colorName: 'Trio Palette', colorHex: '#DEC8BF', price: '1290.00', cost: '700.00', qty: 28 },
        { sku: 'SV-BR-L-TRIO', size: 'L', colorName: 'Trio Palette', colorHex: '#DEC8BF', price: '1290.00', cost: '700.00', qty: 22 },
        { sku: 'SV-BR-XL-TRIO', size: 'XL', colorName: 'Trio Palette', colorHex: '#DEC8BF', price: '1350.00', cost: '730.00', qty: 12 },
      ],
    },
    {
      categorySlug: 'maternity-comfort',
      slug: 'gentle-maternity-nursing-comfort-bra',
      skuPrefix: 'SV-MT',
      basePriceBdt: '1390.00',
      isFeatured: false,
      isNewArrival: true,
      fabricSpecEn: '95% Cotton-Modal Blend · One-hand matte nursing clasp',
      fabricSpecBn: '৯৫% কটন-মোডাল ব্লেন্ড · এক হাতে খোলা যায় এমন ম্যাট ক্ল্যাস্প',
      careEn: 'Gentle hand or machine wash in mesh bag.',
      careBn: 'মেশ ব্যাগে হালকা ধোয়া উত্তম।',
      nameEn: 'Gentle Maternity & Nursing Comfort Bra',
      nameBn: 'জেন্টল ম্যাটারনিটি ও নার্সিং কমফোর্ট ব্রা',
      shortEn: '4-row adaptable hook extender and soft drop-cup access.',
      shortBn: '৪-সারির অ্যাডজাস্টেবল হুক ও নরম ড্রপ-কাপ সুবিধা।',
      descEn:
        'Built with breathable natural fibers and extra back-band adjustability to adapt gracefully through pregnancy and postpartum.',
      descBn:
        'গর্ভাবস্থা ও মাতৃত্বকালীন পরিবর্তনের সাথে মানিয়ে নিতে সক্ষম শ্বাস-প্রশ্বাসযোগ্য ফ্যাব্রিক।',
      fitNotesEn: 'Includes 4-row extender for natural ribcage changes.',
      fitNotesBn: 'অতিরিক্ত প্রসারণের জন্য ৪-সারির এক্সটেন্ডার যুক্ত।',
      imageUrl: '/src/assets/images/product_maternity_nursing_bra_1794849870728.jpg',
      variants: [
        { sku: 'SV-MT-34C-SAND', size: '34C', colorName: 'Warm Sand', colorHex: '#D8C2B0', price: '1390.00', cost: '760.00', qty: 15 },
        { sku: 'SV-MT-36D-SAND', size: '36D', colorName: 'Warm Sand', colorHex: '#D8C2B0', price: '1390.00', cost: '760.00', qty: 10 },
      ],
    },
  ];

  const sizeGuideRows = [
    { size: '32B / S', underbustCm: '68–72 cm', bustCm: '82–86 cm' },
    { size: '34B / M', underbustCm: '73–77 cm', bustCm: '87–91 cm' },
    { size: '36C / L', underbustCm: '78–82 cm', bustCm: '93–97 cm' },
    { size: '38D / XL', underbustCm: '83–87 cm', bustCm: '99–104 cm' },
  ];

  for (const item of devProducts) {
    const categoryId = catIdBySlug.get(item.categorySlug)!;
    const [prod] = await db
      .insert(products)
      .values({
        categoryId,
        slug: item.slug,
        skuPrefix: item.skuPrefix,
        brandName: 'SHE-VALLEY',
        status: 'ACTIVE',
        isFeatured: item.isFeatured,
        isNewArrival: item.isNewArrival,
        fabricSpecEn: item.fabricSpecEn,
        fabricSpecBn: item.fabricSpecBn,
        careInstructionsEn: item.careEn,
        careInstructionsBn: item.careBn,
        sizeGuideJson: sizeGuideRows,
        basePriceBdt: item.basePriceBdt,
      })
      .returning();

    await db.insert(productTranslations).values([
      {
        productId: prod.id,
        locale: 'en',
        name: item.nameEn,
        shortDescription: item.shortEn,
        description: item.descEn,
        fitNotes: item.fitNotesEn,
        seoTitle: `${item.nameEn} | SHE-VALLEY`,
        seoDescription: item.shortEn,
      },
      {
        productId: prod.id,
        locale: 'bn',
        name: item.nameBn,
        shortDescription: item.shortBn,
        description: item.descBn,
        fitNotes: item.fitNotesBn,
        seoTitle: `${item.nameBn} | SHE-VALLEY`,
        seoDescription: item.shortBn,
      },
    ]);

    await db.insert(productImages).values({
      productId: prod.id,
      url: item.imageUrl,
      altEn: item.nameEn,
      altBn: item.nameBn,
      sortOrder: 0,
      isPrimary: true,
    });

    for (const v of item.variants) {
      const [variant] = await db
        .insert(productVariants)
        .values({
          productId: prod.id,
          sku: v.sku,
          size: v.size,
          colorName: v.colorName,
          colorHex: v.colorHex,
          packSize: 1,
          priceBdt: v.price,
          costPriceBdt: v.cost,
          weightGrams: 120,
          isActive: true,
        })
        .returning();

      await db.insert(inventory).values({
        variantId: variant.id,
        warehouseId: defaultWh?.id ?? null,
        onHandQty: v.qty,
        reservedQty: 0,
        lowStockThreshold: 5,
      });

      await db.insert(stockMovements).values({
        variantId: variant.id,
        warehouseId: defaultWh?.id ?? null,
        type: 'STOCK_IN',
        quantityDelta: v.qty,
        balanceAfter: v.qty,
        unitCostBdt: v.cost,
        referenceType: 'DEV_SEED',
        referenceId: prod.id,
        reason: 'Initial development sample stock',
        actorUserId: adminUser?.id ?? null,
      });
    }

    // Add 1 sample approved review per product for development preview
    await db.insert(reviews).values({
      productId: prod.id,
      authorName: 'Farhana T. · Dhaka',
      rating: 5,
      title: 'Softest everyday fit',
      comment: 'Breathable cotton in humid weather and arrived in completely plain discreet packaging.',
      fitFeedback: 'TRUE_TO_SIZE',
      moderationStatus: 'APPROVED',
    });
  }

  // Homepage Hero & Announcement Banners
  await db.insert(banners).values([
    {
      placement: 'ANNOUNCEMENT',
      titleEn: 'Discreet plain packaging · Cash on Delivery across Bangladesh · Free shipping over ৳2,500',
      titleBn: 'গোপনীয় প্লেইন প্যাকেজিং · সারা বাংলাদেশে ক্যাশ অন ডেলিভারি · ৳২,৫০০+ অর্ডারে ফ্রি ডেলিভারি',
      isActive: true,
      sortOrder: 0,
    },
    {
      placement: 'HERO',
      titleEn: 'Quiet comfort crafted for every day.',
      titleBn: 'প্রতিদিনের জন্য নির্মিত প্রশান্ত ও আরামদায়ক ইনারওয়্যার।',
      subtitleEn: 'Breathable combed cotton and modal essentials delivered discreetly to your door across Bangladesh.',
      subtitleBn: 'বাংলাদেশের আবহাওয়ার উপযোগী কোম্বড কটন ও মোডাল এসেনশিয়ালস—গোপনীয় প্যাকেজিংয়ে পৌঁছে যাবে আপনার ঠিকানায়।',
      ctaLabelEn: 'Shop Innerwear',
      ctaLabelBn: 'কালেকশন দেখুন',
      ctaHref: '/shop',
      imageUrl: '/src/assets/images/hero_innerwear_atelier_1794849871246.jpg',
      isActive: true,
      sortOrder: 1,
    },
  ]);

  // FAQs
  await db.insert(faqs).values([
    {
      category: 'Privacy',
      questionEn: 'How discreet is SHE-VALLEY packaging?',
      questionBn: 'SHE-VALLEY-এর প্যাকেজিং কতটা গোপনীয়?',
      answerEn:
        'Every parcel ships inside a plain, unbranded outer mailer. Product names or innerwear descriptions never appear on the outer courier label.',
      answerBn:
        'প্রতিটি পার্সেল সম্পূর্ণ সাধারণ, ব্র্যান্ডবিহীন বাইরের প্যাকেটে পাঠানো হয়। বাইরের লেবেলে কখনোই পণ্যের ধরন বা বিবরণ লেখা থাকে না।',
      sortOrder: 1,
      isPublished: true,
    },
    {
      category: 'Payment',
      questionEn: 'Can I pay via Cash on Delivery (COD)?',
      questionBn: 'আমি কি ক্যাশ অন ডেলিভারি (COD)-এ মূল্য পরিশোধ করতে পারব?',
      answerEn:
        'Yes. Cash on Delivery is available across Dhaka Metro, Sub-Dhaka, and all 64 districts of Bangladesh.',
      answerBn: 'হ্যাঁ। ঢাকা মেট্রো, সাব-ঢাকা এবং বাংলাদেশের ৬৪টি জেলাতেই ক্যাশ অন ডেলিভারি সুবিধা রয়েছে।',
      sortOrder: 2,
      isPublished: true,
    },
    {
      category: 'Sizing',
      questionEn: 'What if I am unsure about my size?',
      questionBn: 'সঠিক সাইজ নিয়ে দ্বিধা থাকলে কী করব?',
      answerEn:
        'Use the centimeter and inch Size Guide on every product page, or message our women-led fit care desk before ordering.',
      answerBn:
        'প্রতিটি পণ্যের পাতায় থাকা সেন্টিমিটার ও ইঞ্চি সাইজ গাইড দেখুন অথবা অর্ডারের আগে আমাদের ফিট কেয়ার টিমের পরামর্শ নিন।',
      sortOrder: 3,
      isPublished: true,
    },
  ]);

  // Editorial Blog Foundation
  await db.insert(blogPosts).values([
    {
      slug: 'choosing-breathable-fabrics-for-bangladesh-weather',
      titleEn: 'Why Combed Cotton & Modal Matter in Humid Weather',
      titleBn: 'আর্দ্র আবহাওয়ায় কেন কোম্বড কটন ও মোডাল ফ্যাব্রিক জরুরি',
      excerptEn: 'Understanding moisture airflow, seam placement, and skin-friendly natural fibers.',
      excerptBn: 'ত্বকের আরাম ও বাতাস চলাচলের জন্য প্রাকৃতিক ফাইবার এবং সঠিক সেলাইয়ের গুরুত্ব।',
      contentEn:
        'Long days in warm humidity call for fibers that release heat rather than trapping it. Combed cotton and beechwood modal keep skin calm without synthetic stiffness.',
      contentBn:
        'উষ্ণ ও আর্দ্র আবহাওয়ায় দীর্ঘ সময় আরামদায়ক থাকতে শ্বাস-প্রশ্বাসযোগ্য প্রাকৃতিক তন্তু যেমন কোম্বড কটন ও বীচউড মোডাল সবচেয়ে উপযোগী।',
      coverImageUrl: '/src/assets/images/she_valley_fabric_editorial_1794848670027.jpg',
      status: 'PUBLISHED',
      authorUserId: adminUser?.id ?? null,
      publishedAt: new Date(),
    },
  ]);
}
