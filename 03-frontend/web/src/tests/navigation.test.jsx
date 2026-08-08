import { describe, expect, it } from "vitest";
import { mobilePriorityItems, navigationGroups, navigationItems } from "../app/navigation.js";
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
});
