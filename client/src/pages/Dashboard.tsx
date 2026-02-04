import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { trpc } from "@/lib/trpc";
import { SAMPLE_FOODS, type SampleFoodItem } from "@shared/sampleFoods";
import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import {
  CalendarIcon,
  ChevronRight,
  Home as HomeIcon,
  Minus,
  Plus,
  Search,
  Settings,
  Trash2,
} from "lucide-react";
import { useLocation } from "wouter";

const DINING_HALLS = ["South Campus", "Yahentamitsi Dining Hall", "251 North"];
const WEEKDAY_MEAL_TYPES = ["Breakfast", "Lunch", "Dinner"];
const WEEKEND_MEAL_TYPES = ["Brunch", "Dinner"];
const RESTAURANTS = [
  "McDonald's",
  "Popeyes",
  "Potbelly",
  "Subway",
  "Chipotle",
  "Starbucks",
  "Taco Bell",
  "Burger King",
  "Pizza Hut",
  "Domino's",
  "KFC",
  "Wendy's",
  "Dunkin'",
  "Panera Bread",
  "Olive Garden",
  "Applebee's",
  "Chili's",
  "Outback Steakhouse",
  "Red Lobster",
  "IHOP",
  "Denny's",
  "Buffalo Wild Wings",
];

export default function Dashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [selectedDiningHall, setSelectedDiningHall] = useState("South Campus");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMealType, setSelectedMealType] = useState("Lunch");
  const [foodSource, setFoodSource] = useState("Dining Halls");
  const [selectedMenuDate, setSelectedMenuDate] = useState<Date | undefined>(
    () => new Date()
  );
  const [selectedRestaurant, setSelectedRestaurant] = useState<string | null>(null);
  const [restaurantSearchQuery, setRestaurantSearchQuery] = useState("");
  const [newFoodForm, setNewFoodForm] = useState({
    name: "",
    servings: "1",
    calories: "",
    protein: "",
    carbs: "",
    fat: "",
  });
  const receiptInputRef = useRef<HTMLInputElement | null>(null);
  const [showReceiptHelp, setShowReceiptHelp] = useState(false);

  const { data: todayMeals } = trpc.nutrition.getTodayMeals.useQuery();
  const { data: goals } = trpc.nutrition.getGoals.useQuery();
  const menuDateValue = useMemo(() => {
    if (foodSource !== "Dining Halls") return undefined;
    return selectedMenuDate;
  }, [foodSource, selectedMenuDate]);
  const menuDateLabel = selectedMenuDate
    ? format(selectedMenuDate, "MM/dd/yyyy")
    : "Select date";
  const isWeekendMenuDate = useMemo(() => {
    const value = selectedMenuDate ?? new Date();
    const day = value.getDay();
    return day === 0 || day === 6;
  }, [selectedMenuDate]);
  const menuMealType = useMemo(() => {
    if (foodSource !== "Dining Halls") return undefined;
    return selectedMealType;
  }, [foodSource, isWeekendMenuDate, selectedMealType]);
  const { data: foodItems } = trpc.nutrition.getFoodsByDiningHall.useQuery({
    diningHall: selectedDiningHall,
    menuDate: menuDateValue,
    mealType: menuMealType,
  });
  const healthTimestamp = useMemo(() => Date.now(), []);
  const { data: systemHealth } = trpc.system.health.useQuery({
    timestamp: healthTimestamp,
  });
  const dbAvailable = Boolean(systemHealth?.dbAvailable);
  const { data: restaurantFoodItems } = trpc.nutrition.getFoodsByDiningHall.useQuery(
    { diningHall: selectedRestaurant ?? "" },
    {
      enabled: dbAvailable && foodSource === "Restaurants" && Boolean(selectedRestaurant),
    }
  );
  const { data: userFoodItems } = trpc.nutrition.getFoodsByDiningHall.useQuery(
    { diningHall: "Your Own" },
    {
      enabled: dbAvailable && foodSource === "Your Own",
    }
  );
  const { data: communityFoodItems } = trpc.nutrition.getUserCreatedFoods.useQuery(undefined, {
    enabled: dbAvailable && foodSource === "Community",
  });
  const uploadReceiptMutation = trpc.orders.uploadReceiptPdf.useMutation({
    onSuccess: () => utils.nutrition.getTodayMeals.invalidate(),
  });
  const createFoodItemMutation = trpc.nutrition.createFoodItem.useMutation({
    onSuccess: (created) => {
      utils.nutrition.getFoodsByDiningHall.invalidate({
        diningHall: created.diningHall,
      });
      utils.nutrition.getUserCreatedFoods.invalidate();
      setNewFoodForm((prev) => ({
        ...prev,
        name: "",
        servings: "1",
        calories: "",
        protein: "",
        carbs: "",
        fat: "",
      }));
    },
  });
  const deleteFoodItemMutation = trpc.nutrition.deleteFoodItem.useMutation({
    onSuccess: () => {
      utils.nutrition.getFoodsByDiningHall.invalidate({ diningHall: "Your Own" });
      utils.nutrition.getUserCreatedFoods.invalidate();
    },
  });

  const addMealMutation = trpc.nutrition.addMeal.useMutation({
    onSuccess: () => utils.nutrition.getTodayMeals.invalidate(),
  });
  const deleteMealMutation = trpc.nutrition.deleteMeal.useMutation({
    onSuccess: () => utils.nutrition.getTodayMeals.invalidate(),
  });
  const decrementMealMutation = trpc.nutrition.decrementMeal.useMutation({
    onSuccess: () => utils.nutrition.getTodayMeals.invalidate(),
  });
  const fallbackFoods = SAMPLE_FOODS.filter(
    item => item.diningHall === selectedDiningHall
  );
  const usingSampleFoods = !dbAvailable;
  const foodItemsSource = dbAvailable ? (foodItems ?? []) : fallbackFoods;
  const sampleStorageKey = useMemo(() => {
    const dateKey = new Date().toISOString().split("T")[0];
    return `sampleMeals:${dateKey}`;
  }, []);
  const [sampleMeals, setSampleMeals] = useState<
    Array<{
      id: number;
      foodItem: SampleFoodItem;
      mealType: string;
      quantity: number;
    }>
  >([]);

  // Calculate totals
  const todayMealsSource = dbAvailable ? (todayMeals ?? []) : sampleMeals;
  const totals = todayMealsSource.reduce(
    (acc, meal) => ({
      calories: acc.calories + (meal.foodItem.calories * meal.quantity),
      protein: acc.protein + (meal.foodItem.protein * meal.quantity),
      carbs: acc.carbs + (meal.foodItem.carbs * meal.quantity),
      fat: acc.fat + (meal.foodItem.fat * meal.quantity),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const calorieGoal = goals?.dailyCalories || 2000;
  const calorieRatio = calorieGoal > 0 ? totals.calories / calorieGoal : 0;
  const baseProgress = Math.min(calorieRatio, 1);
  const overProgress = Math.max(calorieRatio - 1, 0);
  const basePercent = Math.min(baseProgress * 100, 100);
  const overPercent = Math.min(overProgress * 100, 100);
  const circleCircumference = 2 * Math.PI * 54;

  const handleAddMeal = async (foodItemId: number) => {
    if (usingSampleFoods) {
      const food = fallbackFoods.find(item => item.id === foodItemId);
      if (!food) return;
      const newMeal: {
        id: number;
        foodItem: SampleFoodItem;
        mealType: string;
        quantity: number;
      } = {
        id: Date.now(),
        foodItem: food,
        mealType: selectedMealType,
        quantity: 1,
      };
      setSampleMeals(prev => [newMeal, ...prev]);
      return;
    }
    await addMealMutation.mutateAsync({
      foodItemId,
      mealType: selectedMealType,
      quantity: 1,
    });
  };

  const handleDeleteMeal = async (mealId: number) => {
    if (usingSampleFoods) {
      setSampleMeals(prev => prev.filter(meal => meal.id !== mealId));
      return;
    }
    await deleteMealMutation.mutateAsync({ mealId });
  };

  const handleDecrementMeal = async (mealId: number) => {
    if (usingSampleFoods) {
      setSampleMeals(prev =>
        prev.flatMap(meal => {
          if (meal.id !== mealId) return [meal];
          if (meal.quantity > 1) {
            return [{ ...meal, quantity: meal.quantity - 1 }];
          }
          return [];
        })
      );
      return;
    }
    await decrementMealMutation.mutateAsync({ mealId });
  };

  const handleReceiptUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      const chunk = bytes.subarray(i, i + 0x8000);
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    const fileBase64 = btoa(binary);
    await uploadReceiptMutation.mutateAsync({ fileBase64 });
    event.target.value = "";
  };

  // Filter food items by search query
  const filteredFoodItems = foodItemsSource.filter((item) =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const groupedFoodItems = useMemo(() => {
    if (foodSource !== "Dining Halls") return [];
    const groups = new Map<string, typeof filteredFoodItems>();
    filteredFoodItems.forEach((item) => {
      const station = item.station?.trim() || "Unknown";
      const current = groups.get(station) ?? [];
      current.push(item);
      groups.set(station, current);
    });
    const sortedStations = Array.from(groups.keys()).sort((a, b) => {
      if (a === "Unknown") return 1;
      if (b === "Unknown") return -1;
      return a.localeCompare(b);
    });
    return sortedStations.map((station) => ({
      station,
      items: (groups.get(station) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
    }));
  }, [filteredFoodItems, foodSource]);
  const restaurantFoodItemsSource = dbAvailable ? (restaurantFoodItems ?? []) : [];
  const filteredRestaurantFoodItems = restaurantFoodItemsSource.filter((item) =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const userFoodItemsSource = dbAvailable ? (userFoodItems ?? []) : [];
  const filteredUserFoodItems = userFoodItemsSource.filter((item) =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const communityFoodItemsSource = dbAvailable ? (communityFoodItems ?? []) : [];
  const filteredCommunityFoodItems = communityFoodItemsSource.filter((item) =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredRestaurants = useMemo(() => {
    const query = restaurantSearchQuery.trim().toLowerCase();
    if (!query) return RESTAURANTS;
    return RESTAURANTS.filter((name) => name.toLowerCase().includes(query));
  }, [restaurantSearchQuery]);
  const mealTypeOptions = useMemo(
    () => (isWeekendMenuDate ? WEEKEND_MEAL_TYPES : WEEKDAY_MEAL_TYPES),
    [isWeekendMenuDate]
  );

  useEffect(() => {
    if (foodSource !== "Dining Halls") {
      setSearchQuery("");
    }
    if (foodSource !== "Restaurants") {
      setRestaurantSearchQuery("");
    }
    if (foodSource === "Restaurants" && !selectedRestaurant) {
      setSelectedRestaurant("McDonald's");
    }
  }, [foodSource, selectedRestaurant]);

  useEffect(() => {
    if (foodSource !== "Dining Halls") return;
    if (!mealTypeOptions.includes(selectedMealType)) {
      setSelectedMealType(mealTypeOptions[0]);
    }
  }, [foodSource, mealTypeOptions, selectedMealType]);

  const defaultMenuTarget = useMemo(() => {
    if (foodSource === "Restaurants") {
      return selectedRestaurant ?? "";
    }
    if (foodSource === "Dining Halls") {
      return selectedDiningHall;
    }
    return "";
  }, [foodSource, selectedDiningHall, selectedRestaurant]);

  const handleCreateFoodItem = async () => {
    if (!dbAvailable) return;
    const menuTarget = defaultMenuTarget || (foodSource === "Your Own" ? "Your Own" : "");
    const servings = Number(newFoodForm.servings);
    const calories = Number(newFoodForm.calories);
    const protein = Number(newFoodForm.protein);
    const carbs = Number(newFoodForm.carbs);
    const fat = Number(newFoodForm.fat);
    if (!newFoodForm.name.trim() || !menuTarget.trim() || !Number.isFinite(servings) || servings < 1) {
      return;
    }
    if ([calories, protein, carbs, fat].some((value) => Number.isNaN(value))) {
      return;
    }
    await createFoodItemMutation.mutateAsync({
      name: newFoodForm.name.trim(),
      diningHall: menuTarget.trim(),
      servingSize: `${servings} serving${servings === 1 ? "" : "s"}`,
      calories,
      protein,
      carbs,
      fat,
    });
  };

  useEffect(() => {
    if (!usingSampleFoods) {
      setSampleMeals([]);
      return;
    }
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(sampleStorageKey);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Array<{
        id: number;
        foodItem: (typeof SAMPLE_FOODS)[number];
        mealType: string;
        quantity: number;
      }>;
      setSampleMeals(parsed);
    } catch {
      setSampleMeals([]);
    }
  }, [sampleStorageKey, usingSampleFoods]);

  useEffect(() => {
    if (!usingSampleFoods) return;
    if (typeof window === "undefined") return;
    window.localStorage.setItem(sampleStorageKey, JSON.stringify(sampleMeals));
  }, [sampleMeals, sampleStorageKey, usingSampleFoods]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Header */}
      <nav className="border-b border-border/40 backdrop-blur-sm sticky top-0 z-50 bg-slate-950/80">
        <div className="container flex items-center justify-between py-4">
          <button
            onClick={() => setLocation("/home")}
            className="flex items-center gap-2 text-2xl font-bold text-foreground hover:text-foreground/80 transition-colors"
            aria-label="Go to home"
          >
            <HomeIcon className="w-5 h-5" />
            CalTerp
          </button>
          <div className="flex items-center gap-4">
            {user?.name && (
              <span className="text-sm text-muted-foreground">Hi, {user.name}</span>
            )}
            <Button variant="ghost" size="sm" onClick={() => setLocation("/profile")}>
              <Settings className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </nav>

      <div className="container py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            {/* Today's Summary */}
            <Card className="p-8 border-border/40">
              <h2 className="text-2xl font-bold text-foreground mb-6">Today's Nutrition</h2>

              <div className="space-y-6">
                {/* Calorie Circle */}
                <div className="flex items-center gap-6">
                  <div className="relative w-32 h-32">
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 120 120">
                      <circle
                        cx="60"
                        cy="60"
                        r="54"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="8"
                        className="text-muted"
                      />
                      <circle
                        cx="60"
                        cy="60"
                        r="54"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="8"
                        strokeDasharray={`${(basePercent / 100) * circleCircumference} ${circleCircumference}`}
                        className="text-green-500 transition-all"
                      />
                      {overPercent > 0 ? (
                        <circle
                          cx="60"
                          cy="60"
                          r="54"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="8"
                          strokeDasharray={`${(overPercent / 100) * circleCircumference} ${circleCircumference}`}
                          className="text-red-500 transition-all"
                        />
                      ) : null}
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <div className="text-2xl font-bold text-foreground">{Math.round(totals.calories)}</div>
                      <div className="text-xs text-muted-foreground">/ {calorieGoal}</div>
                    </div>
                  </div>

                  <div className="space-y-4 flex-1">
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-muted-foreground">Protein</span>
                        <span className="font-semibold text-foreground">{Math.round(totals.protein)}g</span>
                      </div>
                      <div className="macro-bar" style={{ background: 'linear-gradient(to right, rgb(239, 68, 68), rgb(239, 68, 68))', width: `${Math.min((totals.protein / 150) * 100, 100)}%` }}></div>
                    </div>

                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-muted-foreground">Carbs</span>
                        <span className="font-semibold text-foreground">{Math.round(totals.carbs)}g</span>
                      </div>
                      <div className="macro-bar" style={{ background: 'linear-gradient(to right, rgb(251, 146, 60), rgb(251, 146, 60))', width: `${Math.min((totals.carbs / 250) * 100, 100)}%` }}></div>
                    </div>

                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-muted-foreground">Fat</span>
                        <span className="font-semibold text-foreground">{Math.round(totals.fat)}g</span>
                      </div>
                      <div className="macro-bar" style={{ background: 'linear-gradient(to right, rgb(168, 85, 247), rgb(168, 85, 247))', width: `${Math.min((totals.fat / 65) * 100, 100)}%` }}></div>
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            {/* Today's Meals */}
            <Card className="p-8 border-border/40">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-foreground">Logged Meals</h3>
                <div className="flex flex-col items-end gap-2">
                  {showReceiptHelp ? (
                    <p className="text-xs text-muted-foreground text-right max-w-[280px]">
                      Find your meal receipt in the order confirmation email from Uber Eats, DoorDash, or Grubhub.
                    </p>
                  ) : null}
                  <input
                    type="file"
                    accept="application/pdf"
                    ref={receiptInputRef}
                    className="hidden"
                    onChange={handleReceiptUpload}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs font-semibold border border-border/60 bg-transparent hover:border-border text-foreground gap-2"
                    disabled={uploadReceiptMutation.isPending}
                    onClick={() => receiptInputRef.current?.click()}
                  >
                    Log with Receipt
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setShowReceiptHelp((prev) => !prev);
                      }}
                      className="w-5 h-5 rounded-full border border-border/60 text-[10px] text-muted-foreground hover:text-foreground hover:border-border transition-colors flex items-center justify-center"
                      aria-label="Receipt help"
                    >
                      ?
                    </button>
                  </Button>
                </div>
              </div>
              {todayMealsSource.length > 0 ? (
                <div className="space-y-3">
                  {todayMealsSource.map((meal) => (
                    <div key={meal.id} className="meal-item">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="font-medium text-foreground">{meal.foodItem.name}</p>
                          <p className="text-sm text-muted-foreground">{meal.foodItem.servingSize} × {meal.quantity}</p>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="font-semibold text-foreground">{meal.foodItem.calories * meal.quantity} cal</p>
                            <p className="text-xs text-muted-foreground">{meal.mealType}</p>
                          </div>
                          {meal.quantity > 1 ? (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleDecrementMeal(meal.id)}
                              disabled={decrementMealMutation.isPending}
                              aria-label="Decrease quantity"
                            >
                              <Minus className="w-4 h-4 text-muted-foreground hover:text-foreground transition-colors" />
                            </Button>
                          ) : null}
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleDeleteMeal(meal.id)}
                            disabled={deleteMealMutation.isPending}
                            aria-label="Delete meal"
                          >
                            <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive transition-colors" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">No meals logged yet. Add some food below!</p>
              )}
            </Card>

            {/* Food Browser */}
            <Card className="p-8 border-border/40">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                <h3 className="text-xl font-bold text-foreground">Add Food</h3>
                <div className="flex items-center gap-2 text-xs font-semibold">
                  {["Dining Halls", "Restaurants", "Your Own", "Community"].map((option, index) => (
                    <div key={option} className="flex items-center">
                      <button
                        onClick={() => setFoodSource(option)}
                        className={`px-1.5 py-0.5 rounded-md transition-colors ${
                          foodSource === option
                            ? "text-accent"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {option}
                      </button>
                      {index < 3 && (
                        <span className="px-2 text-muted-foreground/60">|</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-6">
                {/* Dining Hall / Restaurant Selector */}
                {foodSource === "Dining Halls" ? (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-3">Dining Hall</label>
                    <div className="grid grid-cols-3 gap-3">
                      {DINING_HALLS.map((hall) => (
                        <button
                          key={hall}
                          onClick={() => setSelectedDiningHall(hall)}
                          className={`p-3 rounded-lg border transition-all text-sm font-medium ${
                            selectedDiningHall === hall
                              ? "border-accent bg-accent/10 text-accent"
                              : "border-border hover:border-accent hover:bg-muted/50 transition-all text-muted-foreground"
                          }`}
                        >
                          {hall}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {foodSource === "Dining Halls" ? (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-3">
                      Menu Date
                    </label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={`w-full justify-start text-left font-normal ${
                            !selectedMenuDate && "text-muted-foreground"
                          }`}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {menuDateLabel}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <div className="p-3 space-y-3">
                          <Calendar
                            mode="single"
                            selected={selectedMenuDate}
                            onSelect={setSelectedMenuDate}
                          />
                          <div className="border-t pt-3 flex items-center justify-between">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedMenuDate(undefined)}
                            >
                              Clear
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedMenuDate(new Date())}
                            >
                              Today
                            </Button>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                ) : null}

                {foodSource === "Restaurants" ? (
                  <div className="space-y-4">
                    <label className="block text-sm font-medium text-foreground">Restaurant</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
                      <Input
                        placeholder="Search restaurants..."
                        value={restaurantSearchQuery}
                        onChange={(e) => setRestaurantSearchQuery(e.target.value)}
                        className="input-elegant pl-10"
                      />
                    </div>
                    <div className="space-y-2 max-h-64 overflow-y-auto restaurant-scroll">
                      {filteredRestaurants.length > 0 ? (
                        filteredRestaurants.map((restaurant) => {
                          const isSelected = selectedRestaurant === restaurant;
                          return (
                            <button
                              key={restaurant}
                              onClick={() => setSelectedRestaurant(restaurant)}
                              className={`meal-item flex items-center justify-between w-full text-left ${
                                isSelected ? "border-accent bg-accent/10" : ""
                              }`}
                            >
                              <div>
                                <p className={`font-medium ${isSelected ? "text-accent" : "text-foreground"}`}>
                                  {restaurant}
                                </p>
                                <p className="text-xs text-muted-foreground">Tap to select</p>
                              </div>
                              {isSelected ? (
                                <span className="text-xs text-accent font-semibold">Selected</span>
                              ) : null}
                            </button>
                          );
                        })
                      ) : (
                        <p className="text-muted-foreground text-center py-6">Can't be found</p>
                      )}
                    </div>
                  </div>
                ) : null}

                {foodSource === "Dining Halls" ? (
                  <>
                    {/* Meal Type Selector */}
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-3">Meal Type</label>
                      <div className="grid grid-cols-3 gap-3">
                        {mealTypeOptions.map((type) => (
                          <button
                            key={type}
                            onClick={() => setSelectedMealType(type)}
                            className={`p-2 rounded-lg border transition-all text-sm font-medium ${
                              selectedMealType === type
                                ? "border-accent bg-accent/10 text-accent"
                                : "border-border hover:border-accent hover:bg-muted/50 transition-all text-muted-foreground"
                            }`}
                          >
                            {type}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                ) : null}

                {foodSource === "Dining Halls" ? (
                  <>
                    {/* Food Search */}
                    <div className="relative">
                      <Search className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
                      <Input
                        placeholder="Search food items..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="input-elegant pl-10"
                      />
                    </div>

                    {/* Food Items List */}
                    <div className="space-y-4 max-h-96 overflow-y-auto restaurant-scroll">
                      {usingSampleFoods && (
                        <p className="text-xs text-muted-foreground">
                          Showing sample menu items. Meals are saved locally in this browser.
                        </p>
                      )}
                      {groupedFoodItems.length > 0 ? (
                        groupedFoodItems.map((group) => (
                          <div key={group.station} className="rounded-lg border border-border/60 bg-muted/10">
                            <div className="px-4 pt-4 pb-2">
                              <p className="text-sm font-semibold text-foreground/80">
                                {group.station}
                              </p>
                            </div>
                            <div className="px-2 pb-2 space-y-2">
                              {group.items.map((item) => (
                                <div key={item.id} className="meal-item flex items-center justify-between">
                                  <div className="flex-1">
                                    <p className="font-medium text-foreground">{item.name}</p>
                                    <p className="text-sm text-muted-foreground">
                                      {item.servingSize} - {item.calories} cal
                                    </p>
                                  </div>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleAddMeal(item.id)}
                                    disabled={addMealMutation.isPending}
                                  >
                                    <Plus className="w-4 h-4" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-muted-foreground text-center py-8">No food items available</p>
                      )}
                    </div>
                  </>
                ) : foodSource === "Restaurants" ? (
                  <>
                    {selectedRestaurant ? (
                      <>
                        {/* Restaurant Menu Search */}
                        <div className="relative">
                          <Search className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
                          <Input
                            placeholder={`Search ${selectedRestaurant}...`}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="input-elegant pl-10"
                          />
                        </div>

                        {/* Restaurant Items List */}
                        <div className="space-y-2 max-h-96 overflow-y-auto restaurant-scroll">
                          {filteredRestaurantFoodItems.length > 0 ? (
                            filteredRestaurantFoodItems.map((item) => (
                              <div key={item.id} className="meal-item flex items-center justify-between">
                                <div className="flex-1">
                                  <p className="font-medium text-foreground">{item.name}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {item.servingSize} - {item.calories} cal
                                  </p>
                                </div>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleAddMeal(item.id)}
                                  disabled={addMealMutation.isPending}
                                >
                                  <Plus className="w-4 h-4" />
                                </Button>
                              </div>
                            ))
                          ) : (
                            <p className="text-muted-foreground text-center py-8">
                              No menu items available.
                            </p>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
                        Select a restaurant to view its menu.
                      </div>
                    )}
                  </>
                ) : foodSource === "Your Own" ? (
                  <>
                    <div className="relative">
                      <Search className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
                      <Input
                        placeholder="Search your foods..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="input-elegant pl-10"
                      />
                    </div>
                    <div className="space-y-2 max-h-96 overflow-y-auto restaurant-scroll">
                      {filteredUserFoodItems.length > 0 ? (
                        filteredUserFoodItems.map((item) => (
                          <div key={item.id} className="meal-item flex items-center justify-between">
                            <div className="flex-1">
                              <p className="font-medium text-foreground">{item.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {item.servingSize} - {item.calories} cal
                              </p>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => deleteFoodItemMutation.mutateAsync({ foodItemId: item.id })}
                              disabled={deleteFoodItemMutation.isPending}
                              aria-label="Delete custom food"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleAddMeal(item.id)}
                              disabled={addMealMutation.isPending}
                            >
                              <Plus className="w-4 h-4" />
                            </Button>
                          </div>
                        ))
                      ) : (
                        <p className="text-muted-foreground text-center py-8">
                          No custom foods yet.
                        </p>
                      )}
                    </div>
                  </>
                ) : foodSource === "Community" ? (
                  <>
                    <div className="relative">
                      <Search className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
                      <Input
                        placeholder="Search community foods..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="input-elegant pl-10"
                      />
                    </div>
                    <div className="space-y-2 max-h-96 overflow-y-auto restaurant-scroll">
                      {filteredCommunityFoodItems.length > 0 ? (
                        filteredCommunityFoodItems.map((item) => (
                          <div key={item.id} className="meal-item flex items-center justify-between">
                            <div className="flex-1">
                              <p className="font-medium text-foreground">{item.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {item.servingSize} - {item.calories} cal
                              </p>
                            </div>
                            {item.createdByUserId === user?.id ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => deleteFoodItemMutation.mutateAsync({ foodItemId: item.id })}
                                disabled={deleteFoodItemMutation.isPending}
                                aria-label="Delete custom food"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            ) : null}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleAddMeal(item.id)}
                              disabled={addMealMutation.isPending}
                            >
                              <Plus className="w-4 h-4" />
                            </Button>
                          </div>
                        ))
                      ) : (
                        <p className="text-muted-foreground text-center py-8">
                          No community foods yet.
                        </p>
                      )}
                    </div>
                  </>
                ) : null}
              </div>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Stats */}
            <Card className="p-6 border-border/40">
              <h3 className="font-semibold text-foreground mb-4">Quick Stats</h3>
              <div className="space-y-4">
                <div className="stat-card">
                  <span className="text-xs text-muted-foreground">Remaining</span>
                  <span className="text-2xl font-bold text-foreground">
                    {Math.max(0, calorieGoal - totals.calories)}
                  </span>
                  <span className="text-xs text-muted-foreground">calories</span>
                </div>
                <div className="stat-card">
                  <span className="text-xs text-muted-foreground">Meals Logged</span>
                  <span className="text-2xl font-bold text-foreground">{todayMealsSource.length}</span>
                </div>
              </div>
            </Card>

            <Card className="p-6 border-border/40">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-foreground">Add New Item</h3>
                {dbAvailable ? (
                  <span className="text-[11px] text-muted-foreground">Shared menu</span>
                ) : (
                  <span className="text-[11px] text-muted-foreground">DB offline</span>
                )}
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Item name</label>
                  <Input
                    value={newFoodForm.name}
                    onChange={(e) => setNewFoodForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Turkey Club"
                    className="input-elegant"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Servings</label>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={newFoodForm.servings}
                    onChange={(e) => setNewFoodForm((prev) => ({ ...prev, servings: e.target.value }))}
                    placeholder="1"
                    className="input-elegant"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Calories</label>
                    <Input
                      type="number"
                      min={0}
                      value={newFoodForm.calories}
                      onChange={(e) => setNewFoodForm((prev) => ({ ...prev, calories: e.target.value }))}
                      className="input-elegant"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Protein (g)</label>
                    <Input
                      type="number"
                      min={0}
                      value={newFoodForm.protein}
                      onChange={(e) => setNewFoodForm((prev) => ({ ...prev, protein: e.target.value }))}
                      className="input-elegant"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Carbs (g)</label>
                    <Input
                      type="number"
                      min={0}
                      value={newFoodForm.carbs}
                      onChange={(e) => setNewFoodForm((prev) => ({ ...prev, carbs: e.target.value }))}
                      className="input-elegant"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Fat (g)</label>
                    <Input
                      type="number"
                      min={0}
                      value={newFoodForm.fat}
                      onChange={(e) => setNewFoodForm((prev) => ({ ...prev, fat: e.target.value }))}
                      className="input-elegant"
                    />
                  </div>
                </div>
                <Button
                  size="sm"
                  className="w-full"
                  disabled={createFoodItemMutation.isPending || !dbAvailable}
                  onClick={handleCreateFoodItem}
                >
                  Add to Menu
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
