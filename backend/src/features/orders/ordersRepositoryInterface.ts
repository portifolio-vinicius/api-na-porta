import type { CreateOrderModel, OrderModel, UpdateOrderModel } from './orderModel.js';
import type { OrderFilters, OrderListing } from './ordersTypes.js';

export interface OrdersRepositoryInterface {
  create(order: CreateOrderModel): Promise<OrderModel>;
  findActiveByPublicId(publicId: string): Promise<OrderModel | null>;
  findActive(filters: OrderFilters, withVersion?: boolean): Promise<OrderListing>;
  getCacheVersion(): Promise<bigint>;
  updateActive(publicId: string, changes: UpdateOrderModel): Promise<OrderModel | null>;
  softDeleteActive(publicId: string): Promise<boolean>;
}
