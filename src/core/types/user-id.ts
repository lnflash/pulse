import { IsUUID, validateSync } from 'class-validator';
import { v4 as uuidv4 } from 'uuid';

export class UserId {
  @IsUUID()
  value!: string;

  static create(uuid: string): UserId {
    const userId = Object.assign(new UserId(), { value: uuid });
    const errors = validateSync(userId);
    if (errors.length > 0) {
      throw new Error(`UserId validation failed: ${JSON.stringify(errors)}`);
    }
    return userId;
  }

  static generate(): UserId {
    return UserId.create(uuidv4());
  }

  toString(): string {
    return this.value;
  }
}
