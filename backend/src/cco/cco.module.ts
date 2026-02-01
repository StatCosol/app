import { Module } from '@nestjs/common';
import { CcoController } from './cco.controller';
import { CcoService } from './cco.service';

@Module({
  controllers: [CcoController],
  providers: [CcoService],
})
export class CcoModule {}
