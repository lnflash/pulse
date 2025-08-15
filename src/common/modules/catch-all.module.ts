import { Module } from '@nestjs/common';
import { CatchAllController } from '../controllers/catch-all.controller';

/**
 * Module for catch-all controller
 * This should be imported LAST in the app module to ensure
 * all other routes are registered first
 */
@Module({
  controllers: [CatchAllController],
})
export class CatchAllModule {}