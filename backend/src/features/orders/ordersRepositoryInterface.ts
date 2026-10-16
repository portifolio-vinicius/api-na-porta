import type { CreateOrderModel, OrderModel } from './orderModel.js';
import type { OrderFilters, OrderPage } from './ordersTypes.js';

export interface OrdersRepositoryInterface {
  create(order: CreateOrderModel): Promise<OrderModel>;
  findActiveByPublicId(publicId: string): Promise<OrderModel | null>;
  findActive(filters: OrderFilters): Promise<OrderPage>;
}
