import { and, desc, eq } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../db/index.ts';
import {
  automationJobs,
  businessExpenses,
  categories,
  conversationMessages,
  conversations,
  customers,
  customerTags,
  marketingEvents,
  notificationLogs,
  orders,
  payments,
  settings,
  supportTickets,
} from '../../db/schema.ts';
import { NotFoundError, ValidationError } from '../../lib/errors.ts';
import { sanitizeCsvCell } from '../../lib/security.ts';
import { recordAuditLog } from '../audit.ts';
import { requireAnyPermission, requireAuth, requirePermission, requireStaff, type AuthRequest } from '../rbac.ts';
import {
  AUTOMATION_EVENT_REGISTRY,
  dispatchAutomationEvent,
  executeAutomationJob,
  listAutomationJobs,
  type AutomationEventType,
} from '../services/automationService.ts';
import {
  createShipmentParcel,
  getCourierProvidersStatus,
  listShipmentsAndReport,
  settleShipmentCod,
  updateShipmentStatus,
  type CourierProviderCode,
  type ShipmentStatus,
} from '../services/courierService.ts';
import { generateFinancialReport } from '../services/financialService.ts';
import { getMessagingChannelsStatus } from '../services/messagingAdapterService.ts';
import {
  attemptNotificationDelivery,
  listNotificationLogs,
  renderNotificationTemplate,
  sendOrQueueNotification,
} from '../services/notificationService.ts';
import {
  createOrProcessRefund,
  getPaymentProvidersStatus,
  listPaymentsAndRefunds,
  recordCodCollection,
  verifyPaymentServerSide,
} from '../services/paymentService.ts';

export const adminOpsRouter = Router();
adminOpsRouter.use(requireAuth, requireStaff);

// ============================================================================
// 1. PAYMENTS, COD COLLECTION, SETTLEMENT & REFUNDS
// ============================================================================

adminOpsRouter.get('/payments', requirePermission('view'), async (_req, res, next) => {
  try {
    const [providers, data] = await Promise.all([
      getPaymentProvidersStatus(),
      listPaymentsAndRefunds(),
    ]);
    return res.json({ success: true, data: { providers, ...data } });
  } catch (err) {
    next(err);
  }
});

const codCollectSchema = z.object({
  collectedAmountBdt: z.number().nonnegative(),
  reconcileNow: z.boolean().default(true),
});

adminOpsRouter.post('/payments/:id/cod-collect', requirePermission('edit'), async (req: AuthRequest, res, next) => {
  try {
    const parsed = codCollectSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Collected amount is required.', undefined, req.requestId);
    }
    const payment = await recordCodCollection({
      paymentId: req.params.id,
      collectedAmountBdt: parsed.data.collectedAmountBdt,
      reconcileNow: parsed.data.reconcileNow,
      actorUserId: req.principal!.userId,
      requestId: req.requestId || 'unknown',
    });
    return res.json({ success: true, data: { payment } });
  } catch (err) {
    next(err);
  }
});

