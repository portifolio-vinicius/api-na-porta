import { Inject, Injectable } from '@nestjs/common';
import type { CreateOrderModel, OrderModel, UpdateOrderModel } from './orderModel.js';
import { ORDERS_REPOSITORY } from './ordersTypes.js';
import type { OrderFilters, OrderPage } from './ordersTypes.js';
import type { OrdersRepositoryInterface } from './ordersRepositoryInterface.js';

@Injectable()
export class OrdersUseCases {
  constructor(@Inject(ORDERS_REPOSITORY) private readonly repository: OrdersRepositoryInterface) {}

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
    return this.repository.findActive(filters);
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
