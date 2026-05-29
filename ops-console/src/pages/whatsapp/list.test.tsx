import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { WhatsAppStatusPage } from "./list";

const mockUseList = vi.fn();
const mockUseDelete = vi.fn();
const mockUseCustom = vi.fn();

vi.mock("@refinedev/core", () => ({
  useList: (args: any) => mockUseList(args),
  useDelete: () => mockUseDelete(),
  useCustom: () => mockUseCustom(),
}));

describe("WhatsAppStatusPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDelete.mockReturnValue({ mutate: vi.fn() });
    mockUseCustom.mockReturnValue({ mutate: vi.fn(), isLoading: false });
  });

  it("renders loading state", () => {
    mockUseList.mockReturnValue({
      query: { isLoading: true },
      result: { data: undefined },
    });

    render(<WhatsAppStatusPage />);
    expect(screen.getByText("Loading connections…")).toBeInTheDocument();
  });

  it("renders empty state", () => {
    mockUseList.mockReturnValue({
      query: { isLoading: false, isError: false },
      result: { data: [] },
    });

    render(<WhatsAppStatusPage />);
    expect(screen.getByText("No WhatsApp sessions registered.")).toBeInTheDocument();
  });

  it("renders connection list", () => {
    const connections = [
      {
        id: "conn-1",
        tenant_id: "tenant-1",
        status: "connected",
        updated_at: "2023-01-01T00:00:00Z",
      },
    ];
    mockUseList.mockReturnValue({
      query: { isLoading: false, isError: false },
      result: { data: connections },
    });

    render(<WhatsAppStatusPage />);
    expect(screen.getByText(/tenant-1/)).toBeInTheDocument();
    expect(screen.getAllByText("connected")).toHaveLength(2); // card label and item status badge!
  });

  it("renders error state", () => {
    mockUseList.mockReturnValue({
      query: { isLoading: false, isError: true, error: { message: "Network error" } },
      result: { data: undefined },
    });

    render(<WhatsAppStatusPage />);
    expect(screen.getByText("Network error")).toBeInTheDocument();
  });
});
