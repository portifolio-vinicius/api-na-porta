export type OrderStatus = 'PENDING' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELED';

export interface CustomerModel {
  readonly name: string;
  readonly document: string;
}

export interface DeliveryAddressModel {
  readonly street: string;
  readonly number: string;
  readonly complement: string | null;
  readonly district: string;
  readonly city: string;
  readonly state: string;
  readonly postalCode: string;
  readonly country: string;
}

export interface OrderItemModel {
  readonly description: string;
  readonly price: string;
}

export interface OrderModel {
  readonly id: number;
  readonly publicId: string;
  readonly number: string;
  readonly expectedDeliveryDate: string;
  readonly status: OrderStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly customer: CustomerModel;
  readonly deliveryAddress: DeliveryAddressModel;
  readonly items: readonly OrderItemModel[];
}

export interface CreateOrderModel {
  readonly number: string;
  readonly expectedDeliveryDate: string;
  readonly customer: CustomerModel;
  readonly deliveryAddress: DeliveryAddressModel;
  readonly items: readonly OrderItemModel[];
}

export interface UpdateOrderModel {
  readonly number?: string;
  readonly expectedDeliveryDate?: string;
  readonly status?: OrderStatus;
  readonly customer?: CustomerModel;
  readonly deliveryAddress?: DeliveryAddressModel;
  readonly items?: readonly OrderItemModel[];
}

export class OrderRuleViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrderRuleViolation';
  }
}

const allowedTransitions: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  PENDING: ['IN_TRANSIT', 'CANCELED'],
  IN_TRANSIT: ['DELIVERED', 'CANCELED'],
  DELIVERED: [],
  CANCELED: [],
};

export function assertOrderUpdateAllowed(status: OrderStatus, update: UpdateOrderModel): void {
  if (status === 'DELIVERED' || status === 'CANCELED') {
    throw new OrderRuleViolation('Pedidos finalizados não podem ser editados.');
  }

  if (
    status === 'IN_TRANSIT' &&
    (update.number !== undefined || update.customer !== undefined || update.deliveryAddress !== undefined || update.items !== undefined)
  ) {
    throw new OrderRuleViolation('Em trânsito, somente a previsão de entrega ou o status pode mudar.');
  }

  if (update.status && update.status !== status) {
    if (!allowedTransitions[status].includes(update.status)) {
      throw new OrderRuleViolation('Transição de status não permitida.');
    }
  }
}
