import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../shared/database/prismaService.js';
import type { CreateOrderModel, OrderModel } from './orderModel.js';
import { DuplicateOrderNumberError } from './ordersTypes.js';
import type { OrderFilters, OrderPage } from './ordersTypes.js';
import type { OrdersRepositoryInterface } from './ordersRepositoryInterface.js';

const orderRelations = {
  customer: true,
  address: true,
  items: true,
} satisfies Prisma.OrderInclude;

type OrderWithRelations = Prisma.OrderGetPayload<{ include: typeof orderRelations }>;

@Injectable()
export class OrdersRepository implements OrdersRepositoryInterface {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async create(order: CreateOrderModel): Promise<OrderModel> {
    try {
      const created = await this.prisma.$transaction(async (transaction) => {
        const row = await transaction.order.create({
          data: {
            publicId: randomUUID(),
            number: order.number,
            expectedDeliveryDate: new Date(`${order.expectedDeliveryDate}T00:00:00.000Z`),
            customer: { create: order.customer },
            address: { create: order.deliveryAddress },
            items: { create: order.items.map((item) => ({ ...item, price: new Prisma.Decimal(item.price) })) },
          },
          include: orderRelations,
        });
        await transaction.cacheVersion.update({
          where: { namespace: 'orders' },
          data: { version: { increment: 1 } },
        });
        return row;
      });
      return mapOrder(created);
    } catch (error) {
      const uniqueTarget = error instanceof Prisma.PrismaClientKnownRequestError
        ? error.meta?.target
        : undefined;
      const numberConflict = Array.isArray(uniqueTarget)
        ? uniqueTarget.includes('number')
        : typeof uniqueTarget === 'string' && uniqueTarget.includes('number');
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        numberConflict
      ) {
        throw new DuplicateOrderNumberError();
      }
      throw error;
    }
  }

  async findActiveByPublicId(publicId: string): Promise<OrderModel | null> {
    const row = await this.prisma.order.findFirst({
      where: { publicId, deletedAt: null },
      include: orderRelations,
    });
    return row ? mapOrder(row) : null;
  }

  async findActive(filters: OrderFilters): Promise<OrderPage> {
    const startDate = filters.startDate
      ? new Date(`${filters.startDate}T00:00:00.000Z`)
      : undefined;
    const endDate = filters.endDate
      ? new Date(`${filters.endDate}T00:00:00.000Z`)
      : undefined;
    const where: Prisma.OrderWhereInput = {
      deletedAt: null,
      ...(filters.number ? { number: filters.number } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(startDate || endDate
        ? { expectedDeliveryDate: { ...(startDate ? { gte: startDate } : {}), ...(endDate ? { lte: endDate } : {}) } }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        include: orderRelations,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      this.prisma.order.count({ where }),
    ]);
    return { rows: rows.map(mapOrder), total };
  }
}

function mapOrder(row: OrderWithRelations): OrderModel {
  if (!row.customer || !row.address) {
    throw new Error('Pedido sem snapshot obrigatório no banco.');
  }
  return {
    id: row.id,
    publicId: row.publicId,
    number: row.number,
    expectedDeliveryDate: row.expectedDeliveryDate.toISOString().slice(0, 10),
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    customer: { name: row.customer.name, document: row.customer.document },
    deliveryAddress: {
      street: row.address.street,
      number: row.address.number,
      complement: row.address.complement,
      district: row.address.district,
      city: row.address.city,
      state: row.address.state,
      postalCode: row.address.postalCode,
      country: row.address.country,
    },
    items: row.items.map((item) => ({ description: item.description, price: item.price.toFixed(2) })),
  };
}
