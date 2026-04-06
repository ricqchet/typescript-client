import { describe, it, expect } from "vitest";
import { buildQueryString, mapPaginationMeta } from "../src/pagination";

describe("buildQueryString", () => {
  it("returns empty string for undefined params", () => {
    expect(buildQueryString()).toBe("");
  });

  it("returns empty string for empty params", () => {
    expect(buildQueryString({})).toBe("");
  });

  it("builds cursor pagination params", () => {
    const qs = buildQueryString({ first: 10, after: "cursor123" });
    expect(qs).toBe("?first=10&after=cursor123");
  });

  it("builds offset pagination params", () => {
    const qs = buildQueryString({ offset: 20, limit: 10 });
    expect(qs).toBe("?offset=20&limit=10");
  });

  it("builds sorting params", () => {
    const qs = buildQueryString({
      orderBy: ["name", "status"],
      orderDirections: ["asc", "desc"],
    });
    expect(qs).toContain("order_by[]=name");
    expect(qs).toContain("order_by[]=status");
    expect(qs).toContain("order_directions[]=asc");
    expect(qs).toContain("order_directions[]=desc");
  });

  it("builds filter params", () => {
    const qs = buildQueryString({
      filters: [
        { field: "name", op: "ilike", value: "prod" },
        { field: "status", op: "==", value: "active" },
      ],
    });
    expect(qs).toContain("filters[0][field]=name");
    expect(qs).toContain("filters[0][op]=ilike");
    expect(qs).toContain("filters[0][value]=prod");
    expect(qs).toContain("filters[1][field]=status");
    expect(qs).toContain("filters[1][op]=%3D%3D");
    expect(qs).toContain("filters[1][value]=active");
  });

  it("encodes special characters", () => {
    const qs = buildQueryString({ after: "abc=def&ghi" });
    expect(qs).toBe("?after=abc%3Ddef%26ghi");
  });

  it("combines all param types", () => {
    const qs = buildQueryString({
      first: 5,
      after: "c1",
      orderBy: ["name"],
      orderDirections: ["asc"],
      filters: [{ field: "name", op: "ilike", value: "test" }],
    });
    expect(qs).toContain("first=5");
    expect(qs).toContain("after=c1");
    expect(qs).toContain("order_by[]=name");
    expect(qs).toContain("filters[0][field]=name");
  });
});

describe("mapPaginationMeta", () => {
  it("maps snake_case to camelCase", () => {
    const meta = mapPaginationMeta({
      total: 42,
      has_next_page: true,
      has_previous_page: false,
      start_cursor: "s1",
      end_cursor: "e1",
      current_offset: 0,
      current_page: 1,
      total_pages: 5,
    });

    expect(meta.total).toBe(42);
    expect(meta.hasNextPage).toBe(true);
    expect(meta.hasPreviousPage).toBe(false);
    expect(meta.startCursor).toBe("s1");
    expect(meta.endCursor).toBe("e1");
    expect(meta.currentOffset).toBe(0);
    expect(meta.currentPage).toBe(1);
    expect(meta.totalPages).toBe(5);
  });

  it("handles null cursors", () => {
    const meta = mapPaginationMeta({
      total: 0,
      has_next_page: false,
      has_previous_page: false,
    });

    expect(meta.startCursor).toBeNull();
    expect(meta.endCursor).toBeNull();
  });
});
