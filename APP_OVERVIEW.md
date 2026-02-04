# UMD Nutrition Tracker - App Overview

## Sample Food Items

The database is populated with 28 realistic UMD dining hall food items across three locations. Here's what's available:

### South Campus (14 items)

**Breakfast:**
- Scrambled Eggs (2 eggs) - 140 cal, 12g protein, 1g carbs, 10g fat
- Whole Wheat Toast (2 slices) - 160 cal, 6g protein, 28g carbs, 2g fat
- Greek Yogurt (6 oz) - 100 cal, 17g protein, 7g carbs, 0g fat
- Oatmeal with Berries (1 cup) - 180 cal, 5g protein, 34g carbs, 3g fat
- Bagel with Cream Cheese (1 bagel) - 290 cal, 11g protein, 45g carbs, 8g fat

**Lunch:**
- Grilled Chicken Breast (6 oz) - 280 cal, 53g protein, 0g carbs, 6g fat
- Brown Rice (1 cup) - 215 cal, 5g protein, 45g carbs, 2g fat
- Roasted Vegetables (1.5 cups) - 120 cal, 4g protein, 22g carbs, 2g fat
- Turkey Sandwich (1 sandwich) - 320 cal, 28g protein, 35g carbs, 8g fat
- Caesar Salad (2 cups) - 240 cal, 12g protein, 12g carbs, 16g fat

**Dinner:**
- Pasta with Marinara (1.5 cups) - 350 cal, 14g protein, 58g carbs, 6g fat
- Baked Salmon (5 oz) - 280 cal, 35g protein, 0g carbs, 15g fat
- Sweet Potato (1 medium) - 105 cal, 2g protein, 24g carbs, 0g fat
- Beef Tacos (2 tacos) - 420 cal, 24g protein, 38g carbs, 18g fat

### Yahentamitsi Dining Hall (9 items)

**Breakfast:**
- Pancakes with Syrup (2 pancakes) - 280 cal, 8g protein, 54g carbs, 4g fat
- Bacon (3 slices) - 160 cal, 12g protein, 0g carbs, 12g fat
- Fresh Fruit Salad (1.5 cups) - 90 cal, 1g protein, 23g carbs, 0g fat

**Lunch:**
- Veggie Burger (1 burger) - 240 cal, 12g protein, 32g carbs, 8g fat
- Hummus and Vegetables (1 cup) - 180 cal, 6g protein, 18g carbs, 9g fat
- Quinoa Bowl (1.5 cups) - 320 cal, 12g protein, 48g carbs, 8g fat

**Dinner:**
- Stir Fry with Tofu (1.5 cups) - 280 cal, 18g protein, 28g carbs, 12g fat
- Vegetable Fried Rice (1.5 cups) - 240 cal, 8g protein, 38g carbs, 6g fat

### 251 North (5 items)

**Breakfast:**
- Breakfast Burrito (1 burrito) - 380 cal, 16g protein, 42g carbs, 16g fat
- Smoothie Bowl (1 bowl) - 280 cal, 10g protein, 48g carbs, 5g fat

**Lunch:**
- Pulled Pork Sandwich (1 sandwich) - 450 cal, 32g protein, 38g carbs, 18g fat
- Coleslaw (1 cup) - 150 cal, 2g protein, 12g carbs, 10g fat

**Dinner:**
- Pizza Slice (1 slice) - 280 cal, 14g protein, 36g carbs, 10g fat
- Garlic Bread (2 pieces) - 180 cal, 4g protein, 22g carbs, 8g fat

---

## How the App Works

### 1. Dashboard (Main Page)

The dashboard is your daily nutrition hub. Here's what you see:

**Today's Nutrition Circle:**
- A circular progress indicator showing your total calories consumed vs. your daily goal (default: 2000 calories)
- Below the circle, you see your macro breakdown:
  - **Protein**: grams consumed
  - **Carbs**: grams consumed
  - **Fat**: grams consumed

**Quick Stats (Right Sidebar):**
- **Remaining**: How many calories you have left for the day
- **Meals Logged**: Count of meals you've added today

