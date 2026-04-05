"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ModeToggle } from "./mode-toggle";

export default function Header() {
  const pathname = usePathname();
  const links = [
    { label: "Overview", to: "/" },
    { label: "Pipeline", to: "/recorder" },
  ] as const;

  return (
    <header className="border-b border-border/60 bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-row items-center justify-between px-4 py-3 md:px-6">
        <nav className="flex gap-2 text-sm">
          {links.map(({ to, label }) => {
            const isActive = pathname === to;

            return (
              <Link
                key={to}
                href={to}
                className={`px-3 py-2 transition-colors ${isActive ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          <ModeToggle />
        </div>
      </div>
    </header>
  );
}
