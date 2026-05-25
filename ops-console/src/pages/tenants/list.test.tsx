import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TenantListPage } from "./list";

// Mock refine core hooks
const mockUseList = vi.fn();
const mockUseDelete = vi.fn();
const mockUseNavigation = vi.fn();

vi.mock("@refinedev/core", () => ({
  useList: () => mockUseList(),
  useDelete: () => mockUseDelete(),
  useNavigation: () => mockUseNavigation(),
}));

describe("TenantListPage", () => {
  const mockCreate = vi.fn();
  const mockMutate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseNavigation.mockReturnValue({ create: mockCreate });
    mockUseDelete.mockReturnValue({ mutate: mockMutate });
  });

  it("renders loading state", () => {
    mockUseList.mockReturnValue({
      query: { isLoading: true },
      result: { data: undefined, total: 0 },
    });

    render(<TenantListPage />);
    expect(screen.getByText("Loading tenants…")).toBeInTheDocument();
  });

  it("renders empty state", () => {
    mockUseList.mockReturnValue({
      query: { isLoading: false, isError: false },
      result: { data: [], total: 0 },
    });

    render(<TenantListPage />);
    expect(screen.getByText("No tenants yet. Create one to get started.")).toBeInTheDocument();
  });

  it("renders tenant list and handles deletion", () => {
    const tenants = [
      { id: "tenant-1", name: "Acme Corp", created_at: "2023-01-01T00:00:00Z", deleted_at: null },
    ];
    mockUseList.mockReturnValue({
      query: { isLoading: false, isError: false },
      result: { data: tenants, total: 1 },
    });

    render(<TenantListPage />);
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    
    // Click delete
    fireEvent.click(screen.getByText("Delete"));
    
    // Modal should appear
    expect(screen.getByText(/Are you sure you want to delete/)).toBeInTheDocument();
    
    // Confirm delete
    fireEvent.click(screen.getByText("Delete Tenant", { selector: 'button.btn-danger' }));
    
    expect(mockMutate).toHaveBeenCalledWith(
      { resource: "tenants", id: "tenant-1" },
      expect.any(Object)
    );
  });

  it("renders error state", () => {
    mockUseList.mockReturnValue({
      query: { isLoading: false, isError: true, error: { message: "Network error" } },
      result: { data: undefined, total: 0 },
    });

    render(<TenantListPage />);
    expect(screen.getByText("Network error")).toBeInTheDocument();
  });
});
