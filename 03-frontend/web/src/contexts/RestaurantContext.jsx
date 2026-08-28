import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./AuthContext.jsx";
import { api } from "../lib/api.js";

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
  return Boolean(
    session?.user?.email?.endsWith(".test") || session?.organization?.name?.toLowerCase().includes("demo")
  );
}

export function RestaurantProvider({ children }) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [selectedRestaurantId, setSelectedRestaurantIdState] = useState(() => getStoredId(RESTAURANT_KEY));
  const [selectedBranchId, setSelectedBranchIdState] = useState(() => getStoredId(BRANCH_KEY));
  const session = auth.session;

  // Real restaurant list for the switcher (H4): fetched from the backend for
  // the current organization, falling back to the session's single restaurant
  // while loading (or when the list endpoint is unavailable).
  const { data: organizationRestaurants } = useQuery({
    queryKey: ["restaurants"],
    queryFn: async () => {
      const data = await api("/restaurants");
      return Array.isArray(data) ? data : [];
    },
    enabled: auth.status === "authenticated"
  });

  const restaurants = useMemo(() => {
    const listed = (organizationRestaurants || []).map((restaurant) => ({
      ...restaurant,
      id: normalizeId(restaurant.id)
    }));
    if (listed.length) return listed;
    return session?.restaurant ? [{ ...session.restaurant, id: normalizeId(session.restaurant.id) }] : [];
  }, [organizationRestaurants, session?.restaurant]);

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

  // Keep the visual selection and the server session pointing at the same
  // restaurant. A persisted selection that differs from the session's default
  // triggers one real switch; if it fails we fall back to the session's
  // restaurant instead of showing a fake selection.
  const sessionRestaurantId = normalizeId(session?.restaurant?.id);
  useEffect(() => {
    if (!restaurants.length || !sessionRestaurantId) return;
    if (selectedRestaurantId === sessionRestaurantId) {
      switchTargetRef.current = "";
      return;
    }
    if (switchTargetRef.current === selectedRestaurantId) return; // already switching there
    const wanted = restaurants.find((restaurant) => restaurant.id === selectedRestaurantId);
    if (!wanted) {
      setSelectedRestaurantIdState(sessionRestaurantId);
      localStorage.setItem(RESTAURANT_KEY, sessionRestaurantId);
      return;
    }
    let cancelled = false;
    switchTargetRef.current = selectedRestaurantId;
    auth.switchRestaurant(selectedRestaurantId).catch(() => {
      if (cancelled) return;
      switchTargetRef.current = "";
      setSelectedRestaurantIdState(sessionRestaurantId);
      localStorage.setItem(RESTAURANT_KEY, sessionRestaurantId);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurants, selectedRestaurantId, sessionRestaurantId]);

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

  // Dedupes switch requests: the optimistic selection in setSelectedRestaurantId
  // and the session-sync effect below would otherwise both call the endpoint.
  const switchTargetRef = useRef("");

  const setSelectedRestaurantId = useCallback(
    (restaurantId) => {
      const normalized = normalizeId(restaurantId);
      const restaurant = restaurants.find((item) => item.id === normalized);
      if (!restaurant) return false;
      // Real switch (H4): ask the backend to reissue the session for the
      // selected restaurant. The optimistic state update below keeps the
      // select responsive; session refresh cascades through auth-change.
      setSelectedRestaurantIdState(normalized);
      localStorage.setItem(RESTAURANT_KEY, normalized);
      setSelectedBranchIdState("");
      localStorage.removeItem(BRANCH_KEY);
      switchTargetRef.current = normalized;
      Promise.resolve(auth.switchRestaurant(normalized))
        .then(() => queryClient.invalidateQueries())
        .catch(() => {});
      return true;
    },
    [auth, queryClient, restaurants]
  );

  const setSelectedBranchId = useCallback(
    (branchId) => {
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
    },
    [branches, queryClient]
  );

  const selectedRestaurant =
    restaurants.find((restaurant) => restaurant.id === selectedRestaurantId) || restaurants[0] || null;
  const selectedBranch = branches.find((branch) => branch.id === selectedBranchId) || branches[0] || null;

  const value = useMemo(
    () => ({
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
    }),
    [
      auth.error,
      auth.status,
      auth.user?.role,
      branches,
      restaurants,
      selectedBranch,
      selectedRestaurant,
      session,
      setSelectedBranchId,
      setSelectedRestaurantId
    ]
  );

  return <RestaurantContext.Provider value={value}>{children}</RestaurantContext.Provider>;
}

export function useRestaurant() {
  const value = useContext(RestaurantContext);
  if (!value) throw new Error("useRestaurant must be used inside RestaurantProvider");
  return value;
}
