import type { OrderModel } from './orderModel.js';
import type { PublicOrder } from './ordersTypes.js';

export function toPublicOrder(order: OrderModel): PublicOrder {
  return {
    id: order.publicId,
    number: order.number,
    expectedDeliveryDate: order.expectedDeliveryDate,
    status: order.status,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    customer: order.customer,
    deliveryAddress: order.deliveryAddress,
    items: order.items,
  };
}
