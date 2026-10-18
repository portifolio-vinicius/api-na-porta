import type { CacheInterface, CacheOutcome } from '../../shared/cache/cacheTypes.js';
import type { CreateOrderModel, OrderModel, UpdateOrderModel } from './orderModel.js';
import type { OrderFilters, OrderPage } from './ordersTypes.js';
import type { OrdersRepositoryInterface } from './ordersRepositoryInterface.js';

export class OrdersUseCases {
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
      return this.repository.findActive(filters);
    }
    const version = await this.repository.getCacheVersion();
    const key = `${version}:${JSON.stringify(filters)}`;
    let cached: OrderPage | null = null;
    let cacheFailed = false;
    try {
      cached = await this.cache.get<OrderPage>('orders', key);
    } catch {
      cacheFailed = true;
      // Cache is optional; the repository remains the source of truth.
    }
    if (cached && await this.repository.getCacheVersion() === version) {
      try {
        const rows = cached.rows.map((order) => ({
          ...order,
          createdAt: new Date(order.createdAt),
          updatedAt: new Date(order.updatedAt),
        }));
        if (rows.every((order) => Number.isFinite(order.createdAt.getTime()) && Number.isFinite(order.updatedAt.getTime()))) {
          this.recordCacheOutcome('hit');
          return { rows, total: cached.total };
        }
      } catch {
        // Invalid cache entries are treated as misses.
      }
    }
    this.recordCacheOutcome(cacheFailed ? 'bypass' : 'miss');
    const page = await this.repository.findActive(filters);
    if (await this.repository.getCacheVersion() === version) {
      await this.cache.set('orders', key, page, 60).catch(() => undefined);
    }
    return page;
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
