import React from "react";
import { HashRouter as BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider, ToastErrorBridge } from "./context/ToastContext";
import AuthGate from "./pages/AuthGate";
import AppLayout from "./layout/AppLayout";
import Dashboard from "./pages/Dashboard";
import Clients from "./pages/Clients";
import Animals from "./pages/Animals";
import ClientDetail from "./pages/ClientDetail";
import Products from "./pages/Products";
import Calculator from "./pages/Calculator";
import Herds from "./pages/Herds";
import Calendar from "./pages/Calendar";
import Quotes from "./pages/Quotes";
import Orders from "./pages/Orders";
import Invoices from "./pages/Invoices";
import Settings from "./pages/Settings";
import Programs from "./pages/Programs";

const queryClient = new QueryClient();

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ToastErrorBridge />
        <AuthProvider>
          <AuthGate>
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<AppLayout />}>
                  <Route index element={<Dashboard />} />
                  <Route path="clients" element={<Clients />} />
                  <Route path="clients/:id" element={<ClientDetail />} />
                  <Route path="animals" element={<Animals />} />
                  <Route path="products" element={<Products />} />
                  <Route path="herds" element={<Herds />} />
                  <Route path="programs" element={<Programs />} />
                  <Route path="calendar" element={<Calendar />} />
                  <Route path="calculator" element={<Calculator />} />
                  <Route path="quotes" element={<Quotes />} />
                  <Route path="orders" element={<Orders />} />
                  <Route path="invoices" element={<Invoices />} />
                  <Route path="settings" element={<Settings />} />
                </Route>
              </Routes>
            </BrowserRouter>
          </AuthGate>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
};

export default App;
