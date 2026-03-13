import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationEntity } from './entities/notification.entity';
import { NotificationMessageEntity } from './entities/notification-message.entity';
import { NotificationReadEntity } from './entities/notification-read.entity';
import { NotificationThread } from './entities/notification-thread.entity';
import { NotificationsService } from './notifications.service';
import { AdminNotificationsController } from './admin-notifications.controller';
import { ClientAssignmentCurrentEntity } from '../assignments/entities/client-assignment-current.entity';
import { NotificationsController } from './notifications.controller';
import { NotificationsInboxController } from './notifications-inbox.controller';
import { NotificationsInboxService } from './notifications-inbox.service';
import { AuthModule } from '../auth/auth.module';
import { AssignmentsModule } from '../assignments/assignments.module';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      NotificationEntity,
      NotificationMessageEntity,
      NotificationReadEntity,
      NotificationThread,
      ClientAssignmentCurrentEntity,
    ]),
    forwardRef(() => AssignmentsModule),
  ],
  controllers: [
    AdminNotificationsController,
    NotificationsController,
    NotificationsInboxController,
  ],
  providers: [NotificationsService, NotificationsInboxService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
