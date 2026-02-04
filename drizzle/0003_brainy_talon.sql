ALTER TABLE `unmatched_order_items` DROP FOREIGN KEY `unmatched_order_items_orderNotificationId_order_notifications_id_fk`;
--> statement-breakpoint
ALTER TABLE `food_items` ADD `createdByUserId` int;--> statement-breakpoint
ALTER TABLE `food_items` ADD CONSTRAINT `food_items_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `unmatched_order_items` ADD CONSTRAINT `uoi_order_fk` FOREIGN KEY (`orderNotificationId`) REFERENCES `order_notifications`(`id`) ON DELETE no action ON UPDATE no action;