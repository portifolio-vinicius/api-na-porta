import { Inject, Injectable } from '@nestjs/common';
import { CACHE_INTERFACE } from '../../shared/cache/cacheTypes.js';
import type { CacheInterface } from '../../shared/cache/cacheTypes.js';
import type { CreateOrderModel, OrderModel, UpdateOrderModel } from './orderModel.js';
import { ORDERS_REPOSITORY } from './ordersTypes.js';
import type { OrderFilters, OrderPage } from './ordersTypes.js';
import type { OrdersRepositoryInterface } from './ordersRepositoryInterface.js';

@Injectable()
export class OrdersUseCases {
  constructor(
    @Inject(ORDERS_REPOSITORY) private readonly repository: OrdersRepositoryInterface,
    @Inject(CACHE_INTERFACE) private readonly cache: CacheInterface,
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
    const version = await this.repository.getCacheVersion();
    const key = `${version}:${JSON.stringify(filters)}`;
    let cached: OrderPage | null = null;
    try {
      cached = await this.cache.get<OrderPage>('orders', key);
    } catch {
      // Cache is optional; the repository remains the source of truth.
    }
    if (cached) return cached;
    const page = await this.repository.findActive(filters);
    await this.cache.set('orders', key, page, 60).catch(() => undefined);
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
