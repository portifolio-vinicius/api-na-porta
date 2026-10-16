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