**Logged Meals Section:**
- Shows all meals you've added today with their nutrition info
- Currently displays "No meals logged yet. Add some food below!" when empty
- Each meal will show: food name, calories, macros, and meal type

**Add Food Section:**
- Interface to search and add food items to your daily tracker
- You can browse by dining hall and meal type
- Select a food item and add it to your daily total

### 2. Goals & Settings Page

Customize your nutrition targets:

**Daily Calorie Goal:**
- Default: 2000 calories
- Adjustable from 1000-5000 calories

**Macro Percentages:**
- **Protein**: Default 30% (adjustable 10-50%)
- **Carbs**: Default 45% (adjustable 20-70%)
- **Fat**: Default 25% (adjustable 10-50%)

When you update these, the app recalculates your daily macro targets based on your calorie goal. For example:
- 2000 calories × 30% protein = 150g protein (600 cal ÷ 4 cal/g)
- 2000 calories × 45% carbs = 225g carbs (900 cal ÷ 4 cal/g)
- 2000 calories × 25% fat = 56g fat (500 cal ÷ 9 cal/g)

### 3. Nutrition History Page

Track your eating patterns over time:

**Date Range Selector:**
- Choose a start and end date to view your nutrition data
- See your daily totals for each day in the range
- Track calories, protein, carbs, and fat consumed each day

**Historical Insights:**
- Identify eating patterns
- See which days you stayed within your goals
- Compare your actual intake to your targets

### 4. User Authentication

The app uses Google OAuth for secure login:
- Click the settings icon (⚙️) in the top right to access your profile
- Your nutrition goals and meal history are saved per user
- Each user has their own separate tracking data

---

## Key Features

### Nutrition Tracking
- **Real-time calculations**: As you add meals, totals update instantly
- **Macro tracking**: See protein, carbs, and fat breakdown
- **Daily goals**: Compare your intake to personalized targets
- **Multiple dining halls**: Browse food from South Campus, Yahentamitsi, or 251 North

### Customizable Goals
- Set your own daily calorie target
- Adjust macro percentages based on your diet preference
- Goals are saved to your profile

### History & Analytics
- View past nutrition data by date range
- Track trends over time
- See which meals contributed most to your daily totals

### Elegant Design
- Clean, modern interface with smooth animations
- Responsive layout that works on desktop and mobile
- Visual progress indicators for calories and macros
- Easy-to-read nutrition information

---

## How to Use the App

### Getting Started

1. **Log in** with your Google account
2. **Set your nutrition goals** (optional - defaults are provided)
3. **Start tracking meals** by adding food items from the dining halls

### Adding a Meal

1. Go to the Dashboard
2. Scroll to "Add Food" section
3. Search for a food item or browse by dining hall
4. Select the food and choose the meal type (Breakfast, Lunch, Dinner, Snack)
5. Click "Add" to log the meal
6. Your daily totals update instantly

### Viewing Your Progress

1. Check the **Today's Nutrition** circle on the dashboard
2. See remaining calories in the Quick Stats
3. Review the **Logged Meals** section to see what you've eaten
4. Click **Nutrition History** to see trends over time

### Adjusting Your Goals

1. Click **Goals & Settings** in the sidebar
2. Update your daily calorie target
3. Adjust macro percentages if desired
4. Click "Save" to update your profile

---

## Technical Details

### Database
- **Food Items**: 28 items with complete nutrition facts
- **User Data**: Stored securely with OAuth authentication
- **Nutrition Goals**: Per-user customizable targets
- **Tracked Meals**: Daily meal history with timestamps

### Backend
- **tRPC API**: Type-safe procedures for all nutrition operations
- **Database**: MySQL with Drizzle ORM
- **Authentication**:  OAuth integration

### Frontend
- **React 19**: Modern UI framework
- **Tailwind CSS 4**: Elegant styling
- **Responsive Design**: Works on all screen sizes
- **Real-time Updates**: Instant feedback when adding/removing meals

---

## Future Enhancements

When the dining halls reopen:
1. Run the live menu scraper to fetch current menus from nutrition.umd.edu
2. Add more food items as they become available
3. Implement weekly nutrition charts and trends
4. Add meal deletion functionality
5. Create shopping list integration
6. Add barcode scanning for quick food entry
