import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { StorageBrowserPage } from "./list";

// Mock refine hooks
const mockUseList = vi.fn();
const mockUseCustom = vi.fn();
const mockUseCustomMutation = vi.fn();

vi.mock("@refinedev/core", () => ({
  useList: () => mockUseList(),
  useCustom: () => mockUseCustom(),
  useCustomMutation: () => mockUseCustomMutation(),
  useNotification: () => ({ open: vi.fn() }),
}));

describe("StorageBrowserPage Collapsible Previews", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCustomMutation.mockReturnValue({ mutate: vi.fn() });
    Object.defineProperty(window, 'location', {
      value: { hostname: 'admin.jarvis.local' },
      writable: true
    });
  });

  it("renders truncated filename and shows audio preview only after click", async () => {
    const files = [
      { id: "audio-1", file_name: "very-long-audio-recording-filename.ogg", mime_type: "audio/ogg", status: "uploaded", tenant_id: "t1", created_at: "2026-05-29", size: 1024 }
    ];
    
    mockUseList.mockReturnValue({
      query: { isLoading: false, isError: false },
      result: { data: files, total: 1 }
    });
    mockUseCustom.mockReturnValue({ result: { data: { active_files: 1, pending_files: 0, deleted_files: 0, active_bytes: "1024" } } });
    
    mockUseCustomMutation.mockReturnValue({
      mutate: vi.fn((opts, callbacks) => {
        if (opts.meta.rawUrl === '/admin/storage/batch-urls') {
          callbacks.onSuccess({ data: [{ id: "audio-1", url: "http://admin.jarvis.local:9000/test.ogg" }] });
        }
      })
    });

    render(<StorageBrowserPage />);
    
    // Audio preview should NOT be visible by default
    expect(document.querySelector('audio')).not.toBeInTheDocument();

    // Filename should be truncated (title attribute has full name)
    const filenameEl = screen.getByTitle("very-long-audio-recording-filename.ogg");
    expect(filenameEl).toBeInTheDocument();

    // Click the row to expand
    fireEvent.click(filenameEl);
    
    await waitFor(() => {
      const audioEl = document.querySelector('audio');
      expect(audioEl).toBeInTheDocument();
      expect(audioEl?.src).toBe('http://admin.jarvis.local:9000/test.ogg');
    });
  });

  it("renders image preview only after clicking the filename row", async () => {
    const files = [
      { id: "img-1", file_name: "test.jpg", mime_type: "image/jpeg", status: "uploaded", tenant_id: "t1", created_at: "2026-05-29", size: 2048 }
    ];
    
    mockUseList.mockReturnValue({
      query: { isLoading: false, isError: false },
      result: { data: files, total: 1 }
    });
    mockUseCustom.mockReturnValue({ result: { data: { active_files: 1, pending_files: 0, deleted_files: 0, active_bytes: "2048" } } });
    
    mockUseCustomMutation.mockReturnValue({
      mutate: vi.fn((opts, callbacks) => {
        if (opts.meta.rawUrl === '/admin/storage/batch-urls') {
          callbacks.onSuccess({ data: [{ id: "img-1", url: "http://admin.jarvis.local:9000/test.jpg" }] });
        }
      })
    });

    render(<StorageBrowserPage />);
    
    // Image should NOT be visible by default
    expect(screen.queryByAltText('test.jpg')).not.toBeInTheDocument();
    
    // Click the filename to expand
    const filenameEl = screen.getByTitle("test.jpg");
    fireEvent.click(filenameEl);
    
    await waitFor(() => {
      const imgEl = screen.getByAltText('test.jpg') as HTMLImageElement;
      expect(imgEl).toBeInTheDocument();
      expect(imgEl.src).toBe('http://admin.jarvis.local:9000/test.jpg');
    });

    // Click again to collapse
    fireEvent.click(filenameEl);
    expect(screen.queryByAltText('test.jpg')).not.toBeInTheDocument();
  });
});
