import { IsEnum, IsString, IsOptional, validateSync } from 'class-validator';
import { Platform } from './platform';

export class ActorId {
  @IsEnum(Platform)
  platform!: Platform;

  @IsString()
  platformUserId!: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  static create(data: Partial<ActorId>): ActorId {
    const actor = Object.assign(new ActorId(), data);
    const errors = validateSync(actor);
    if (errors.length > 0) {
      throw new Error(`ActorId validation failed: ${JSON.stringify(errors)}`);
    }
    return actor;
  }
}
