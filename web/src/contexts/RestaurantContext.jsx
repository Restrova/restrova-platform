import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./AuthContext.jsx";

const RESTAURANT_KEY = "selectedRestaurantId";
const BRANCH_KEY = "selectedBranchId";
const RestaurantContext = createContext(null);

function normalizeId(value) {
  if (value === null || value === undefined || value === "") return "";
  return String(value);
}

function getStoredId(key) {
  return normalizeId(localStorage.getItem(key));
}

function isDemoSession(session) {
  return Boolean(session?.user?.email?.endsWith(".test") || session?.organization?.name?.toLowerCase().includes("demo"));
}

export function RestaurantProvider({ children }) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [selectedRestaurantId, setSelectedRestaurantIdState] = useState(() => getStoredId(RESTAURANT_KEY));
  const [selectedBranchId, setSelectedBranchIdState] = useState(() => getStoredId(BRANCH_KEY));
  const session = auth.session;

  const restaurants = useMemo(() => {
    return session?.restaurant ? [{ ...session.restaurant, id: normalizeId(session.restaurant.id) }] : [];
  }, [session?.restaurant]);

  const branches = useMemo(() => {
    return (session?.branches || []).map((branch) => ({ ...branch, id: normalizeId(branch.id) }));
  }, [session?.branches]);

  useEffect(() => {
    if (!restaurants.length) {
      setSelectedRestaurantIdState("");
      localStorage.removeItem(RESTAURANT_KEY);
      return;
    }

    const validRestaurant = restaurants.find((restaurant) => restaurant.id === selectedRestaurantId);
    if (!validRestaurant) {
      const nextId = restaurants[0].id;
      setSelectedRestaurantIdState(nextId);
      localStorage.setItem(RESTAURANT_KEY, nextId);
    }
  }, [restaurants, selectedRestaurantId]);

  useEffect(() => {
    if (!branches.length) {
      setSelectedBranchIdState("");
      localStorage.removeItem(BRANCH_KEY);
      return;
    }

    const validBranch = branches.find((branch) => branch.id === selectedBranchId);
    if (!validBranch) {
      const nextId = branches[0].id;
      setSelectedBranchIdState(nextId);
      localStorage.setItem(BRANCH_KEY, nextId);
    }
  }, [branches, selectedBranchId]);

  const setSelectedRestaurantId = useCallback((restaurantId) => {
    const normalized = normalizeId(restaurantId);
    const restaurant = restaurants.find((item) => item.id === normalized);
    if (!restaurant) return false;
    setSelectedRestaurantIdState(normalized);
    localStorage.setItem(RESTAURANT_KEY, normalized);
    const nextBranch = branches[0]?.id || "";
    setSelectedBranchIdState(nextBranch);
    if (nextBranch) localStorage.setItem(BRANCH_KEY, nextBranch);
    else localStorage.removeItem(BRANCH_KEY);
    queryClient.invalidateQueries();
    return true;
  }, [branches, queryClient, restaurants]);

  const setSelectedBranchId = useCallback((branchId) => {
    const normalized = normalizeId(branchId);
    if (!normalized) {
      setSelectedBranchIdState("");
      localStorage.removeItem(BRANCH_KEY);
      queryClient.invalidateQueries();
      return true;
    }
    const branch = branches.find((item) => item.id === normalized);
    if (!branch) return false;
    setSelectedBranchIdState(normalized);
    localStorage.setItem(BRANCH_KEY, normalized);
    queryClient.invalidateQueries();
    return true;
  }, [branches, queryClient]);

  const selectedRestaurant = restaurants.find((restaurant) => restaurant.id === selectedRestaurantId) || restaurants[0] || null;
  const selectedBranch = branches.find((branch) => branch.id === selectedBranchId) || branches[0] || null;

  const value = useMemo(() => ({
    loading: auth.status === "checking",
    error: auth.error,
    restaurants,
    branches,
    selectedRestaurantId: selectedRestaurant?.id || "",
    selectedBranchId: selectedBranch?.id || "",
    selectedRestaurant,
    selectedBranch,
    role: auth.user?.role || "viewer",
    demoMode: isDemoSession(session),
    setSelectedRestaurantId,
    setSelectedBranchId
  }), [auth.error, auth.status, auth.user?.role, branches, restaurants, selectedBranch, selectedRestaurant, session, setSelectedBranchId, setSelectedRestaurantId]);

  return <RestaurantContext.Provider value={value}>{children}</RestaurantContext.Provider>;
}

export function useRestaurant() {
  const value = useContext(RestaurantContext);
  if (!value) throw new Error("useRestaurant must be used inside RestaurantProvider");
  return value;
}
