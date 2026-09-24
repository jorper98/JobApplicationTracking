import { render, screen } from "@testing-library/react";
import { PageShell, PageHeader, PageLoading } from "@/components/PageShell";
import "@testing-library/jest-dom";

describe("PageShell", () => {
  it("renders children", () => {
    render(<PageShell><div>Test content</div></PageShell>);
    expect(screen.getByText("Test content")).toBeInTheDocument();
  });

  it("applies maxWidth class when provided", () => {
    const { container } = render(<PageShell maxWidth="max-w-xl"><div>Content</div></PageShell>);
    expect(container.firstChild).toHaveClass("max-w-xl");
  });
});

describe("PageHeader", () => {
  it("renders title", () => {
    render(<PageHeader title="Test Title" />);
    expect(screen.getByText("Test Title")).toBeInTheDocument();
  });

  it("renders subtitle when provided", () => {
    render(<PageHeader title="Test Title" subtitle="Test Subtitle" />);
    expect(screen.getByText("Test Subtitle")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(<PageHeader title="Test" className="custom-class" />);
    expect(container.firstChild).toHaveClass("custom-class");
  });
});

describe("PageLoading", () => {
  it("renders loading message", () => {
    render(<PageLoading message="Loading data..." />);
    expect(screen.getByText("Loading data...")).toBeInTheDocument();
  });

  it("renders default message when none provided", () => {
    render(<PageLoading />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });
});