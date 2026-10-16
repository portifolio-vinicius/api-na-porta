import type { CreateOrderModel, OrderModel, UpdateOrderModel } from './orderModel.js';
import type { OrderFilters, OrderPage } from './ordersTypes.js';

export interface OrdersRepositoryInterface {
  create(order: CreateOrderModel): Promise<OrderModel>;
  findActiveByPublicId(publicId: string): Promise<OrderModel | null>;
  findActive(filters: OrderFilters): Promise<OrderPage>;
  getCacheVersion(): Promise<bigint>;
  updateActive(publicId: string, changes: UpdateOrderModel): Promise<OrderModel | null>;
  softDeleteActive(publicId: string): Promise<boolean>;
}
