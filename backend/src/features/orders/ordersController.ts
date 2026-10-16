import {
  BadRequestException,
  ConflictException,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  ParseUUIDPipe,
  Post,
  Res,
  UseGuards,
  Body,
  Query,
  Param,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwtAuthGuard.js';
// ValidationPipe needs the DTO classes at runtime for nested validation.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CreateOrderDto } from './createOrderDto.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ListOrdersDto } from './listOrdersDto.js';
import { toPublicOrder } from './ordersMapper.js';
import { DuplicateOrderNumberError } from './ordersTypes.js';
import { OrdersUseCases } from './ordersUseCases.js';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(@Inject(OrdersUseCases) private readonly orders: OrdersUseCases) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Header('Cache-Control', 'no-store')
  async create(
    @Body() input: CreateOrderDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ReturnType<typeof toPublicOrder>> {
    try {
      const order = await this.orders.create(input);
      response.location(`/api/v1/orders/${order.publicId}`);
      return toPublicOrder(order);
    } catch (error) {
      if (error instanceof DuplicateOrderNumberError) {
        throw new ConflictException('Número de pedido já cadastrado.');
      }
      throw error;
    }
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  async list(@Query() query: ListOrdersDto): Promise<{
    readonly data: ReturnType<typeof toPublicOrder>[];
    readonly meta: { readonly page: number; readonly pageSize: number; readonly total: number; readonly totalPages: number };
  }> {
    if (query.startDate && query.endDate && query.startDate > query.endDate) {
      throw new BadRequestException('startDate deve ser anterior ou igual a endDate.');
    }
    const page = await this.orders.findActive(query);
    return {
      data: page.rows.map(toPublicOrder),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total: page.total,
        totalPages: Math.ceil(page.total / query.pageSize),
      },
    };
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  async getById(@Param('id', new ParseUUIDPipe({ version: '4' })) publicId: string): Promise<ReturnType<typeof toPublicOrder>> {
    const order = await this.orders.findActiveByPublicId(publicId);
    if (!order) {
      throw new NotFoundException('Pedido não encontrado.');
    }
    return toPublicOrder(order);
  }
}
