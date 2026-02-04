CREATE TABLE `food_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`diningHall` varchar(100) NOT NULL,
	`station` varchar(100) NOT NULL,
	`recNumAndPort` varchar(50) NOT NULL,
	`servingSize` varchar(50) NOT NULL,
	`calories` int NOT NULL,
	`protein` int NOT NULL,
	`carbs` int NOT NULL,
	`fat` int NOT NULL,
	`saturatedFat` int,
	`transFat` int,
	`cholesterol` int,
	`sodium` int,
	`fiber` int,
	`sugars` int,
	`ingredients` text,
	`allergens` text,
	`lastUpdated` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `food_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `nutrition_goals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`dailyCalories` int NOT NULL DEFAULT 2000,
	`proteinPercent` int NOT NULL DEFAULT 30,
	`carbPercent` int NOT NULL DEFAULT 45,
	`fatPercent` int NOT NULL DEFAULT 25,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `nutrition_goals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tracked_meals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`foodItemId` int NOT NULL,
	`quantity` int NOT NULL DEFAULT 1,
	`mealType` varchar(20) NOT NULL,
	`trackedDate` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tracked_meals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `nutrition_goals` ADD CONSTRAINT `nutrition_goals_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tracked_meals` ADD CONSTRAINT `tracked_meals_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tracked_meals` ADD CONSTRAINT `tracked_meals_foodItemId_food_items_id_fk` FOREIGN KEY (`foodItemId`) REFERENCES `food_items`(`id`) ON DELETE cascade ON UPDATE no action;