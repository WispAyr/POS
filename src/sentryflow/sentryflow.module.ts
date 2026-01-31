import { Module } from '@nestjs/common';
import { SentryflowController } from './sentryflow.controller';
import { SentryflowService } from './sentryflow.service';

@Module({
  controllers: [SentryflowController],
  providers: [SentryflowService],
  exports: [SentryflowService],
})
export class SentryflowModule {}
