import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { JobList } from "./list";

const mockUseTable = vi.fn();

vi.mock("@refinedev/core", () => ({
  useTable: (args: any) => mockUseTable(args),
  useCustomMutation: () => ({ mutate: vi.fn(), isLoading: false }),
  useNavigation: () => ({ push: vi.fn() }),
  useDelete: () => ({ mutate: vi.fn(), isLoading: false }),
  useExport: () => ({ triggerExport: vi.fn(), isLoading: false })
}));

describe("JobList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading state", () => {
    mockUseTable.mockReturnValue({
      tableQueryResult: { isLoading: true, isError: false, data: undefined },
      filters: [], setFilters: vi.fn()
    });
    render(<JobList />);
    expect(document.querySelector('.loading-spinner')).toBeInTheDocument();
  });

  it("renders error state", () => {
    mockUseTable.mockReturnValue({
      tableQueryResult: { isLoading: false, isError: true, error: new Error("Network error") },
      filters: [], setFilters: vi.fn()
    });
    render(<JobList />);
    expect(document.querySelector('.error-banner')).toBeInTheDocument();
  });

  it("renders empty state", () => {
    mockUseTable.mockReturnValue({
      tableQueryResult: { isLoading: false, isError: false, data: { data: [] } },
      filters: [], setFilters: vi.fn()
    });
    render(<JobList />);
    expect(screen.getByText("No jobs found.")).toBeInTheDocument();
  });

  it("renders job list and handles filters", () => {
    mockUseTable.mockReturnValue({
      tableQueryResult: { isLoading: false, isError: false, data: { data: [{ id: "job-1", name: "test-queue", state: "failed", created_on: new Date().toISOString() }] } },
      filters: [], setFilters: vi.fn()
    });
    render(<JobList />);
    expect(screen.getByText("test-queue")).toBeInTheDocument();
  });
});
