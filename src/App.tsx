import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import DashboardLayout from "./layouts/DashboardLayout";
import Dashboard from "./pages/Dashboard";
import Placeholder from "./pages/dashboard/Placeholder";
import Wallets from "./pages/dashboard/Wallets";
import Categories from "./pages/dashboard/Categories";
import Cards from "./pages/dashboard/Cards";
import Bills from "./pages/dashboard/Bills";
import Goals from "./pages/dashboard/Goals";
import Investments from "./pages/dashboard/Investments";
import Behavior from "./pages/dashboard/Behavior";
import Reports from "./pages/dashboard/Reports";
import SupportChat from "./pages/dashboard/SupportChat";
import AdminSupport from "./pages/dashboard/AdminSupport";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="transactions" element={<Bills />} />
              <Route path="wallets" element={<Wallets />} />
              <Route path="cards" element={<Cards />} />
              <Route path="budgets" element={<Categories />} />
              <Route path="goals" element={<Goals />} />
              <Route path="reports" element={<Reports />} />
              <Route path="chat" element={<SupportChat />} />
              <Route path="family" element={<Placeholder />} />
              <Route path="settings" element={<Placeholder />} />
              <Route path="investments" element={<Investments />} />
              <Route path="behavior" element={<Behavior />} />
              <Route path="admin/support" element={<AdminSupport />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
