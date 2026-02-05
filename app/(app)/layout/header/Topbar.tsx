"use client";

import { Icon } from "@iconify/react/dist/iconify.js";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const Topbar = () => {
  return (
    <div className="py-3.5 px-6 z-40 sticky top-0 bg-[linear-gradient(90deg,#0f0533_0%,#1b0a5c_100%)]">
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2 text-white">
          <Icon icon="solar:ghost-bold" width={20} />
          <span className="text-base font-semibold tracking-wide">TMA Generator</span>
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <Link href="/" className="text-white/80 hover:text-white">
            View site
          </Link>
          <Button
            variant="outline"
            className="border-white/30 text-white hover:bg-white/10"
            asChild
          >
            <Link href="/generate/step-1">New run</Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Topbar;
