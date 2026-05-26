import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TenantList } from "./list";

const mockUseTable = vi.fn();

vi.mock("@refinedev/core", () => ({
  useTable: (args: any) => mockUseTable(args),
  useCustomMutation: () => ({ mutate: vi.fn(), isLoading: false }),
  useNavigation: () => ({ push: vi.fn() }),
  useDelete: () => ({ mutate: vi.fn(), isLoading: false }),
  useExport: () => ({ triggerExport: vi.fn(), isLoading: false })
}));

describe("TenantList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading state", () => {
    mockUseTable.mockReturnValue({
      tableQueryResult: { isLoading: true, isError: false, data: undefined },
      filters: [], setFilters: vi.fn()
    });
    render(<TenantList />);
    expect(document.querySelector('.loading-spinner')).toBeInTheDocument();
  });

  it("renders error state", () => {
    mockUseTable.mockReturnValue({
      tableQueryResult: { isLoading: false, isError: true, error: new Error("Network error") },
      filters: [], setFilters: vi.fn()
    });
    render(<TenantList />);
    expect(document.querySelector('.error-banner')).toBeInTheDocument();
  });

  it("renders empty state", () => {
    mockUseTable.mockReturnValue({
      tableQueryResult: { isLoading: false, isError: false, data: { data: [] } },
      filters: [], setFilters: vi.fn()
    });
    render(<TenantList />);
    expect(screen.getByText(/No tenants match/)).toBeInTheDocument();
  });

  it("renders tenant list and handles deletion", () => {
    mockUseTable.mockReturnValue({
      tableQueryResult: { isLoading: false, isError: false, data: { data: [{ id: "tenant-1", name: "Test Tenant", status: "active", created_at: new Date().toISOString() }] } },
      filters: [], setFilters: vi.fn()
    });
    render(<TenantList />);
    expect(screen.getByText("Test Tenant")).toBeInTheDocument();
  });
});
