import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TenantListPage } from "./list";

// Mock refine core hooks
const mockUseList = vi.fn();
const mockUseDelete = vi.fn();
const mockUseNavigation = vi.fn();
const mockUseUpdate = vi.fn();

vi.mock("@refinedev/core", () => ({
  useList: () => mockUseList(),
  useDelete: () => mockUseDelete(),
  useNavigation: () => mockUseNavigation(),
  useUpdate: () => mockUseUpdate(),
}));

vi.mock("react-router", () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children, to }: any) => <a href={to}>{children}</a>,
}));

vi.mock("../../components/toast", () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

describe("TenantListPage", () => {
  const mockCreate = vi.fn();
  const mockMutate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseNavigation.mockReturnValue({ create: mockCreate });
    mockUseDelete.mockReturnValue({ mutate: mockMutate });
    mockUseUpdate.mockReturnValue({ mutate: vi.fn() });
  });

  it("renders loading state", () => {
    mockUseList.mockReturnValue({
      query: { isLoading: true },
      result: { data: undefined, total: 0 },
    });

    render(<TenantListPage />);
    expect(screen.getByText("Cargando usuarios…")).toBeInTheDocument();
  });

  it("renders empty state", () => {
    mockUseList.mockReturnValue({
      query: { isLoading: false, isError: false },
      result: { data: [], total: 0 },
    });

    render(<TenantListPage />);
    expect(screen.getByText("Sin usuarios aún. Crea uno para comenzar.")).toBeInTheDocument();
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
    fireEvent.click(screen.getByText("Eliminar"));
    
    // Modal should appear
    expect(screen.getByText(/¿Eliminar/)).toBeInTheDocument();
    
    // Confirm delete
    const confirmBtn = document.getElementById("confirm-delete-button");
    if (confirmBtn) fireEvent.click(confirmBtn);
    
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
