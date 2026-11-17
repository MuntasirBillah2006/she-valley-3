import { desc, eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { orders, orderStatusHistory, settings, shipments } from '../../db/schema.ts';
import { BusinessRuleError, NotFoundError, UnauthorizedError } from '../../lib/errors.ts';
import { recordAuditLog } from '../audit.ts';
import { dispatchAutomationEvent, verifyHmacSignature } from './automationService.ts';

export type CourierProviderCode = 'PATHAO' | 'STEADFAST' | 'REDX' | 'PAPERFLY' | 'ECOURIER' | 'MANUAL';

export type ShipmentStatus =
  | 'PENDING_BOOKING'
  | 'BOOKED'
  | 'PICKED_UP'
  | 'IN_TRANSIT'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'FAILED_DELIVERY'
  | 'RETURN_INITIATED'
  | 'RETURNED'
  | 'EXCHANGE_REQUESTED';

export interface CourierProviderStatus {
  provider: CourierProviderCode;
  name: string;
  enabled: boolean;
  connectionStatus: 'ACTIVE' | 'SANDBOX' | 'PENDING_CREDENTIALS';
  credentialsConfigured: boolean;
  note: string;
}

export async function getCourierConfig() {
  const [row] = await db.select().from(settings).where(eq(settings.key, 'courier_config')).limit(1);
  return (
    (row?.valueJson as {
      defaultProvider?: CourierProviderCode;
      discreetParcelLabelDefault?: boolean;
      hideInnerwearDescriptionOnLabel?: boolean;
      sandboxDispatchAllowed?: boolean;
      providers?: Record<string, { enabled?: boolean; mode?: string }>;
    }) ?? {
      defaultProvider: 'STEADFAST',
      discreetParcelLabelDefault: true,
      hideInnerwearDescriptionOnLabel: true,
      sandboxDispatchAllowed: process.env.NODE_ENV !== 'production',
      providers: {},
    }
  );
}

export async function getCourierProvidersStatus(): Promise<CourierProviderStatus[]> {
  const cfg = await getCourierConfig();
  const isProd = process.env.NODE_ENV === 'production';

  const statusOf = (configured: boolean, provider: CourierProviderCode): 'ACTIVE' | 'SANDBOX' | 'PENDING_CREDENTIALS' => {
    if (provider === 'MANUAL') return 'ACTIVE';
    if (configured) return 'SANDBOX';
    if (cfg.sandboxDispatchAllowed && !isProd) return 'PENDING_CREDENTIALS';
    return 'PENDING_CREDENTIALS';
  };

  return [
    {
      provider: 'PATHAO',
      name: 'Pathao Courier',
      enabled: cfg.providers?.PATHAO?.enabled ?? true,
      credentialsConfigured: Boolean(process.env.PATHAO_CLIENT_ID),
      connectionStatus: statusOf(Boolean(process.env.PATHAO_CLIENT_ID), 'PATHAO'),
      note: process.env.PATHAO_CLIENT_ID
        ? 'Pathao merchant credentials configured.'
        : 'Pending Credentials: configure PATHAO_CLIENT_ID & PATHAO_CLIENT_SECRET.',
    },
    {
      provider: 'STEADFAST',
      name: 'Steadfast Courier',
      enabled: cfg.providers?.STEADFAST?.enabled ?? true,
      credentialsConfigured: Boolean(process.env.STEADFAST_API_KEY),
      connectionStatus: statusOf(Boolean(process.env.STEADFAST_API_KEY), 'STEADFAST'),
      note: process.env.STEADFAST_API_KEY
        ? 'Steadfast API key configured.'
        : 'Pending Credentials: configure STEADFAST_API_KEY & STEADFAST_SECRET_KEY.',
    },
    {
      provider: 'REDX',
      name: 'REDX Logistics',
      enabled: cfg.providers?.REDX?.enabled ?? true,
      credentialsConfigured: Boolean(process.env.REDX_API_TOKEN),
      connectionStatus: statusOf(Boolean(process.env.REDX_API_TOKEN), 'REDX'),
      note: process.env.REDX_API_TOKEN
        ? 'REDX API token configured.'
        : 'Pending Credentials: configure REDX_API_TOKEN.',
    },
    {
      provider: 'PAPERFLY',
      name: 'Paperfly',
      enabled: cfg.providers?.PAPERFLY?.enabled ?? true,
      credentialsConfigured: false,
      connectionStatus: statusOf(false, 'PAPERFLY'),
      note: 'Pending Credentials: adapter ready for Paperfly merchant credentials.',
    },
    {
      provider: 'ECOURIER',
      name: 'eCourier',
      enabled: cfg.providers?.ECOURIER?.enabled ?? true,
      credentialsConfigured: false,
      connectionStatus: statusOf(false, 'ECOURIER'),
      note: 'Pending Credentials: adapter ready for eCourier merchant credentials.',
    },
    {
      provider: 'MANUAL',
      name: 'Manual Dispatch Rider',
      enabled: true,
      credentialsConfigured: true,
      connectionStatus: 'ACTIVE',
      note: 'Active fallback for local Dhaka direct rider handoff.',
    },
  ];
}

export async function createShipmentParcel(params: {
  orderId: string;
  provider: CourierProviderCode;
  deliveryChargeBdt?: number;
  discreetLabel?: boolean;
  actorUserId: string;
  requestId: string;
}) {
  const [order] = await db.select().from(orders).where(eq(orders.id, params.orderId)).limit(1);
  if (!order) {
    throw new NotFoundError('Order', params.requestId);
  }
  if (order.status === 'CANCELLED') {
    throw new BusinessRuleError('Cannot create a parcel for a cancelled order.', undefined, params.requestId);
  }

  const cfg = await getCourierConfig();
  const statuses = await getCourierProvidersStatus();
  const provStatus = statuses.find((s) => s.provider === params.provider);

  const connectionMode =
    params.provider === 'MANUAL'
      ? 'MANUAL'
      : provStatus?.credentialsConfigured
        ? 'LIVE'
        : 'SANDBOX';

  if (connectionMode === 'SANDBOX' && process.env.NODE_ENV === 'production' && !cfg.sandboxDispatchAllowed) {
    throw new BusinessRuleError(
      `${params.provider} credentials are missing for live production dispatch.`,
      undefined,
      params.requestId,
    );
  }

  const consignmentId = `${params.provider.slice(0, 3)}-${Date.now().toString().slice(-6)}-${Math.random()
    .toString(36)
    .slice(2, 5)
    .toUpperCase()}`;
  const trackingCode = `SVTRK-${order.orderNumber.slice(-4)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const codToCollect = order.paymentMethod === 'COD' && order.paymentStatus !== 'PAID' ? Number(order.totalBdt) : 0;
  const courierCost = params.deliveryChargeBdt ?? Number(order.deliveryFeeBdt);
  const discreetLabel = params.discreetLabel ?? cfg.discreetParcelLabelDefault ?? true;

  const initialEvents = [
    {
      status: 'BOOKED',
      timestamp: new Date().toISOString(),
      note: discreetLabel
        ? 'Discreet plain parcel booked (item description omitted for customer privacy)'
        : 'Parcel booked',
    },
  ];

  const [shipment] = await db
    .insert(shipments)
    .values({
      orderId: order.id,
      provider: params.provider,
      consignmentId,
      trackingCode,
      status: 'BOOKED',
      codAmountToCollectBdt: codToCollect.toFixed(2),
      deliveryChargeBdt: courierCost.toFixed(2),
      discreetLabel,
      connectionMode,
      rawTrackingEvents: initialEvents,
      dispatchedAt: new Date(),
    })
    .returning();

  await db.insert(orderStatusHistory).values({
    orderId: order.id,
    fromStatus: order.status,
    toStatus: order.status,
    note: `Parcel booked via ${params.provider} (Tracking: ${trackingCode})`,
    isInternalNote: false,
    actorUserId: params.actorUserId,
  });

  await recordAuditLog(db, {
    actorUserId: params.actorUserId,
    actorRole: 'STAFF',
    action: 'COURIER_PARCEL_BOOKED',
    entityType: 'shipments',
    entityId: shipment.id,
    afterState: { provider: params.provider, consignmentId, trackingCode, connectionMode },
    requestId: params.requestId,
  });

  return shipment;
}

export async function updateShipmentStatus(params: {
  shipmentId: string;
  status: ShipmentStatus;
  note?: string;
  codCollectedBdt?: number;
  actorUserId?: string | null;
  viaWebhook?: boolean;
  requestId: string;
}) {
  const result = await db.transaction(async (tx) => {
    const [ship] = await tx.select().from(shipments).where(eq(shipments.id, params.shipmentId)).limit(1);
    if (!ship) {
      throw new NotFoundError('Shipment', params.requestId);
    }

    const existingEvents = Array.isArray(ship.rawTrackingEvents) ? ship.rawTrackingEvents : [];
    const nextEvents = [
      ...existingEvents,
      {
        status: params.status,
        timestamp: new Date().toISOString(),
        note: params.note || `Updated to ${params.status}`,
      },
    ];

    const [updated] = await tx
      .update(shipments)
      .set({
        status: params.status,
        codCollectedBdt:
          params.codCollectedBdt !== undefined ? params.codCollectedBdt.toFixed(2) : ship.codCollectedBdt,
        deliveredAt: params.status === 'DELIVERED' ? new Date() : ship.deliveredAt,
        rawTrackingEvents: nextEvents,
        updatedAt: new Date(),
      })
      .where(eq(shipments.id, ship.id))
      .returning();

    const [order] = await tx.select().from(orders).where(eq(orders.id, ship.orderId)).limit(1);
    if (order) {
      const orderStatusMap: Partial<Record<ShipmentStatus, string>> = {
        PICKED_UP: 'SHIPPED',
        IN_TRANSIT: 'SHIPPED',
        OUT_FOR_DELIVERY: 'SHIPPED',
        DELIVERED: 'DELIVERED',
        FAILED_DELIVERY: 'FAILED_DELIVERY',
        RETURNED: 'RETURNED',
      };
      const mappedOrderStatus = orderStatusMap[params.status];
      if (mappedOrderStatus && mappedOrderStatus !== order.status) {
        await tx
          .update(orders)
          .set({ status: mappedOrderStatus, updatedAt: new Date() })
          .where(eq(orders.id, order.id));
      }

      await tx.insert(orderStatusHistory).values({
        orderId: order.id,
        fromStatus: order.status,
        toStatus: mappedOrderStatus || order.status,
        note: `Courier ${ship.provider}: ${params.status}${params.note ? ` — ${params.note}` : ''}`,
        isInternalNote: false,
        actorUserId: params.actorUserId ?? null,
      });
    }

    await recordAuditLog(tx, {
      actorUserId: params.actorUserId ?? null,
      actorRole: params.viaWebhook ? 'WEBHOOK' : 'STAFF',
      action: 'SHIPMENT_STATUS_UPDATED',
      entityType: 'shipments',
      entityId: ship.id,
      beforeState: { status: ship.status },
      afterState: { status: params.status, codCollectedBdt: params.codCollectedBdt },
      requestId: params.requestId,
    });

    return { shipment: updated, order };
  });

  await dispatchAutomationEvent({
    eventType: 'COURIER_STATUS_ORDER_TIMELINE',
    dedupeKey: `courier_${result.shipment.id}_${params.status}`,
    payload: { shipmentId: result.shipment.id, orderId: result.shipment.orderId, status: params.status },
  });

  if (params.status === 'DELIVERED' && result.order) {
    await dispatchAutomationEvent({
      eventType: 'DELIVERED_ORDER_FEEDBACK_REQUEST',
      dedupeKey: `delivered_feedback_${result.order.id}`,
      payload: {
        orderId: result.order.id,
        orderNumber: result.order.orderNumber,
        customerName: result.order.guestName,
        phone: result.order.guestPhone,
      },
    });
  }

  return result.shipment;
}

export async function processCourierWebhook(params: {
  provider: string;
  rawBody: string;
  signatureHeader: string | undefined;
  payload: { consignmentId: string; status: ShipmentStatus; note?: string; codCollectedBdt?: number };
  requestId: string;
}) {
  const secret = process.env.COURIER_WEBHOOK_SECRET || 'shevalley-dev-courier-secret';
  if (!verifyHmacSignature(params.rawBody, params.signatureHeader, secret)) {
    throw new UnauthorizedError('Invalid courier webhook signature.', params.requestId);
  }

  const [ship] = await db
    .select()
    .from(shipments)
    .where(eq(shipments.consignmentId, params.payload.consignmentId))
    .limit(1);

  if (!ship) {
    throw new NotFoundError('Shipment consignment', params.requestId);
  }

  return updateShipmentStatus({
    shipmentId: ship.id,
    status: params.payload.status,
    note: params.payload.note,
    codCollectedBdt: params.payload.codCollectedBdt,
    viaWebhook: true,
    requestId: params.requestId,
  });
}

export async function settleShipmentCod(params: {
  shipmentId: string;
  codCollectedBdt: number;
  actorUserId: string;
  requestId: string;
}) {
  const [ship] = await db.select().from(shipments).where(eq(shipments.id, params.shipmentId)).limit(1);
  if (!ship) {
    throw new NotFoundError('Shipment', params.requestId);
  }

  const [updated] = await db
    .update(shipments)
    .set({
      codCollectedBdt: params.codCollectedBdt.toFixed(2),
      codSettled: true,
      settledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(shipments.id, ship.id))
    .returning();

  await recordAuditLog(db, {
    actorUserId: params.actorUserId,
    actorRole: 'STAFF',
    action: 'COURIER_COD_SETTLED',
    entityType: 'shipments',
    entityId: ship.id,
    afterState: { codCollectedBdt: params.codCollectedBdt },
    requestId: params.requestId,
  });

  return updated;
}

export async function listShipmentsAndReport() {
  const [rows, orderRows] = await Promise.all([
    db.select().from(shipments).orderBy(desc(shipments.createdAt)),
    db.select({ id: orders.id, orderNumber: orders.orderNumber, guestName: orders.guestName, deliveryZone: orders.deliveryZone }).from(orders),
  ]);
  const orderMap = new Map(orderRows.map((o) => [o.id, o]));

  const performanceByProvider: Record<
    string,
    { total: number; delivered: number; failed: number; returned: number; codSettledBdt: number; deliveryCostBdt: number }
  > = {};

  for (const s of rows) {
    if (!performanceByProvider[s.provider]) {
      performanceByProvider[s.provider] = {
        total: 0,
        delivered: 0,
        failed: 0,
        returned: 0,
        codSettledBdt: 0,
        deliveryCostBdt: 0,
      };
    }
    const p = performanceByProvider[s.provider];
    p.total += 1;
    if (s.status === 'DELIVERED') p.delivered += 1;
    if (s.status === 'FAILED_DELIVERY') p.failed += 1;
    if (s.status === 'RETURNED' || s.status === 'RETURN_INITIATED') p.returned += 1;
    if (s.codSettled) p.codSettledBdt += Number(s.codCollectedBdt);
    p.deliveryCostBdt += Number(s.deliveryChargeBdt);
  }

  return {
    shipments: rows.map((s) => ({ ...s, order: orderMap.get(s.orderId) ?? null })),
    performanceByProvider,
  };
}
