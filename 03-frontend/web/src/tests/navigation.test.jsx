import { describe, expect, it } from "vitest";
import {
  findNavigationItem,
  getNavigationForRole,
  mobilePriorityItems,
  navigationGroups,
  navigationItems
} from "../app/navigation.js";
import { translate } from "../app/i18n.js";

describe("navigation configuration", () => {
  it("has unique ids and route values", () => {
    expect(new Set(navigationItems.map((item) => item.id)).size).toBe(navigationItems.length);
    expect(new Set(navigationItems.map((item) => item.path)).size).toBe(navigationItems.length);
  });

  it("resolves required translation keys", () => {
    for (const group of navigationGroups) {
      expect(translate("en", group.translationKey)).not.toBe(group.translationKey);
      for (const item of group.items) {
        expect(translate("ar", item.translationKey)).not.toBe(item.translationKey);
        expect(translate("zh-CN", item.translationKey)).not.toBe(item.translationKey);
      }
    }
  });

  it("uses valid mobile-priority items", () => {
    const ids = new Set(navigationItems.map((item) => item.id));
    expect(mobilePriorityItems.length).toBeGreaterThan(0);
    expect(mobilePriorityItems.every((item) => ids.has(item.id))).toBe(true);
  });

  // Phase 3 decision: assistant + recommendations duplicate functionality that
  // already lives in the workspace, so they are hidden from navigation while
  // their routes, pages and APIs stay intact.
  it("hides MVP-hidden items from navigation but keeps their routes resolvable", () => {
    const visibleIds = navigationItems.map((item) => item.id);
    expect(visibleIds).not.toContain("assistant");
    expect(visibleIds).not.toContain("recommendations");

    for (const role of ["owner", "branch_manager", "viewer"]) {
      const sidebarIds = getNavigationForRole(role).flatMap((group) => group.items.map((item) => item.id));
      expect(sidebarIds).not.toContain("assistant");
      expect(sidebarIds).not.toContain("recommendations");
    }

    // Direct URL navigation still resolves a title for the hidden pages.
    expect(findNavigationItem("/app/assistant")).toBeTruthy();
    expect(findNavigationItem("/app/recommendations")).toBeTruthy();
    // Every rendered navigation entry stays reachable.
    expect(findNavigationItem("/app/workspace")).toBeTruthy();
  });
});
