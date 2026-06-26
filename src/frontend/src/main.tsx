import { InternetIdentityProvider } from "@caffeineai/core-infrastructure";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

BigInt.prototype.toJSON = function () {
  return this.toString();
};

declare global {
  interface BigInt {
    toJSON(): string;
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const USE_MOCK_BACKEND = import.meta.env.VITE_USE_MOCK_BACKEND === "true";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    {USE_MOCK_BACKEND ? (
      <App />
    ) : (
      <InternetIdentityProvider>
        <App />
      </InternetIdentityProvider>
    )}
  </QueryClientProvider>,
);
