import { Component, ReactNode, Suspense, lazy } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { PlayerProvider } from "@/contexts/PlayerContext";
import { AppShell } from "@/components/layout/AppShell";
import { Navigate } from "react-router-dom";

// Route-level code splitting. The always-present shell (AppShell + persistent
// <Player/> footer) stays in the main bundle so navigation never flashes it; the
// per-route page bodies are split into separate chunks, shrinking the initial
// download and making first paint / navigation snappier. The Suspense fallback
// renders inside the shell, so only the page area shows the spinner.
const Auth = lazy(() => import("./pages/Auth"));
const Home = lazy(() => import("./pages/Home"));
const Search = lazy(() => import("./pages/Search"));
const Liked = lazy(() => import("./pages/Liked"));
const Profile = lazy(() => import("./pages/Profile"));
const AdminLayout = lazy(() => import("./pages/admin/AdminLayout"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminSongs = lazy(() => import("./pages/admin/AdminSongs"));
const AdminTags = lazy(() => import("./pages/admin/AdminTags"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const AdminAnalytics = lazy(() => import("./pages/admin/AdminAnalytics"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

const RouteFallback = () => (
  <div className="min-h-[40vh] flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
);

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-background text-foreground gap-4 p-8">
        <div className="text-4xl">💔</div>
        <div className="text-lg font-semibold">Something went wrong</div>
        <div className="text-sm text-muted-foreground text-center max-w-sm">{(this.state.error as Error).message}</div>
        <button onClick={() => window.location.reload()} className="mt-2 px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm hover:bg-primary/80 transition-colors">Reload</button>
      </div>
    );
    return this.props.children;
  }
}

const queryClient = new QueryClient();

const RequireAuth = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-dvh flex items-center justify-center bg-background text-muted-foreground text-sm">Loading…</div>;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
};

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <PlayerProvider>
              <Suspense fallback={<RouteFallback />}>
                <Routes>
                  <Route path="/auth" element={<Auth />} />
                  <Route element={<RequireAuth><AppShell /></RequireAuth>}>
                    <Route path="/" element={<Home />} />
                    <Route path="/search" element={<Search />} />
                    <Route path="/liked" element={<Liked />} />
                    <Route path="/profile" element={<Profile />} />
                  </Route>
                  <Route path="/admin" element={<AdminLayout />}>
                    <Route index element={<AdminDashboard />} />
                    <Route path="songs" element={<AdminSongs />} />
                    <Route path="tags" element={<AdminTags />} />
                    <Route path="users" element={<AdminUsers />} />
                    <Route path="analytics" element={<AdminAnalytics />} />
                  </Route>
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </PlayerProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
