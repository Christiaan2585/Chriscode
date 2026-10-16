import React, { lazy, useEffect, useState } from "react";
import { HashRouter as BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import apiClient from "./api/client";
import { startOutboxAutoFlush } from "./utils/outbox";
import { isNative } from "./utils/pairing";
import { startReachabilityWatch } from "./offline/connectivity";
import PairingScreen from "./components/PairingScreen";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider, ToastErrorBridge } from "./context/ToastContext";
import UndoDelete from "./components/UndoDelete";
import AuthGate from "./pages/AuthGate";
import AppLayout from "./layout/AppLayout";

// Each page is its own file that loads the first time it is opened, so the app starts without having to read
// every screen (and the charts) first.
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Clients = lazy(() => import("./pages/Clients"));
const Animals = lazy(() => import("./pages/Animals"));
const ClientDetail = lazy(() => import("./pages/ClientDetail"));
const Products = lazy(() => import("./pages/Products"));
const Calculator = lazy(() => import("./pages/Calculator"));
const Herds = lazy(() => import("./pages/Herds"));
const Calendar = lazy(() => import("./pages/Calendar"));
const Quotes = lazy(() => import("./pages/Quotes"));
const Orders = lazy(() => import("./pages/Orders"));
const Invoices = lazy(() => import("./pages/Invoices"));
const Settings = lazy(() => import("./pages/Settings"));
const Programs = lazy(() => import("./pages/Programs"));
const Weather = lazy(() => import("./pages/Weather"));
const PurchaseOrders = lazy(() => import("./pages/PurchaseOrders"));
const ProgramSheet = lazy(() => import("./pages/ProgramSheet"));
const Reports = lazy(() => import("./pages/Reports"));

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
        <UndoDelete />
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
                  <Route path="reports" element={<Reports />} />
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
