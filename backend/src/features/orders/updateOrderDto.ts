import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsString,
  Length,
  Matches,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { CustomerDto, DeliveryAddressDto, OrderItemDto } from './createOrderDto.js';

const orderStatuses = ['PENDING', 'IN_TRANSIT', 'DELIVERED', 'CANCELED'] as const;

export class UpdateOrderDto {
  @ValidateIf((_object: UpdateOrderDto, value: unknown) => value !== undefined)
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @Length(1, 100)
  number?: string;

  @ValidateIf((_object: UpdateOrderDto, value: unknown) => value !== undefined)
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  expectedDeliveryDate?: string;

  @ValidateIf((_object: UpdateOrderDto, value: unknown) => value !== undefined)
  @IsIn(orderStatuses)
  status?: (typeof orderStatuses)[number];

  @ValidateIf((_object: UpdateOrderDto, value: unknown) => value !== undefined)
  @ValidateNested()
  @Type(() => CustomerDto)
  customer?: CustomerDto;

  @ValidateIf((_object: UpdateOrderDto, value: unknown) => value !== undefined)
  @ValidateNested()
  @Type(() => DeliveryAddressDto)
  deliveryAddress?: DeliveryAddressDto;

  @ValidateIf((_object: UpdateOrderDto, value: unknown) => value !== undefined)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items?: OrderItemDto[];
}