adminOpsRouter.post('/payments/:id/verify-manual', requirePermission('approve'), async (req: AuthRequest, res, next) => {
  try {
    const outcome = req.body?.outcome === 'FAILED' ? 'FAILED' : 'PAID';
    const result = await verifyPaymentServerSide({
      paymentId: req.params.id,
      outcome,
      externalTransactionId: typeof req.body?.transactionRef === 'string' ? req.body.transactionRef : undefined,
      failureReason: typeof req.body?.reason === 'string' ? req.body.reason : undefined,
      actorUserId: req.principal!.userId,
      requestId: req.requestId || 'unknown',
    });
    return res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

const refundSchema = z.object({
  amountBdt: z.number().positive(),
  reason: z.string().trim().min(3).max(300),
  approveAndProcess: z.boolean().default(true),
});

adminOpsRouter.post('/payments/:id/refunds', requirePermission('refund'), async (req: AuthRequest, res, next) => {
  try {
    const parsed = refundSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Valid refund amount and reason are required.', undefined, req.requestId);
    }
    const refund = await createOrProcessRefund({
      paymentId: req.params.id,
      amountBdt: parsed.data.amountBdt,
      reason: parsed.data.reason,
      approveAndProcess: parsed.data.approveAndProcess,
      actorUserId: req.principal!.userId,
      requestId: req.requestId || 'unknown',
    });
    return res.status(201).json({ success: true, data: { refund } });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 2. COURIERS, PARCELS, COD SETTLEMENT & PERFORMANCE
// ============================================================================

adminOpsRouter.get('/couriers', requirePermission('view'), async (_req, res, next) => {
  try {
    const [providers, report] = await Promise.all([
      getCourierProvidersStatus(),
      listShipmentsAndReport(),
    ]);
    return res.json({ success: true, data: { providers, ...report } });
  } catch (err) {
    next(err);
  }
});

const createShipmentSchema = z.object({
  orderId: z.string().uuid(),
  provider: z.enum(['PATHAO', 'STEADFAST', 'REDX', 'PAPERFLY', 'ECOURIER', 'MANUAL']),
  deliveryChargeBdt: z.number().nonnegative().optional(),
  discreetLabel: z.boolean().optional(),
});

adminOpsRouter.post('/shipments', requirePermission('create'), async (req: AuthRequest, res, next) => {
  try {
    const parsed = createShipmentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Valid orderId and courier provider are required.', undefined, req.requestId);
    }
    const shipment = await createShipmentParcel({
      orderId: parsed.data.orderId,
      provider: parsed.data.provider as CourierProviderCode,
      deliveryChargeBdt: parsed.data.deliveryChargeBdt,
      discreetLabel: parsed.data.discreetLabel,
      actorUserId: req.principal!.userId,
      requestId: req.requestId || 'unknown',
    });
    return res.status(201).json({ success: true, data: { shipment } });
  } catch (err) {
    next(err);
  }
});

const updateShipmentSchema = z.object({
  status: z.enum([
    'PENDING_BOOKING',
    'BOOKED',
    'PICKED_UP',
    'IN_TRANSIT',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
    'FAILED_DELIVERY',
    'RETURN_INITIATED',
    'RETURNED',
    'EXCHANGE_REQUESTED',
  ]),
  note: z.string().trim().max(300).optional(),
  codCollectedBdt: z.number().nonnegative().optional(),
});

adminOpsRouter.patch('/shipments/:id/status', requirePermission('edit'), async (req: AuthRequest, res, next) => {
  try {
    const parsed = updateShipmentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Valid shipment status is required.', undefined, req.requestId);
    }
    const shipment = await updateShipmentStatus({
      shipmentId: req.params.id,
      status: parsed.data.status as ShipmentStatus,
      note: parsed.data.note,
      codCollectedBdt: parsed.data.codCollectedBdt,
      actorUserId: req.principal!.userId,
      requestId: req.requestId || 'unknown',
    });
    return res.json({ success: true, data: { shipment } });
  } catch (err) {
    next(err);
  }
});

adminOpsRouter.post(
  '/shipments/:id/settle',
  requireAnyPermission('approve', 'refund'),
  async (req: AuthRequest, res, next) => {
    try {
      const codCollectedBdt = Number(req.body?.codCollectedBdt ?? 0);
      if (!Number.isFinite(codCollectedBdt) || codCollectedBdt < 0) {
        throw new ValidationError('Valid settled COD amount is required.', undefined, req.requestId);
      }
      const shipment = await settleShipmentCod({
        shipmentId: req.params.id,
        codCollectedBdt,
        actorUserId: req.principal!.userId,
        requestId: req.requestId || 'unknown',
      });
      return res.json({ success: true, data: { shipment } });
    } catch (err) {
      next(err);
    }
  },
);

// ============================================================================
// 3. UNIFIED INBOX & SUPPORT TICKETS
// ============================================================================

adminOpsRouter.get('/inbox', requirePermission('view'), async (_req, res, next) => {
  try {
    const [channels, convRows, msgRows, ticketRows] = await Promise.all([
      getMessagingChannelsStatus(),
      db.select().from(conversations).orderBy(desc(conversations.lastMessageAt)),
      db.select().from(conversationMessages).orderBy(conversationMessages.createdAt),
      db.select().from(supportTickets).orderBy(desc(supportTickets.createdAt)),
    ]);

    const msgByConv = new Map<string, (typeof msgRows)[number][]>();
    for (const m of msgRows) {
      const arr = msgByConv.get(m.conversationId) ?? [];
      arr.push(m);
      msgByConv.set(m.conversationId, arr);
    }

    return res.json({
      success: true,
      data: {
        channels,
        conversations: convRows.map((c) => ({
          ...c,
          messages: msgByConv.get(c.id) ?? [],
        })),
        tickets: ticketRows,
      },
    });
  } catch (err) {
    next(err);
  }
});

const inboxReplySchema = z.object({
  body: z.string().trim().min(1).max(2000),
  isInternalNote: z.boolean().default(false),
});

adminOpsRouter.post(
  '/inbox/:id/messages',
  requireAnyPermission('edit', 'approve'),
  async (req: AuthRequest, res, next) => {
    try {
      const parsed = inboxReplySchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Message body is required.', undefined, req.requestId);
      }

      const [conv] = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, req.params.id))
        .limit(1);
      if (!conv) {
        throw new NotFoundError('Conversation', req.requestId);
      }

      const [msg] = await db
        .insert(conversationMessages)
        .values({
          conversationId: conv.id,
          senderType: 'STAFF',
          senderUserId: req.principal!.userId,
          senderName: req.principal!.fullName,
          body: parsed.data.body,
          isInternalNote: parsed.data.isInternalNote,
          deliveryStatus: parsed.data.isInternalNote ? 'LOCAL' : 'QUEUED',
        })
        .returning();

      await db
        .update(conversations)
        .set({ lastMessageAt: new Date(), updatedAt: new Date() })
        .where(eq(conversations.id, conv.id));

      return res.status(201).json({ success: true, data: { message: msg } });
    } catch (err) {
      next(err);
    }
  },
);

const patchInboxSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  assignedToUserId: z.string().uuid().nullable().optional(),
});

adminOpsRouter.patch(
  '/inbox/:id',
  requireAnyPermission('edit', 'approve'),
  async (req: AuthRequest, res, next) => {
    try {
      const parsed = patchInboxSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid conversation update.', undefined, req.requestId);
      }
      const [updated] = await db
        .update(conversations)
        .set({
          ...(parsed.data.status ? { status: parsed.data.status } : {}),
          ...(parsed.data.priority ? { priority: parsed.data.priority } : {}),
          ...(parsed.data.assignedToUserId !== undefined
            ? { assignedToUserId: parsed.data.assignedToUserId }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(conversations.id, req.params.id))
        .returning();

      if (!updated) {
        throw new NotFoundError('Conversation', req.requestId);
      }
      return res.json({ success: true, data: { conversation: updated } });
    } catch (err) {
      next(err);
    }
  },
);

const patchTicketSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  assignedToUserId: z.string().uuid().nullable().optional(),
  resolutionSummary: z.string().trim().max(500).optional(),
});

adminOpsRouter.patch(
  '/tickets/:id',
  requireAnyPermission('edit', 'approve'),
  async (req: AuthRequest, res, next) => {
    try {
      const parsed = patchTicketSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid ticket update.', undefined, req.requestId);
      }
      const [updated] = await db
        .update(supportTickets)
        .set({
          ...(parsed.data.status ? { status: parsed.data.status } : {}),
          ...(parsed.data.priority ? { priority: parsed.data.priority } : {}),
          ...(parsed.data.assignedToUserId !== undefined
            ? { assignedToUserId: parsed.data.assignedToUserId }
            : {}),
          ...(parsed.data.resolutionSummary !== undefined
            ? { resolutionSummary: parsed.data.resolutionSummary }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(supportTickets.id, req.params.id))
        .returning();

      if (!updated) {
        throw new NotFoundError('Support ticket', req.requestId);
      }
      return res.json({ success: true, data: { ticket: updated } });
    } catch (err) {
      next(err);
    }
  },
);

// ============================================================================
// 4. CUSTOMER CRM, TAGS, SEGMENTATION & RETENTION
// ============================================================================

adminOpsRouter.get('/crm/customers', requirePermission('view'), async (_req, res, next) => {
  try {
    const [custRows, orderRows, tagRows, ticketRows] = await Promise.all([
      db.select().from(customers).orderBy(desc(customers.createdAt)),
      db.select().from(orders),
      db.select().from(customerTags),
      db.select().from(supportTickets),
    ]);

    const enriched = custRows.map((c) => {
      const custOrders = orderRows.filter((o) => o.customerId === c.id);
      const validOrders = custOrders.filter((o) => o.status !== 'CANCELLED');
      const totalSpendBdt = validOrders.reduce((s, o) => s + Number(o.totalBdt), 0);
      const ordersCount = validOrders.length;
      const isRepeatCustomer = ordersCount >= 2;
      const computedSegment =
        totalSpendBdt >= 5000 ? 'VIP' : isRepeatCustomer ? 'REPEAT' : ordersCount === 1 ? 'FIRST_TIME' : 'PROSPECT';

      return {
        ...c,
        ordersCount,
        totalSpendBdt: Number(totalSpendBdt.toFixed(2)),
        isRepeatCustomer,
        computedSegment,
        tags: tagRows.filter((t) => t.customerId === c.id).map((t) => t.tag),
        openTicketsCount: ticketRows.filter((tk) => tk.customerId === c.id && tk.status !== 'CLOSED').length,
      };
    });

    const repeatCount = enriched.filter((c) => c.isRepeatCustomer).length;
    const totalCustomers = enriched.length;
    const retentionRatePercent =
      totalCustomers > 0 ? Number(((repeatCount / totalCustomers) * 100).toFixed(1)) : 0;

    return res.json({
      success: true,
      data: {
        customers: enriched,
        retention: {
          totalCustomers,
          repeatCustomers: repeatCount,
          vipCustomers: enriched.filter((c) => c.computedSegment === 'VIP').length,
          retentionRatePercent,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

adminOpsRouter.get('/crm/customers/:id', requirePermission('view'), async (req: AuthRequest, res, next) => {
  try {
    const [cust] = await db.select().from(customers).where(eq(customers.id, req.params.id)).limit(1);
    if (!cust) {
      throw new NotFoundError('Customer', req.requestId);
    }

    const [custOrders, custTags, custConvs, custTickets] = await Promise.all([
      db.select().from(orders).where(eq(orders.customerId, cust.id)).orderBy(desc(orders.createdAt)),
      db.select().from(customerTags).where(eq(customerTags.customerId, cust.id)),
      db.select().from(conversations).where(eq(conversations.customerId, cust.id)).orderBy(desc(conversations.lastMessageAt)),
      db.select().from(supportTickets).where(eq(supportTickets.customerId, cust.id)).orderBy(desc(supportTickets.createdAt)),
    ]);

    return res.json({
      success: true,
      data: {
        customer: cust,
        orders: custOrders,
        tags: custTags,
        conversations: custConvs,
        tickets: custTickets,
      },
    });
  } catch (err) {
    next(err);
  }
});

adminOpsRouter.post(
  '/crm/customers/:id/tags',
  requireAnyPermission('edit', 'approve'),
  async (req: AuthRequest, res, next) => {
    try {
      const tag = typeof req.body?.tag === 'string' ? req.body.tag.trim().toUpperCase().slice(0, 40) : '';
      if (!tag) {
        throw new ValidationError('Tag label is required.', undefined, req.requestId);
      }
      const [created] = await db
        .insert(customerTags)
        .values({
          customerId: req.params.id,
          tag,
          createdByUserId: req.principal!.userId,
        })
        .onConflictDoNothing()
        .returning();
      return res.status(201).json({ success: true, data: { tag: created ?? { tag } } });
    } catch (err) {
      next(err);
    }
  },
);

adminOpsRouter.patch(
  '/crm/customers/:id/notes',
  requireAnyPermission('edit', 'approve'),
  async (req: AuthRequest, res, next) => {
    try {
      const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim().slice(0, 1000) : '';
      const segment = typeof req.body?.segment === 'string' ? req.body.segment.trim() : undefined;
      const [updated] = await db
        .update(customers)
        .set({
          notes,
          ...(segment ? { segment } : {}),
          updatedAt: new Date(),
        })
        .where(eq(customers.id, req.params.id))
        .returning();
      if (!updated) {
        throw new NotFoundError('Customer', req.requestId);
      }
      return res.json({ success: true, data: { customer: updated } });
    } catch (err) {
      next(err);
    }
  },
);

// ============================================================================
// 5. NOTIFICATIONS & AUTOMATION SYSTEM
// ============================================================================

adminOpsRouter.get('/notifications/logs', requirePermission('view'), async (_req, res, next) => {
  try {
    const logs = await listNotificationLogs(100);
    return res.json({ success: true, data: { logs } });
  } catch (err) {
    next(err);
  }
});

adminOpsRouter.post('/notifications/:id/retry', requirePermission('approve'), async (req: AuthRequest, res, next) => {
  try {
    const updated = await attemptNotificationDelivery(req.params.id, {
      approvedByUserId: req.principal!.userId,
    });
    return res.json({ success: true, data: { notification: updated } });
  } catch (err) {
    next(err);
  }
});

adminOpsRouter.post('/notifications/test', requirePermission('manage_settings'), async (req: AuthRequest, res, next) => {
  try {
    const channel = (req.body?.channel as 'EMAIL' | 'SMS' | 'WHATSAPP' | 'IN_APP') || 'WHATSAPP';
    const recipient = String(req.body?.recipient || '01828298143');
    const templateKey = String(req.body?.templateKey || 'ORDER_CONFIRMATION');
    const simulateFailure = Boolean(req.body?.simulateFailure);
    const requiresApproval =
      typeof req.body?.requiresApproval === 'boolean' ? req.body.requiresApproval : undefined;

    const rendered = renderNotificationTemplate(templateKey, {
      customerName: String(req.body?.customerName || 'Valued Guest'),
      orderNumber: String(req.body?.orderNumber || 'SV-TEST-001'),
      totalBdt: String(req.body?.totalBdt || '1250'),
    });

    const log = await sendOrQueueNotification({
      channel,
      templateKey,
      recipient,
      subject: rendered.subject,
      body: rendered.body,
      requiresApproval,
      simulateFailure,
    });
    return res.status(201).json({ success: true, data: { notification: log } });
  } catch (err) {
    next(err);
  }
});

adminOpsRouter.get('/automation/jobs', requirePermission('view'), async (_req, res, next) => {
  try {
    const jobs = await listAutomationJobs(100);
    return res.json({
      success: true,
      data: {
        registry: AUTOMATION_EVENT_REGISTRY,
        jobs,
      },
    });
  } catch (err) {
    next(err);
  }
});

adminOpsRouter.post('/automation/jobs/:id/retry', requirePermission('approve'), async (req: AuthRequest, res, next) => {
  try {
    const simulateFailure = Boolean(req.body?.simulateFailure);
    const job = await executeAutomationJob(req.params.id, {
      simulateFailure,
      approvedByUserId: req.principal!.userId,
    });
    return res.json({ success: true, data: { job } });
  } catch (err) {
    next(err);
  }
});

adminOpsRouter.post('/automation/dispatch', requirePermission('manage_settings'), async (req: AuthRequest, res, next) => {
  try {
    const eventType = req.body?.eventType as AutomationEventType;
    const dedupeKey = String(req.body?.dedupeKey || `manual_${Date.now()}`);
    if (!eventType || !(eventType in AUTOMATION_EVENT_REGISTRY)) {
      throw new ValidationError('Valid automation eventType is required.', undefined, req.requestId);
    }
    const result = await dispatchAutomationEvent({
      eventType,
      dedupeKey,
      payload: (req.body?.payload as Record<string, unknown>) ?? {},
      simulateFailure: Boolean(req.body?.simulateFailure),
    });
    return res.status(result.deduplicated ? 200 : 201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 6. FINANCIAL REPORTS, EXPENSES, MARKETING ANALYTICS & SETTINGS
// ============================================================================

adminOpsRouter.get(
  '/reports/financial',
  requireAnyPermission('export', 'refund', 'manage_settings'),
  async (_req, res, next) => {
    try {
      const [report, expenses] = await Promise.all([
        generateFinancialReport(),
        db.select().from(businessExpenses).orderBy(desc(businessExpenses.expenseDate)).limit(50),
      ]);
      return res.json({ success: true, data: { report, expenses } });
    } catch (err) {
      next(err);
    }
  },
);

adminOpsRouter.get('/reports/financial/export', requirePermission('export'), async (_req, res, next) => {
  try {
    const report = await generateFinancialReport();
    const rows: [string, number | string, string][] = [
      ['gross_revenue', report.grossRevenueBdt, 'Non-cancelled orders'],
      ['delivered_revenue', report.deliveredRevenueBdt, 'Completed deliveries'],
      ['estimated_cogs', report.estimatedCogsBdt, 'Variant cost or 55% fallback'],
      ['estimated_gross_profit', report.estimatedGrossProfitBdt, 'Estimate only'],
      ['delivery_expenses', report.deliveryExpensesBdt, 'Courier/delivery charges'],
      ['gateway_fees', report.gatewayFeesBdt, 'Gateway fee deductions'],
      ['operating_expenses', report.operatingExpensesBdt, 'Recorded business expenses'],
      ['refunds_processed', report.refundsProcessedBdt, 'Approved/processed refunds'],
      ['estimated_net_profit', report.estimatedNetProfitBdt, 'Estimate only'],
      ['cod_pending_collection', report.codPendingCollectionBdt, 'Awaiting COD delivery/settlement'],
      ['payment_settled', report.paymentSettledBdt, 'Paid settlements'],
      ['inventory_cost_valuation', report.inventoryValuation.costValuationBdt, `Units: ${report.inventoryValuation.totalUnitsOnHand}`],
    ];
    const lines = [
      'metric,value_bdt,notes',
      ...rows.map(([m, v, n]) => [sanitizeCsvCell(m), sanitizeCsvCell(v), sanitizeCsvCell(n)].join(',')),
    ];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="she-valley-financial-summary.csv"');
    return res.send(lines.join('\n'));
  } catch (err) {
    next(err);
  }
});

const expenseSchema = z.object({
  category: z.enum(['PACKAGING', 'MARKETING', 'COURIER_ADJUSTMENT', 'OPERATIONS', 'STAFF', 'OTHER']).default('OPERATIONS'),
  title: z.string().trim().min(2).max(120),
  amountBdt: z.number().nonnegative(),
  notes: z.string().trim().max(300).optional(),
});

adminOpsRouter.post(
  '/expenses',
  requireAnyPermission('create', 'refund'),
  async (req: AuthRequest, res, next) => {
    try {
      const parsed = expenseSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Expense title and non-negative amount are required.', undefined, req.requestId);
      }
      const [expense] = await db
        .insert(businessExpenses)
        .values({
          category: parsed.data.category,
          title: parsed.data.title,
          amountBdt: parsed.data.amountBdt.toFixed(2),
          notes: parsed.data.notes ?? null,
          recordedByUserId: req.principal!.userId,
        })
        .returning();

      await recordAuditLog(db, {
        actorUserId: req.principal!.userId,
        actorRole: req.principal!.roles[0],
        action: 'EXPENSE_RECORDED',
        entityType: 'business_expenses',
        entityId: expense.id,
        afterState: { title: expense.title, amountBdt: expense.amountBdt },
        requestId: req.requestId || 'unknown',
      });

      return res.status(201).json({ success: true, data: { expense } });
    } catch (err) {
      next(err);
    }
  },
);

adminOpsRouter.get('/marketing/analytics', requirePermission('view'), async (_req, res, next) => {
  try {
    const rows = await db.select().from(marketingEvents).orderBy(desc(marketingEvents.createdAt)).limit(200);
    const countsByEvent: Record<string, number> = {};
    for (const r of rows) {
      countsByEvent[r.eventName] = (countsByEvent[r.eventName] ?? 0) + 1;
    }
    return res.json({
      success: true,
      data: {
        countsByEvent,
        recentEvents: rows.slice(0, 30),
      },
    });
  } catch (err) {
    next(err);
  }
});

adminOpsRouter.get('/settings/all', requirePermission('manage_settings'), async (_req, res, next) => {
  try {
    const rows = await db.select().from(settings);
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r.valueJson]));
    return res.json({ success: true, data: { settings: byKey } });
  } catch (err) {
    next(err);
  }
});

adminOpsRouter.patch('/categories/:id', requirePermission('edit'), async (req: AuthRequest, res, next) => {
  try {
    const isActive = typeof req.body?.isActive === 'boolean' ? req.body.isActive : undefined;
    const isReturnableByHygiene =
      typeof req.body?.isReturnableByHygiene === 'boolean' ? req.body.isReturnableByHygiene : undefined;
    const [updated] = await db
      .update(categories)
      .set({
        ...(isActive !== undefined ? { isActive } : {}),
        ...(isReturnableByHygiene !== undefined ? { isReturnableByHygiene } : {}),
        updatedAt: new Date(),
      })
      .where(eq(categories.id, req.params.id))
      .returning();
    if (!updated) {
      throw new NotFoundError('Category', req.requestId);
    }
    return res.json({ success: true, data: { category: updated } });
  } catch (err) {
    next(err);
  }
});
