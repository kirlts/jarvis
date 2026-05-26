import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { WhatsAppList } from "./list";

const mockUseTable = vi.fn();

vi.mock("@refinedev/core", () => ({
  useTable: (args: any) => mockUseTable(args),
  useCustomMutation: () => ({ mutate: vi.fn(), isLoading: false }),
  useNavigation: () => ({ push: vi.fn() }),
  useDelete: () => ({ mutate: vi.fn(), isLoading: false }),
  useExport: () => ({ triggerExport: vi.fn(), isLoading: false })
}));

describe("WhatsAppList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading state", () => {
    mockUseTable.mockReturnValue({
      tableQueryResult: { isLoading: true, isError: false, data: undefined },
      filters: [], setFilters: vi.fn()
    });
    render(<WhatsAppList />);
    expect(document.querySelector('.loading-spinner')).toBeInTheDocument();
  });

  it("renders error state", () => {
    mockUseTable.mockReturnValue({
      tableQueryResult: { isLoading: false, isError: true, error: new Error("Network error") },
      filters: [], setFilters: vi.fn()
    });
    render(<WhatsAppList />);
    expect(document.querySelector('.error-banner')).toBeInTheDocument();
  });

  it("renders empty state", () => {
    mockUseTable.mockReturnValue({
      tableQueryResult: { isLoading: false, isError: false, data: { data: [] } },
      filters: [], setFilters: vi.fn()
    });
    render(<WhatsAppList />);
    expect(screen.getByText("No WhatsApp sessions found.")).toBeInTheDocument();
  });

  it("renders connection list", () => {
    mockUseTable.mockReturnValue({
      tableQueryResult: { isLoading: false, isError: false, data: { data: [{ tenant_id: "tenant-1", status: "connected", updated_at: new Date().toISOString() }] } },
      filters: [], setFilters: vi.fn()
    });
    render(<WhatsAppList />);
    expect(screen.getByText("tenant-1")).toBeInTheDocument();
  });
});
