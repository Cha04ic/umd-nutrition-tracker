import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { Apple, TrendingUp, Zap } from "lucide-react";

type HomeProps = {
  skipRedirect?: boolean;
};

export default function Home({ skipRedirect = false }: HomeProps) {
  const { user, loading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!skipRedirect && isAuthenticated && !loading) {
      setLocation("/dashboard");
    }
  }, [isAuthenticated, loading, setLocation, skipRedirect]);

  useEffect(() => {
    // Trigger animation on mount
    setIsLoaded(true);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-accent"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (isAuthenticated && !skipRedirect) {
    return null;
  }

  const handlePrimaryCta = () => {
    if (isAuthenticated) {
      setLocation("/dashboard");
      return;
    }
    window.location.href = getLoginUrl();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Navigation */}
      <nav className="border-b border-border/40 backdrop-blur-sm sticky top-0 z-50 bg-slate-950/80">
        <div className="container flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-accent to-accent/60 flex items-center justify-center">
              <Apple className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold text-foreground">CalTerp</span>
          </div>
          {isAuthenticated ? (
            <span className="text-sm text-muted-foreground">
              Hi, {user?.name || "there"}
            </span>
          ) : (
            <a href={getLoginUrl()} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Sign In
            </a>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <section className="container py-20 md:py-32">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div
            className={`space-y-6 fade-slide-up ${isLoaded ? "is-visible" : ""}`}
          >
            <div className="space-y-3">
              <h1 className="text-5xl md:text-6xl font-bold text-foreground leading-tight">
                Track Your Nutrition at UMD
              </h1>
              <p className="text-xl text-muted-foreground">
                Monitor calories, macros, and nutrition goals with real-time dining hall menu data from University of Maryland.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              <Button
                size="lg"
                className="w-full sm:w-auto bg-accent hover:bg-accent/90"
                onClick={handlePrimaryCta}
              >
                Get Started
              </Button>
              <Button size="lg" variant="outline" className="w-full sm:w-auto">
                Learn More
              </Button>
            </div>

            <div className="flex items-center gap-2 text-sm text-muted-foreground pt-4">
              <div className="w-2 h-2 rounded-full bg-accent"></div>
              <span>No credit card required • Free to use</span>
            </div>
          </div>

          <div
            className={`relative fade-slide-up ${isLoaded ? "is-visible" : ""}`}
            style={{ animationDelay: "150ms" }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-accent/20 to-accent/5 rounded-3xl blur-3xl"></div>
            <Card className="relative p-8 border-border/40 shadow-lg">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">Today's Intake</span>
                  <span className="text-2xl font-bold text-foreground">1,850 cal</span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Protein</span>
                    <span className="font-medium">125g</span>
                  </div>
                  <div className="macro-bar" style={{ background: 'linear-gradient(to right, rgb(239, 68, 68), rgb(239, 68, 68))' }}></div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Carbs</span>
                    <span className="font-medium">220g</span>
                  </div>
                  <div className="macro-bar" style={{ background: 'linear-gradient(to right, rgb(251, 146, 60), rgb(251, 146, 60))' }}></div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Fat</span>
                    <span className="font-medium">60g</span>
                  </div>
                  <div className="macro-bar" style={{ background: 'linear-gradient(to right, rgb(168, 85, 247), rgb(168, 85, 247))' }}></div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="container py-20">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-foreground mb-4">Powerful Features</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Everything you need to track your nutrition and reach your health goals.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          <Card className="p-8 border-border/40 hover:shadow-lg transition-shadow">
            <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center mb-4">
              <Apple className="w-6 h-6 text-accent" />
            </div>
            <h3 className="text-xl font-semibold text-foreground mb-2">Real Dining Menus</h3>
            <p className="text-muted-foreground">
              Browse current and upcoming menus from South Campus, Yahentamitsi, and 251 North dining halls.
            </p>
          </Card>

          <Card className="p-8 border-border/40 hover:shadow-lg transition-shadow">
            <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center mb-4">
              <TrendingUp className="w-6 h-6 text-accent" />
            </div>
            <h3 className="text-xl font-semibold text-foreground mb-2">Track Progress</h3>
            <p className="text-muted-foreground">
              Monitor your daily intake and view detailed nutrition history with date filtering.
            </p>
          </Card>

          <Card className="p-8 border-border/40 hover:shadow-lg transition-shadow">
            <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center mb-4">
              <Zap className="w-6 h-6 text-accent" />
            </div>
            <h3 className="text-xl font-semibold text-foreground mb-2">Custom Goals</h3>
            <p className="text-muted-foreground">
              Set personalized daily nutrition targets and track your macronutrient ratios.
            </p>
          </Card>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container py-20">
        <Card className="p-12 md:p-16 border-border/40 bg-gradient-to-r from-accent/5 to-accent/10">
          <div className="text-center space-y-6">
            <h2 className="text-4xl font-bold text-foreground">Ready to start tracking?</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Join UMD students in making smarter nutrition choices with real dining hall data.
            </p>
            <Button size="lg" className="bg-accent hover:bg-accent/90" onClick={handlePrimaryCta}>
              {isAuthenticated ? "Go to Dashboard" : "Sign In with Google"}
            </Button>
          </div>
        </Card>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 mt-20 py-8">
        <div className="container flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
          <p>&copy; 2026 CalTerp. All rights reserved.</p>
          <div className="flex gap-6">
            <a href="#" className="hover:text-foreground transition-colors">Privacy</a>
            <a href="#" className="hover:text-foreground transition-colors">Terms</a>
            <a href="#" className="hover:text-foreground transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
