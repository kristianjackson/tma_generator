"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@iconify/react";
import clsx from "clsx";
import FullLogo from "../shared/logo/FullLogo";
import SidebarContent from "./Sidebaritems";

type SidebarLayoutProps = {
  onClose?: () => void;
};

const SidebarLayout = ({ onClose }: SidebarLayoutProps) => {
  const pathname = usePathname();

  return (
    <aside className="h-screen w-64 border-r border-slate-200 bg-white px-4 py-6 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-6 flex items-center">
        <Link href="/" className="flex items-center gap-2" onClick={onClose}>
          <FullLogo />
        </Link>
      </div>

      <nav className="h-[calc(100vh-140px)] overflow-y-auto pr-1">
        {SidebarContent.map((section, sectionIndex) => (
          <div key={section.heading ?? sectionIndex} className="mb-6">
            {section.heading ? (
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                {section.heading}
              </p>
            ) : null}
            <div className="mt-2 space-y-1">
              {(section.children ?? []).map((item) => {
                const isActive = pathname === item.url;
                return (
                  <Link
                    key={item.id ?? item.url}
                    href={item.url ?? "#"}
                    onClick={onClose}
                    className={clsx(
                      "flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium transition",
                      isActive
                        ? "bg-lightprimary text-primary"
                        : "text-slate-600 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                    )}
                  >
                    <Icon
                      icon={item.icon ?? "ri:checkbox-blank-circle-line"}
                      width={18}
                    />
                    <span className="truncate">{item.name}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}

        <div className="mt-8 rounded-2xl bg-lightprimary/60 p-4 dark:bg-slate-800">
          <h5 className="text-sm font-semibold text-slate-900 dark:text-white">
            Need help?
          </h5>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
            Check the ingestion checklist or start a new run.
          </p>
          <Link
            href="/generate/step-1"
            className="mt-3 inline-flex items-center justify-center rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50 dark:bg-slate-700 dark:text-white"
            onClick={onClose}
          >
            New run
          </Link>
        </div>
      </nav>
    </aside>
  );
};

export default SidebarLayout;
