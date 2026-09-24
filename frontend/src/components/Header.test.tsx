import { render, screen } from "@testing-library/react";
import { Header } from "@/components/Header";
import "@testing-library/jest-dom";

jest.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: { email: "test@example.com", full_name: "Test User" },
    logout: jest.fn(),
  }),
}));

jest.mock("@/components/ThemeProvider", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: jest.fn() }),
}));

describe("Header", () => {
  it("renders the app name", () => {
    render(<Header />);
    expect(screen.getByText("JobApplicationTracker")).toBeInTheDocument();
  });

  it("renders the version from env", () => {
    render(<Header />);
    expect(screen.getByText(/v/)).toBeInTheDocument();
  });

  it("renders user name when logged in", () => {
    render(<Header />);
    expect(screen.getByText("Test User")).toBeInTheDocument();
  });

  it("renders sign out button", () => {
    render(<Header />);
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
  });

  it("renders theme toggle button", () => {
    render(<Header />);
    expect(screen.getByRole("button", { name: /switch to dark mode/i })).toBeInTheDocument();
  });
});