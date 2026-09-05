"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { Header } from "@/components/Header";
import { TopNav } from "@/components/TopNav";
import { Footer } from "@/components/Footer";
import { Loader2 } from "lucide-react";

/**
 * Route guard: shows the app shell (header/nav/footer) for authenticated
 * users, and redirects to /login otherwise. Login/register pages render
 * without the shell.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const isAuthPage = pathname === "/login" || pathname === "/register" || pathname === "/verify-email" || pathname === "/forgot-password" || pathname === "/reset-password";

  useEffect(() => {
    if (loading) return;
    if (!user && !isAuthPage) {
      window.location.href = "/login";
    } else if (user && isAuthPage) {
      window.location.href = "/dashboard";
    }
  }, [user, loading, isAuthPage]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center gap-3 text-gray-500 dark:text-[#8b8b96]">
        <Loader2 className="animate-spin w-5 h-5" />
        Loading...
      </div>
    );
  }

  // Auth pages render standalone (no shell)
  if (isAuthPage) {
    return <div className="min-h-screen">{children}</div>;
  }

  if (!user) {
    return null; // redirect effect is running
  }

  return (
    <div className="flex flex-col min-h-screen">
      <div className="sticky top-0 z-40">
        <Header />
        <TopNav />
      </div>
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
