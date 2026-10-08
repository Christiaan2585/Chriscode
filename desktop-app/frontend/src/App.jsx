import React, { useEffect, useState } from "react";
import { HashRouter as BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import apiClient from "./api/client";
import { startOutboxAutoFlush } from "./utils/outbox";
import { isNative } from "./utils/pairing";
import { startReachabilityWatch } from "./offline/connectivity";
import PairingScreen from "./components/PairingScreen";
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
import Weather from "./pages/Weather";
import PurchaseOrders from "./pages/PurchaseOrders";
import ProgramSheet from "./pages/ProgramSheet";

// On a phone a read that finds the office PC out of reach is answered from the saved copy, so there is no point
// asking again and again; the PC coming back refreshes everything (offline/sync.js).
const queryClient = new QueryClient(isNative() ? { defaultOptions: { queries: { retry: false, networkMode: "always", staleTime: 15000 } } } : undefined);

const App = ({ initiallyPaired = false }) => {
  const [paired, setPaired] = useState(initiallyPaired);
  useEffect(() => startOutboxAutoFlush(), []);
  // Phone only: keep asking whether the office PC is answering, so "Offline" and catching up are timely.
  useEffect(
    () => (isNative() && paired
      ? startReachabilityWatch(() => apiClient.get("/version", { silent: true, queueable: true, timeout: 6000, fast: true }))
      : undefined),
    [paired],
  );

  if (isNative() && !paired) {
    return <PairingScreen onPaired={() => setPaired(true)} />;
  }

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
                  <Route path="programs" element={<Quotes />} />
                  <Route path="programs/master" element={<Programs />} />
                  <Route path="programs/:programId" element={<ProgramSheet />} />
                  <Route path="calendar" element={<Calendar />} />
                  <Route path="weather" element={<Weather />} />
                  <Route path="calculator" element={<Calculator />} />
                  <Route path="quotes" element={<Quotes />} />
                  <Route path="orders" element={<Orders />} />
                  <Route path="invoices" element={<Invoices />} />
                  <Route path="purchase-orders" element={<PurchaseOrders />} />
                  <Route path="settings" element={<Settings />} />
                  <Route path="settings/:section" element={<Settings />} />
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
