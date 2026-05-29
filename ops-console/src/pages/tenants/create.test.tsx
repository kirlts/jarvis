import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TenantCreatePage } from "./create";

const mockUseCreate = vi.fn();
const mockUseNavigation = vi.fn();

vi.mock("@refinedev/core", () => ({
  useCreate: () => mockUseCreate(),
  useNavigation: () => mockUseNavigation(),
}));

describe("TenantCreatePage", () => {
  const mockMutate = vi.fn();
  const mockList = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCreate.mockReturnValue({ mutate: mockMutate });
    mockUseNavigation.mockReturnValue({ list: mockList });
  });

  it("renders form correctly", () => {
    render(<TenantCreatePage />);
    expect(screen.getByLabelText("Nombre del usuario")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Crear usuario" })).toBeInTheDocument();
  });

  it("shows validation error on empty submit", () => {
    render(<TenantCreatePage />);
    fireEvent.click(screen.getByRole("button", { name: "Crear usuario" }));
    
    expect(screen.getByText("El nombre es obligatorio")).toBeInTheDocument();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("submits valid form", () => {
    render(<TenantCreatePage />);
    
    const input = screen.getByLabelText("Nombre del usuario");
    fireEvent.change(input, { target: { value: "New Tenant" } });
    
    fireEvent.click(screen.getByRole("button", { name: "Crear usuario" }));
    
    expect(mockMutate).toHaveBeenCalledWith(
      {
        resource: "tenants",
        values: { name: "New Tenant" },
      },
      expect.any(Object)
    );
  });

  it("shows error on failed creation", () => {
    render(<TenantCreatePage />);
    
    const input = screen.getByLabelText("Nombre del usuario");
    fireEvent.change(input, { target: { value: "New Tenant" } });
    
    fireEvent.click(screen.getByRole("button", { name: "Crear usuario" }));
    
    // Simulate error callback
    const { onError } = mockMutate.mock.calls[0][1];
    act(() => {
      onError(new Error("API Error"));
    });
    
    // Wait for state to update implicitly or check banner directly if synchronous (which it is here)
    expect(screen.getByText("API Error")).toBeInTheDocument();
  });
});
