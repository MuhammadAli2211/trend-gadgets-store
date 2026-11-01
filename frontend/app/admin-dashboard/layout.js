"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../../context/AuthContext";

export default function AdminDashboardLayout({ children }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
    else if (!loading && user.role !== "admin") router.replace("/dashboard");
  }, [loading, user, router]);

  if (loading || !user || user.role !== "admin") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 text-gray-600">
        Checking admin access…
      </main>
    );
  }

  const navigation = [
    { href: "/admin-dashboard", label: "Overview", exact: true },
    { href: "/admin-dashboard/orders", label: "Orders" },
    { href: "/admin-dashboard/products", label: "Products" },
    { href: "/admin-dashboard/content", label: "Content" },
    { href: "/admin-dashboard/schedules", label: "Schedules" },
    { href: "/admin-dashboard/social-accounts", label: "Social accounts" },
    { href: "/admin-dashboard/analytics", label: "Analytics" },
    { href: "/admin-dashboard/settings", label: "Settings" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/admin-dashboard" className="shrink-0 leading-tight">
            <span className="block text-base font-bold tracking-tight text-gray-950 sm:text-lg">
              Cart2Door Admin
            </span>
            <span className="hidden text-xs text-gray-500 sm:block">Ecommerce automation</span>
          </Link>
          <div className="flex min-w-0 items-center gap-3">
            <span className="hidden max-w-48 truncate text-sm text-gray-600 md:block">
              {user.name || user.email}
            </span>
            <button
              type="button"
              onClick={logout}
              className="shrink-0 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Log out
            </button>
          </div>
        </div>
        <nav aria-label="Admin navigation" className="border-t border-gray-100">
          {pathname !== "/admin-dashboard" && (
            <div className="border-b border-gray-100 px-4 py-2 sm:hidden">
              <Link href="/admin-dashboard" className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50">
                <span aria-hidden="true">←</span> Back to dashboard
              </Link>
            </div>
          )}
          <div className="mx-auto flex max-w-[1600px] gap-1 overflow-x-auto px-3 sm:px-5">
            {navigation.map(({ href, label, exact }) => {
              const active = exact
                ? pathname === href
                : pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`shrink-0 border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
                    active
                      ? "border-indigo-600 text-indigo-700"
                      : "border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-950"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </div>
        </nav>
      </header>
      {children}
    </div>
  );
}
