import { Transform } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';
import type { OrderStatus } from './orderModel.js';

const orderStatuses: readonly OrderStatus[] = ['PENDING', 'IN_TRANSIT', 'DELIVERED', 'CANCELED'];

export class ListOrdersDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @Length(1, 100)
  number?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate?: string;

  @IsOptional()
  @IsIn(orderStatuses)
  status?: OrderStatus;

  @Transform(({ value }: { value: unknown }) => value === undefined ? 1 : Number(value))
  @IsInt()
  @Min(1)
  @Max(21474836)
  page = 1;

  @Transform(({ value }: { value: unknown }) => value === undefined ? 20 : Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}
