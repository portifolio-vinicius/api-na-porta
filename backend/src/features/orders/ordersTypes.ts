import type { OrderModel, OrderStatus } from './orderModel.js';

export const ORDERS_REPOSITORY = Symbol('ORDERS_REPOSITORY');

export interface OrderFilters {
  readonly number?: string;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly status?: OrderStatus;
  readonly page: number;
  readonly pageSize: number;
}

export interface OrderPage {
  readonly rows: readonly OrderModel[];
  readonly total: number;
}

export interface OrderListing extends OrderPage {
  readonly version: bigint | null;
}

export interface PublicOrder {
  readonly id: string;
  readonly number: string;
  readonly expectedDeliveryDate: string;
  readonly status: OrderStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly customer: OrderModel['customer'];
  readonly deliveryAddress: OrderModel['deliveryAddress'];
  readonly items: OrderModel['items'];
}

export class DuplicateOrderNumberError extends Error {
  constructor() {
    super('Número de pedido duplicado.');
    this.name = 'DuplicateOrderNumberError';
  }
}
