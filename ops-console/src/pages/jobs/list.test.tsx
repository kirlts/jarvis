import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { JobListPage } from "./list";

const mockUseList = vi.fn();

vi.mock("@refinedev/core", () => ({
  useList: (args: any) => mockUseList(args),
}));

describe("JobListPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading state", () => {
    mockUseList.mockReturnValue({
      query: { isLoading: true },
      result: { data: undefined },
    });

    render(<JobListPage />);
    expect(screen.getByText("Loading jobs…")).toBeInTheDocument();
  });

  it("renders empty state", () => {
    mockUseList.mockReturnValue({
      query: { isLoading: false, isError: false },
      result: { data: [] },
    });

    render(<JobListPage />);
    expect(screen.getByText("No jobs found.")).toBeInTheDocument();
  });

  it("renders job list and handles filters", () => {
    const jobs = [
      {
        id: "job-12345678",
        name: "sync-inbox",
        state: "completed",
        data: {},
        created_on: "2023-01-01T00:00:00Z",
        started_on: "2023-01-01T00:00:01Z",
        completed_on: "2023-01-01T00:00:05Z",
      },
    ];
    mockUseList.mockReturnValue({
      query: { isLoading: false, isError: false },
      result: { data: jobs },
    });

    render(<JobListPage />);
    expect(screen.getByText("job-1234…")).toBeInTheDocument();
    expect(screen.getByText("sync-inbox")).toBeInTheDocument();
    expect(screen.getAllByText("completed")).toHaveLength(2);
    
    // Click filter
    fireEvent.click(screen.getByText("failed"));
    
    // It should trigger re-render with new filters.
    // In our mock it just calls mockUseList again. We can check if it passed the correct filter.
    expect(mockUseList).toHaveBeenCalledWith(expect.objectContaining({
      filters: [{ field: "state", operator: "eq", value: "failed" }]
    }));
  });

  it("renders error state", () => {
    mockUseList.mockReturnValue({
      query: { isLoading: false, isError: true, error: { message: "Network error" } },
      result: { data: undefined },
    });

    render(<JobListPage />);
    expect(screen.getByText("Network error")).toBeInTheDocument();
  });
});
