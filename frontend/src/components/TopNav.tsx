"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, Building2, FileText, LayoutDashboard, Target, PlusCircle, Database, Users, Settings } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/resume", label: "Resume", icon: FileText },
  { href: "/companies", label: "Companies", icon: Building2 },
  { href: "/jobs", label: "Jobs", icon: Target },
  { href: "/tracker", label: "Tracker", icon: Briefcase },
  { href: "/data", label: "Data", icon: Database },
];

export function TopNav() {
  const path = usePathname();
  const { user } = useAuth();
  const navItems = user?.is_admin
    ? [...nav, { href: "/users", label: "Users", icon: Users }, { href: "/settings", label: "Settings", icon: Settings }]
    : nav;
  return (
    <nav className="border-b border-gray-200 bg-white dark:border-white/[0.08] dark:bg-[#0d0d14]">
      <div className="flex items-center gap-1 px-4 py-2">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              path === href
                ? "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300"
                : "text-gray-500 dark:text-[#8b8b96] hover:bg-gray-100 dark:hover:bg-white/[0.04] hover:text-gray-900 dark:hover:text-white"
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </Link>
        ))}
        <div className="ml-auto">
          <Link
            href="/jobs?new=true"
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/10 rounded-lg transition-colors"
          >
            <PlusCircle className="w-4 h-4" />
            Add Job
          </Link>
        </div>
      </div>
    </nav>
  );
}

