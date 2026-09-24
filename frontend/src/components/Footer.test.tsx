import { render, screen } from "@testing-library/react";
import { Footer } from "@/components/Footer";
import "@testing-library/jest-dom";

describe("Footer", () => {
  it("renders the app name with version", () => {
    render(<Footer />);
    expect(screen.getByText(/JobApplicationTracker v/)).toBeInTheDocument();
  });

  it("renders author link", () => {
    render(<Footer />);
    const link = screen.getByRole("link", { name: /Jorge Pereira \(35sites\.com LLC\)/i });
    expect(link).toHaveAttribute("href", "https://35sites.com/");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});