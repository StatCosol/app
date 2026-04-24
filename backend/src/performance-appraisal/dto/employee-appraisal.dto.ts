import { IsNotEmpty, IsOptional, IsString, IsUUID, IsNumber, IsBoolean, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ReviewItemDto {
  @IsUUID() @IsOptional()
  itemId?: string;

  @IsString() @IsNotEmpty()
  itemName: string;

  @IsNumber() @IsOptional()
  rating?: number;

  @IsString() @IsOptional()
  remarks?: string;

  @IsString() @IsOptional()
  targetValue?: string;

  @IsString() @IsOptional()
  achievementValue?: string;
}

export class ManagerReviewDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => ReviewItemDto)
  items: ReviewItemDto[];

  @IsString() @IsOptional()
  recommendation?: string;

  @IsNumber() @IsOptional()
  recommendedIncrementPercent?: number;

  @IsNumber() @IsOptional()
  recommendedNewCtc?: number;

  @IsString() @IsOptional()
  remarks?: string;

  @IsBoolean() @IsOptional()
  pipRequired?: boolean;
}

export class BranchReviewDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => ReviewItemDto)
  items: ReviewItemDto[];

  @IsString() @IsOptional()
  recommendation?: string;

  @IsNumber() @IsOptional()
  recommendedIncrementPercent?: number;

  @IsNumber() @IsOptional()
  recommendedNewCtc?: number;

  @IsString() @IsOptional()
  remarks?: string;

  @IsBoolean() @IsOptional()
  pipRequired?: boolean;
}

export class ClientApproveDto {
  @IsString() @IsNotEmpty()
  action: 'APPROVE' | 'REJECT' | 'SEND_BACK';

  @IsString() @IsOptional()
  remarks?: string;

  @IsString() @IsOptional()
  recommendation?: string;

  @IsNumber() @IsOptional()
  recommendedIncrementPercent?: number;

  @IsNumber() @IsOptional()
  recommendedNewCtc?: number;
}

export class AppraisalFilterDto {
  @IsUUID() @IsOptional()
  clientId?: string;

  @IsUUID() @IsOptional()
  branchId?: string;

  @IsUUID() @IsOptional()
  cycleId?: string;

  @IsString() @IsOptional()
  departmentId?: string;

  @IsString() @IsOptional()
  designationId?: string;

  @IsString() @IsOptional()
  status?: string;

  @IsString() @IsOptional()
  recommendation?: string;

  @IsString() @IsOptional()
  search?: string;

  @IsNumber() @IsOptional()
  page?: number;

  @IsNumber() @IsOptional()
  pageSize?: number;
}
