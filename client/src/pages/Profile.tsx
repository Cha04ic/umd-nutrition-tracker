import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { useState, useEffect } from "react";
import { ArrowLeft, Save } from "lucide-react";
import { useLocation } from "wouter";

export default function Profile() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const { data: goals } = trpc.nutrition.getGoals.useQuery();
  const updateGoalsMutation = trpc.nutrition.updateGoals.useMutation();
  const updateProfileMutation = trpc.auth.updateProfile.useMutation();
  const utils = trpc.useUtils();
  const { data: connectedAccounts } = trpc.orders.getConnections.useQuery();
  const syncGmailMutation = trpc.orders.syncGmail.useMutation();
  const disconnectGmailMutation = trpc.orders.disconnectGmail.useMutation({
    onSuccess: () => utils.orders.getConnections.invalidate(),
  });
  const gmailConnected = connectedAccounts?.some(
    (account) => account.platform === "gmail" && account.isActive
  ) ?? false;

  const [formData, setFormData] = useState({
    dailyCalories: 2000,
    proteinPercent: 30,
    carbPercent: 45,
    fatPercent: 25,
  });
  const [hasLoadedGoals, setHasLoadedGoals] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [autoAdjust, setAutoAdjust] = useState({
    goal: "maintenance",
    weightLbs: "",
    heightFt: "",
    heightIn: "",
    age: "",
    bodyFatPercent: "",
    sex: "unspecified",
    activity: "moderate",
    pace: "0.5",
  });
  const [showSyncHelp, setShowSyncHelp] = useState(false);

  useEffect(() => {
    if (goals && !hasLoadedGoals) {
      setFormData({
        dailyCalories: goals.dailyCalories,
        proteinPercent: goals.proteinPercent,
        carbPercent: goals.carbPercent,
        fatPercent: goals.fatPercent,
      });
      setHasLoadedGoals(true);
    }
  }, [goals, hasLoadedGoals]);

  useEffect(() => {
    setNameInput(user?.name || "");
  }, [user]);

  const handleInputChange = (field: string, value: number) => {
    if (!Number.isFinite(value)) return;
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSave = async () => {
    await updateGoalsMutation.mutateAsync(formData);
    setHasLoadedGoals(true);
  };

  const handleProfileSave = async () => {
    if (!nameInput.trim()) return;
    const updated = await updateProfileMutation.mutateAsync({
      name: nameInput.trim(),
    });
    utils.auth.me.setData(undefined, updated);
  };

  const handleSignOut = async () => {
    await logout();
    setLocation("/");
  };

  const totalPercent = formData.proteinPercent + formData.carbPercent + formData.fatPercent;

  const activityMultipliers: Record<string, number> = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    athlete: 1.9,
  };

  const goalProteinTargets: Record<string, number> = {
    "lose-weight": 1.1,
    "lose-fat": 1.1,
    maintenance: 0.9,
    "gain-weight": 0.9,
    bulk: 0.9,
  };

  const handleAutoAdjust = async () => {
    const weightLbs = Number(autoAdjust.weightLbs);
    const heightFt = Number(autoAdjust.heightFt);
    const heightIn = Number(autoAdjust.heightIn);
    const age = Number(autoAdjust.age);
    const bodyFatPercent = Number(autoAdjust.bodyFatPercent);

    if (!weightLbs || !age || (!heightFt && !heightIn)) {
      return;
    }

    const weightKg = weightLbs * 0.45359237;
    const totalHeightIn = heightFt * 12 + heightIn;
    if (!totalHeightIn) {
      return;
    }
    const heightCm = totalHeightIn * 2.54;

    const hasBodyFat = Number.isFinite(bodyFatPercent) && bodyFatPercent > 0 && bodyFatPercent < 100;
    const leanMassKg = hasBodyFat ? weightKg * (1 - bodyFatPercent / 100) : weightKg;
    const bmr = hasBodyFat
      ? 370 + 21.6 * leanMassKg
      : 10 * weightKg + 6.25 * heightCm - 5 * age + (autoAdjust.sex === "female" ? -161 : autoAdjust.sex === "male" ? 5 : 0);

    const multiplier = activityMultipliers[autoAdjust.activity] ?? activityMultipliers.moderate;
    const proteinTarget = goalProteinTargets[autoAdjust.goal] ?? goalProteinTargets.maintenance;
    const pace = Number(autoAdjust.pace);
    const paceDelta = Number.isFinite(pace) ? (pace * 3500) / 7 : 0;
    const direction = autoAdjust.goal === "maintenance" ? 0 : autoAdjust.goal === "gain-weight" || autoAdjust.goal === "bulk" ? 1 : -1;
    const dailyCalories = Math.max(1200, Math.round(bmr * multiplier + paceDelta * direction));

    const leanMassLb = leanMassKg * 2.20462262;
    const proteinGrams = Math.max(0, Math.round(leanMassLb * proteinTarget));
    const proteinCalories = proteinGrams * 4;

    const fatFloorGrams = Math.round(weightLbs * 0.3);
    const fatMinCalories = Math.round(dailyCalories * 0.2);
    const fatGrams = Math.max(fatFloorGrams, Math.round(fatMinCalories / 9));
    const fatCalories = fatGrams * 9;

    const remainingCalories = Math.max(0, dailyCalories - proteinCalories - fatCalories);
    const carbGrams = Math.round(remainingCalories / 4);
    const carbCalories = carbGrams * 4;

    let proteinPercent = Math.round((proteinCalories / dailyCalories) * 100);
    let fatPercent = Math.round((fatCalories / dailyCalories) * 100);
    let carbPercent = Math.max(0, 100 - proteinPercent - fatPercent);
    if (carbPercent === 0 && dailyCalories > 0) {
      carbPercent = Math.round((carbCalories / dailyCalories) * 100);
      fatPercent = Math.max(0, 100 - proteinPercent - carbPercent);
    }

    const nextGoals = {
      dailyCalories,
      proteinPercent,
      carbPercent,
      fatPercent,
    };

    setFormData(nextGoals);
    await updateGoalsMutation.mutateAsync(nextGoals);
    setHasLoadedGoals(true);
  };

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
            <h1 className="text-2xl font-bold text-foreground">Profile & Goals</h1>
          </div>
        </div>
      </nav>

      <div className="container py-8">
        <div className="max-w-2xl mx-auto space-y-8">
          {/* User Info */}
          <Card className="p-8 border-border/40">
            <h2 className="text-2xl font-bold text-foreground mb-6">Account Information</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">Name</label>
                <div className="flex items-center gap-3">
                  <Input
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    className="input-elegant flex-1"
                    placeholder="Enter your name"
                  />
                  <Button
                    variant="outline"
                    onClick={handleProfileSave}
                    disabled={updateProfileMutation.isPending || !nameInput.trim()}
                  >
                    Save
                  </Button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">Email</label>
                <div className="p-3 rounded-lg bg-muted text-foreground">{user?.email || "Not set"}</div>
              </div>
              <div className="pt-4">
                <Button
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={handleSignOut}
                >
                  Sign Out
                </Button>
              </div>
            </div>
          </Card>

          <Card className="p-6 border-border/40">
            <button
              onClick={() => setLocation("/history")}
              className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors"
            >
              <span className="font-medium text-foreground">Nutrition History</span>
              <ArrowLeft className="w-4 h-4 text-muted-foreground rotate-180" />
            </button>
          </Card>

          {/* Nutrition Goals */}
          <Card className="p-8 border-border/40">
            <h2 className="text-2xl font-bold text-foreground mb-6">Order Email Connections</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-foreground">Gmail</p>
                  <p className="text-sm text-muted-foreground">
                    {gmailConnected ? "Connected" : "Not connected"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (gmailConnected) {
                        disconnectGmailMutation.mutateAsync();
                        return;
                      }
                      window.location.href = "/api/gmail/connect";
                    }}
                    disabled={disconnectGmailMutation.isPending}
                  >
                    {gmailConnected ? "Unconnect Gmail" : "Connect Gmail"}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={syncGmailMutation.isPending || !gmailConnected}
                    onClick={() => syncGmailMutation.mutateAsync()}
                    className="gap-2"
                  >
                    {syncGmailMutation.isPending ? "Syncing..." : "Sync Orders"}
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(event) => {
                        event.stopPropagation();
                        setShowSyncHelp((prev) => !prev);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          event.stopPropagation();
                          setShowSyncHelp((prev) => !prev);
                        }
                      }}
                      className="w-5 h-5 rounded-full border border-border/60 text-[10px] text-muted-foreground hover:text-foreground hover:border-border transition-colors flex items-center justify-center"
                      aria-label="Sync orders help"
                    >
                      ?
                    </span>
                  </Button>
                </div>
              </div>
              {showSyncHelp ? (
                <p className="text-xs text-muted-foreground">
                  Sync Orders scans your Gmail for the most recent order confirmations from restaurants in our database
                  and logs matching items.
                </p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                We only read order confirmation emails for restaurants in our database.
              </p>
            </div>
          </Card>

          {/* Nutrition Goals */}
          <Card className="p-8 border-border/40">
            <h2 className="text-2xl font-bold text-foreground mb-6">Nutrition Goals</h2>

            <Card className="p-6 mb-8 border-border/40">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-foreground">Auto-Adjust Goals</h3>
                <Button variant="outline" onClick={handleAutoAdjust}>
                  Auto-Adjust
                </Button>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-2">Goal</label>
                  <select
                    className="input-elegant w-full"
                    value={autoAdjust.goal}
                    onChange={(e) => setAutoAdjust((prev) => ({ ...prev, goal: e.target.value }))}
                  >
                    <option value="lose-weight">Lose weight</option>
                    <option value="lose-fat">Lose fat</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="gain-weight">Gain weight</option>
                    <option value="bulk">Bulk</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-2">Goal pace</label>
                  <select
                    className="input-elegant w-full"
                    value={autoAdjust.pace}
                    onChange={(e) => setAutoAdjust((prev) => ({ ...prev, pace: e.target.value }))}
                  >
                    <option value="0.25">0.25 lb/week</option>
                    <option value="0.5">0.5 lb/week</option>
                    <option value="1">1 lb/week</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-2">Activity level</label>
                  <select
                    className="input-elegant w-full"
                    value={autoAdjust.activity}
                    onChange={(e) => setAutoAdjust((prev) => ({ ...prev, activity: e.target.value }))}
                  >
                    <option value="sedentary">Sedentary</option>
                    <option value="light">Lightly active</option>
                    <option value="moderate">Moderately active</option>
                    <option value="active">Very active</option>
                    <option value="athlete">Athlete</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-2">Sex</label>
                  <select
                    className="input-elegant w-full"
                    value={autoAdjust.sex}
                    onChange={(e) => setAutoAdjust((prev) => ({ ...prev, sex: e.target.value }))}
                  >
                    <option value="unspecified">Unspecified</option>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-2">Weight (lbs)</label>
                  <Input
                    type="number"
                    value={autoAdjust.weightLbs}
                    onChange={(e) => setAutoAdjust((prev) => ({ ...prev, weightLbs: e.target.value }))}
                    className="input-elegant w-full"
                    min={50}
                    max={600}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-2">Height</label>
                  <div className="flex items-center gap-3">
                    <Input
                      type="number"
                      value={autoAdjust.heightFt}
                      onChange={(e) => setAutoAdjust((prev) => ({ ...prev, heightFt: e.target.value }))}
                      className="input-elegant w-full"
                      min={3}
                      max={8}
                      placeholder="ft"
                    />
                    <Input
                      type="number"
                      value={autoAdjust.heightIn}
                      onChange={(e) => setAutoAdjust((prev) => ({ ...prev, heightIn: e.target.value }))}
                      className="input-elegant w-full"
                      min={0}
                      max={11}
                      placeholder="in"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-2">Age</label>
                  <Input
                    type="number"
                    value={autoAdjust.age}
                    onChange={(e) => setAutoAdjust((prev) => ({ ...prev, age: e.target.value }))}
                    className="input-elegant w-full"
                    min={10}
                    max={100}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-2">Body fat % (optional)</label>
                  <Input
                    type="number"
                    value={autoAdjust.bodyFatPercent}
                    onChange={(e) => setAutoAdjust((prev) => ({ ...prev, bodyFatPercent: e.target.value }))}
                    className="input-elegant w-full"
                    min={5}
                    max={60}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-4">
                Auto-adjust uses your inputs to calculate daily calories and macro splits.
              </p>
            </Card>

            <div className="space-y-8">
              {/* Daily Calorie Goal */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-3">Daily Calorie Target</label>
                <div className="flex items-center gap-4">
                  <Input
                    type="number"
                    value={formData.dailyCalories}
                    onChange={(e) => handleInputChange("dailyCalories", Number(e.target.value))}
                    className="input-elegant flex-1"
                    min={1000}
                    max={5000}
                    step={100}
                  />
                  <span className="text-sm text-muted-foreground">calories/day</span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Typical range: 1,500 - 3,000 calories depending on activity level
                </p>
              </div>

              {/* Macro Distribution */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-4">Macronutrient Distribution</label>

                <div className="space-y-6">
                  {/* Protein */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-sm font-medium text-foreground">Protein</label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          value={formData.proteinPercent}
                          onChange={(e) => handleInputChange("proteinPercent", Number(e.target.value))}
                          className="input-elegant w-20 text-center"
                          min={10}
                          max={50}
                        />
                        <span className="text-sm text-muted-foreground">%</span>
                      </div>
                    </div>
                    <div className="macro-bar" style={{ background: 'linear-gradient(to right, rgb(239, 68, 68), rgb(239, 68, 68))', width: `${formData.proteinPercent}%` }}></div>
                    <p className="text-xs text-muted-foreground mt-2">
                      {Math.round((formData.dailyCalories * formData.proteinPercent) / 100 / 4)}g per day
                    </p>
                  </div>

                  {/* Carbs */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-sm font-medium text-foreground">Carbohydrates</label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          value={formData.carbPercent}
                          onChange={(e) => handleInputChange("carbPercent", Number(e.target.value))}
                          className="input-elegant w-20 text-center"
                          min={20}
                          max={70}
                        />
                        <span className="text-sm text-muted-foreground">%</span>
                      </div>
                    </div>
                    <div className="macro-bar" style={{ background: 'linear-gradient(to right, rgb(251, 146, 60), rgb(251, 146, 60))', width: `${formData.carbPercent}%` }}></div>
                    <p className="text-xs text-muted-foreground mt-2">
                      {Math.round((formData.dailyCalories * formData.carbPercent) / 100 / 4)}g per day
                    </p>
                  </div>

                  {/* Fat */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-sm font-medium text-foreground">Fat</label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          value={formData.fatPercent}
                          onChange={(e) => handleInputChange("fatPercent", Number(e.target.value))}
                          className="input-elegant w-20 text-center"
                          min={10}
                          max={50}
                        />
                        <span className="text-sm text-muted-foreground">%</span>
                      </div>
                    </div>
                    <div className="macro-bar" style={{ background: 'linear-gradient(to right, rgb(168, 85, 247), rgb(168, 85, 247))', width: `${formData.fatPercent}%` }}></div>
                    <p className="text-xs text-muted-foreground mt-2">
                      {Math.round((formData.dailyCalories * formData.fatPercent) / 100 / 9)}g per day
                    </p>
                  </div>
                </div>

                {/* Total Percentage Check */}
                <div className="mt-6 p-4 rounded-lg bg-muted">
                  <p className="text-sm">
                    <span className="font-medium text-foreground">Total Distribution: </span>
                    <span className={totalPercent === 100 ? "text-green-600" : "text-orange-600"}>
                      {totalPercent}%
                    </span>
                  </p>
                  {totalPercent !== 100 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Adjust macros so the total equals 100%
                    </p>
                  )}
                </div>
              </div>

              {/* Save Button */}
              <div className="pt-4">
                <Button
                  onClick={handleSave}
                  disabled={updateGoalsMutation.isPending || totalPercent !== 100}
                  className="w-full bg-accent hover:bg-accent/90"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {updateGoalsMutation.isPending ? "Saving..." : "Save Goals"}
                </Button>
              </div>
            </div>
          </Card>

          {/* Info Card */}
          <Card className="p-6 border-border/40 bg-accent/5">
            <h3 className="font-semibold text-foreground mb-3">Nutrition Tips</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• Protein helps build and repair muscle tissue</li>
              <li>• Carbohydrates provide energy for daily activities</li>
              <li>• Fat supports hormone production and nutrient absorption</li>
              <li>• Adjust your goals based on your fitness objectives</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
