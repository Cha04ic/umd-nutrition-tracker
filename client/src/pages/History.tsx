import { useAuth } from "@/_core/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { ArrowLeft, Calendar } from "lucide-react";
import { useLocation } from "wouter";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";

export default function History() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d;
  });

  const { data: history } = trpc.nutrition.getHistory.useQuery({
    startDate,
    endDate,
  });

  const toLocalDateInputValue = (date: Date) => {
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    const offsetMinutes = date.getTimezoneOffset();
    const local = new Date(date.getTime() - offsetMinutes * 60 * 1000);
    return local.toISOString().split("T")[0];
  };

  const toStartOfDay = (value: string) => {
    if (!value) {
      return startDate;
    }
    const d = new Date(`${value}T00:00:00`);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const toEndOfDay = (value: string) => {
    if (!value) {
      return endDate;
    }
    const d = new Date(`${value}T23:59:59.999`);
    d.setHours(23, 59, 59, 999);
    return d;
  };

  // Group meals by date
  const mealsByDate = history?.reduce(
    (acc, meal) => {
      const date = new Date(meal.trackedDate);
      date.setHours(0, 0, 0, 0);
      const dateKey = date.toISOString().slice(0, 10);
      if (!acc[dateKey]) {
        acc[dateKey] = [];
      }
      acc[dateKey].push(meal);
      return acc;
    },
    {} as Record<string, typeof history>
  ) || {};

  // Calculate daily totals
  const dailyTotals = Object.entries(mealsByDate)
    .map(([dateKey, meals]) => {
      const dateLabel = new Date(`${dateKey}T00:00:00`).toLocaleDateString();
      const totals = meals.reduce(
        (acc, meal) => ({
          calories: acc.calories + (meal.foodItem.calories * meal.quantity),
          protein: acc.protein + (meal.foodItem.protein * meal.quantity),
          carbs: acc.carbs + (meal.foodItem.carbs * meal.quantity),
          fat: acc.fat + (meal.foodItem.fat * meal.quantity),
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 }
      );
      return { dateKey, dateLabel, meals, totals };
    })
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));

  const chartData = dailyTotals.map(({ dateLabel, totals }) => ({
    date: dateLabel,
    calories: Math.round(totals.calories),
    protein: Math.round(totals.protein),
    carbs: Math.round(totals.carbs),
    fat: Math.round(totals.fat),
  }));

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Header */}
      <nav className="border-b border-border/40 backdrop-blur-sm sticky top-0 z-50 bg-slate-950/80">
        <div className="container flex items-center justify-between py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setLocation("/dashboard")}
              className="p-2 hover:bg-muted rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-2xl font-bold text-foreground">Nutrition History</h1>
          </div>
        </div>
      </nav>

      <div className="container py-8">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Date Filter */}
          <Card className="p-6 border-border/40">
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Filter by Date
            </h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">Start Date</label>
                <input
                  type="date"
                  value={toLocalDateInputValue(startDate)}
                  onChange={(e) => {
                    const next = toStartOfDay(e.target.value);
                    if (next !== startDate) {
                      setStartDate(next);
                    }
                  }}
                  className="input-elegant w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">End Date</label>
                <input
                  type="date"
                  value={toLocalDateInputValue(endDate)}
                  onChange={(e) => {
                    const next = toEndOfDay(e.target.value);
                    if (next !== endDate) {
                      setEndDate(next);
                    }
                  }}
                  className="input-elegant w-full"
                />
              </div>
            </div>
          </Card>

          {chartData.length > 0 && (
            <Card className="p-6 border-border/40">
              <h2 className="text-lg font-semibold text-foreground mb-4">Daily Macro Trends</h2>
              <ChartContainer
                className="h-64 w-full"
                config={{
                  calories: { label: "Calories", color: "#22c55e" },
                  protein: { label: "Protein (g)", color: "#ef4444" },
                  carbs: { label: "Carbs (g)", color: "#fb923c" },
                  fat: { label: "Fat (g)", color: "#a855f7" },
                }}
              >
                <LineChart data={chartData} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Line type="monotone" dataKey="calories" stroke="var(--color-calories)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="protein" stroke="var(--color-protein)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="carbs" stroke="var(--color-carbs)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="fat" stroke="var(--color-fat)" strokeWidth={2} dot={false} />
                </LineChart>
              </ChartContainer>
            </Card>
          )}

          {/* Daily Summary Cards */}
          {dailyTotals.length > 0 ? (
            <div className="space-y-6">
              {dailyTotals.map(({ dateKey, dateLabel, meals, totals }) => (
                <Card key={dateKey} className="p-6 border-border/40">
                  <div className="mb-6">
                    <h3 className="text-lg font-bold text-foreground">{dateLabel}</h3>
                    <p className="text-sm text-muted-foreground">{meals.length} meal(s) logged</p>
                  </div>

                  {/* Daily Macros */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                    <div className="stat-card">
                      <span className="text-xs text-muted-foreground">Calories</span>
                      <span className="text-2xl font-bold text-foreground">{Math.round(totals.calories)}</span>
                    </div>
                    <div className="stat-card">
                      <span className="text-xs text-muted-foreground">Protein</span>
                      <span className="text-2xl font-bold text-foreground">{Math.round(totals.protein)}g</span>
                    </div>
                    <div className="stat-card">
                      <span className="text-xs text-muted-foreground">Carbs</span>
                      <span className="text-2xl font-bold text-foreground">{Math.round(totals.carbs)}g</span>
                    </div>
                    <div className="stat-card">
                      <span className="text-xs text-muted-foreground">Fat</span>
                      <span className="text-2xl font-bold text-foreground">{Math.round(totals.fat)}g</span>
                    </div>
                  </div>

                  {/* Macro Bars */}
                  <div className="space-y-3 mb-6">
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground">Protein</span>
                        <span className="font-medium text-foreground">{Math.round(totals.protein)}g</span>
                      </div>
                      <div className="macro-bar" style={{ background: 'linear-gradient(to right, rgb(239, 68, 68), rgb(239, 68, 68))', width: `${Math.min((totals.protein / 150) * 100, 100)}%` }}></div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground">Carbs</span>
                        <span className="font-medium text-foreground">{Math.round(totals.carbs)}g</span>
                      </div>
                      <div className="macro-bar" style={{ background: 'linear-gradient(to right, rgb(251, 146, 60), rgb(251, 146, 60))', width: `${Math.min((totals.carbs / 250) * 100, 100)}%` }}></div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground">Fat</span>
                        <span className="font-medium text-foreground">{Math.round(totals.fat)}g</span>
                      </div>
                      <div className="macro-bar" style={{ background: 'linear-gradient(to right, rgb(168, 85, 247), rgb(168, 85, 247))', width: `${Math.min((totals.fat / 65) * 100, 100)}%` }}></div>
                    </div>
                  </div>

                  {/* Meals List */}
                  <div className="border-t border-border pt-4">
                    <h4 className="font-semibold text-foreground mb-3">Meals</h4>
                    <div className="space-y-2">
                      {meals.map((meal) => (
                        <div key={meal.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                          <div className="flex-1">
                            <p className="font-medium text-foreground text-sm">{meal.foodItem.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {meal.foodItem.servingSize} × {meal.quantity} • {meal.mealType}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-foreground text-sm">
                              {meal.foodItem.calories * meal.quantity} cal
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="p-12 border-border/40 text-center">
              <p className="text-muted-foreground">No meals logged in the selected date range</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
