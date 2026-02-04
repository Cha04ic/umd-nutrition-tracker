CREATE TABLE `connected_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`platform` varchar(50) NOT NULL,
	`platformAccountId` varchar(255),
	`accessToken` text,
	`refreshToken` text,
	`expiresAt` timestamp,
	`isActive` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `connected_accounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `order_notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`connectedAccountId` int,
	`platform` varchar(50) NOT NULL,
	`orderId` varchar(255) NOT NULL,
	`orderData` text,
	`status` varchar(50) DEFAULT 'pending',
	`processedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `order_notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `unmatched_order_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderNotificationId` int,
	`itemName` varchar(255) NOT NULL,
	`restaurant` varchar(255),
	`quantity` int NOT NULL DEFAULT 1,
	`userId` int NOT NULL,
	`resolved` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `unmatched_order_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `connected_accounts` ADD CONSTRAINT `connected_accounts_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_notifications` ADD CONSTRAINT `order_notifications_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_notifications` ADD CONSTRAINT `order_notifications_connectedAccountId_connected_accounts_id_fk` FOREIGN KEY (`connectedAccountId`) REFERENCES `connected_accounts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `unmatched_order_items` ADD CONSTRAINT `unmatched_order_items_orderNotificationId_order_notifications_id_fk` FOREIGN KEY (`orderNotificationId`) REFERENCES `order_notifications`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `unmatched_order_items` ADD CONSTRAINT `unmatched_order_items_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;