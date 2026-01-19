import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Suspense, lazy, useEffect } from "react";
import NotFound from "@/pages/not-found";
import PageSkeleton from "@/components/page-skeleton";
import { track } from "@/lib/telemetry";
import { useLocation } from "wouter";
import { ErrorBoundary } from "@/components/error-boundary";
import FloatingNav from "@/components/floating-nav";
import BottomTabBar from "@/components/bottom-tab-bar";
import { v4 as uuidv4 } from 'uuid';

const Home = lazy(() => import("@/pages/home"));
const About = lazy(() => import("@/pages/about"));
const Projects = lazy(() => import("@/pages/projects"));
const ProjectDetail = lazy(() => import("@/pages/project-detail"));
const Chat = lazy(() => import("@/pages/chat"));
const LoginPage = lazy(() => import("@/pages/admin/login"));
const DashboardPage = lazy(() => import("@/pages/admin/dashboard"));

function Router() {
  return (
    <>
      <FloatingNav />
      <BottomTabBar />
      <div className="pb-20 md:pb-0">
        <Suspense fallback={<PageSkeleton />}>
          <Switch>
            <Route path="/" component={Home} />
            <Route path="/about" component={About} />
            <Route path="/projects" component={Projects} />
            <Route path="/projects/:id" component={ProjectDetail} />
            <Route path="/chat" component={Chat} />
            <Route path="/admin/login" component={LoginPage} />
            <Route path="/admin/dashboard" component={DashboardPage} />
            <Route component={NotFound} />
          </Switch>
        </Suspense>
      </div>
    </>
  );
}

function App() {
  const [location] = useLocation();
  useEffect(() => {
    if (!localStorage.getItem('sessionId')) {
      localStorage.setItem('sessionId', uuidv4());
    }
  }, []);

  // Page view tracking
  useEffect(() => {
    if (location) {
      track('page_view', { path: location });
    }
  }, [location]);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <ErrorBoundary>
          <Router />
        </ErrorBoundary>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;