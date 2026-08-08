import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "../contexts/AuthContext.jsx";
import { LocaleProvider } from "../contexts/LocaleContext.jsx";
import { RestaurantProvider } from "../contexts/RestaurantContext.jsx";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1
    }
  }
});

export function Providers({ children }) {
  return (
    <QueryClientProvider client={queryClient}>
      <LocaleProvider>
        <AuthProvider>
          <RestaurantProvider>
            <BrowserRouter>{children}</BrowserRouter>
          </RestaurantProvider>
        </AuthProvider>
      </LocaleProvider>
    </QueryClientProvider>
  );
}
