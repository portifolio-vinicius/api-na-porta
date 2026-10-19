import type { CacheInterface, CacheOutcome } from '../../shared/cache/cacheTypes.js';
import type { CreateOrderModel, OrderModel, UpdateOrderModel } from './orderModel.js';
import type { OrderFilters, OrderPage } from './ordersTypes.js';
import type { OrdersRepositoryInterface } from './ordersRepositoryInterface.js';

const maxInflightLists = 64;

interface CachedOrderRow extends Omit<OrderModel, 'createdAt' | 'updatedAt'> {
  readonly createdAt: string | Date;
  readonly updatedAt: string | Date;
}

interface CachedOrderPage {
  readonly version: string;
  readonly total: number;
  readonly rows: readonly CachedOrderRow[];
}

export class OrdersUseCases {
  private readonly inflight = new Map<string, Promise<OrderPage>>();

  constructor(
    private readonly repository: OrdersRepositoryInterface,
    private readonly cache: CacheInterface,
    private readonly recordCacheOutcome: (outcome: CacheOutcome) => void = () => undefined,
  ) {}

  create(order: CreateOrderModel): Promise<OrderModel> {
    const normalized: CreateOrderModel = {
      ...order,
      number: order.number.trim(),
      customer: { ...order.customer, name: order.customer.name.trim(), document: order.customer.document.trim() },
      deliveryAddress: {
        ...order.deliveryAddress,
        street: order.deliveryAddress.street.trim(),
        number: order.deliveryAddress.number.trim(),
        complement: order.deliveryAddress.complement?.trim() || null,
        district: order.deliveryAddress.district.trim(),
        city: order.deliveryAddress.city.trim(),
        state: order.deliveryAddress.state.trim().toUpperCase(),
        postalCode: order.deliveryAddress.postalCode.trim(),
        country: order.deliveryAddress.country.trim().toUpperCase(),
      },
      items: order.items.map((item) => ({ ...item, description: item.description.trim() })),
    };
    return this.repository.create(normalized);
  }

  findActiveByPublicId(publicId: string): Promise<OrderModel | null> {
    return this.repository.findActiveByPublicId(publicId);
  }

  findActive(filters: OrderFilters): Promise<OrderPage> {
    return this.findActiveWithCache(filters);
  }

  private async findActiveWithCache(filters: OrderFilters): Promise<OrderPage> {
    if (this.cache.enabled === false) {
      this.recordCacheOutcome('bypass');
      const page = await this.repository.findActive(filters);
      return { rows: page.rows, total: page.total };
    }
    const key = JSON.stringify(filters);
    let cacheFailed = false;
    const cachedPromise = this.cache.get<CachedOrderPage>('orders', key).catch(() => {
      cacheFailed = true;
      return null;
    });
    const version = await this.repository.getCacheVersion();
    const cached = await cachedPromise;
    if (cached?.version === version.toString() && await this.repository.getCacheVersion() === version) {
      const revived = reviveCachedPage(cached);
      if (revived) {
        this.recordCacheOutcome('hit');
        return revived;
      }
    }
    this.recordCacheOutcome(cacheFailed ? 'bypass' : 'miss');
    return this.loadShared(version, key, filters);
  }

  // Same version and filters share one primary read. A newer version never reuses that promise.
  private loadShared(version: bigint, key: string, filters: OrderFilters): Promise<OrderPage> {
    const flightKey = `${version.toString()}:${key}`;
    const existing = this.inflight.get(flightKey);
    if (existing) return existing;
    if (this.inflight.size >= maxInflightLists) return this.loadFresh(version, key, filters);
    const pending = this.loadFresh(version, key, filters);
    this.inflight.set(flightKey, pending);
    const release = (): void => {
      if (this.inflight.get(flightKey) === pending) this.inflight.delete(flightKey);
    };
    // Handle both outcomes without creating an unobserved rejected cleanup promise.
    void pending.then(release, release);
    return pending;
  }

  private async loadFresh(version: bigint, key: string, filters: OrderFilters): Promise<OrderPage> {
    const listing = await this.repository.findActive(filters, true);
    if (listing.version === version) {
      const stored: CachedOrderPage = { version: version.toString(), total: listing.total, rows: listing.rows };
      await this.cache.set('orders', key, stored, 60).catch(() => undefined);
    }
    return { rows: listing.rows, total: listing.total };
  }

  update(publicId: string, changes: UpdateOrderModel): Promise<OrderModel | null> {
    const normalized: UpdateOrderModel = {
      ...changes,
      ...(changes.number !== undefined ? { number: changes.number.trim() } : {}),
      ...(changes.customer
        ? { customer: { name: changes.customer.name.trim(), document: changes.customer.document.trim() } }
        : {}),
      ...(changes.deliveryAddress
        ? {
            deliveryAddress: {
              ...changes.deliveryAddress,
              street: changes.deliveryAddress.street.trim(),
              number: changes.deliveryAddress.number.trim(),
              complement: changes.deliveryAddress.complement?.trim() || null,
              district: changes.deliveryAddress.district.trim(),
              city: changes.deliveryAddress.city.trim(),
              state: changes.deliveryAddress.state.trim().toUpperCase(),
              postalCode: changes.deliveryAddress.postalCode.trim(),
              country: changes.deliveryAddress.country.trim().toUpperCase(),
            },
          }
        : {}),
      ...(changes.items
        ? { items: changes.items.map((item) => ({ ...item, description: item.description.trim() })) }
        : {}),
    };
    return this.repository.updateActive(publicId, normalized);
  }

  softDelete(publicId: string): Promise<boolean> {
    return this.repository.softDeleteActive(publicId);
  }
}

function reviveCachedPage(cached: CachedOrderPage): OrderPage | null {
  if (!Number.isInteger(cached.total) || cached.total < 0 || !Array.isArray(cached.rows) || cached.rows.length > 100) {
    return null;
  }
  try {
    const rows = cached.rows.map((order) => ({
      ...order,
      createdAt: new Date(order.createdAt),
      updatedAt: new Date(order.updatedAt),
    }));
    if (rows.every((order) => Number.isFinite(order.createdAt.getTime()) && Number.isFinite(order.updatedAt.getTime()))) {
      return { rows, total: cached.total };
    }
  } catch {
    return null;
  }
  return null;
}
