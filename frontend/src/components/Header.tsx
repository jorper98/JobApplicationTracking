"use client";

import { useAuth } from "@/context/AuthContext";
import { Target, Sun, Moon, LogOut } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";

export function Header() {
  const { theme, toggleTheme } = useTheme();
  const { logout } = useAuth();

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white dark:border-white/[0.08] dark:bg-[#0d0d14]">
      <div className="flex items-center justify-between px-6 h-14">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
            <Target className="w-4 h-4 text-white" />
          </div>
          <div className="flex flex-col leading-none">
            <span className="font-bold text-gray-900 dark:text-white text-sm">JobApplicationTracker</span>
            <span className="text-[10px] text-gray-400 dark:text-[#6b6b72] mt-0.5">v1.1.2</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={logout}
            title="Sign out"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm text-gray-500 dark:text-[#8b8b96] hover:bg-gray-100 dark:hover:bg-white/[0.06] hover:text-red-600 dark:hover:text-red-400 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
          <button
            onClick={toggleTheme}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="p-2 rounded-lg text-gray-500 dark:text-[#8b8b96] hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors"
          >
            {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>
      </div>
    </header>
  );
}




