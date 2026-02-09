"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

type DismissibleDetailsProps = {
  className?: string;
  summary: ReactNode;
  children: ReactNode;
};

export default function DismissibleDetails({
  className,
  summary,
  children
}: DismissibleDetailsProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const details = detailsRef.current;
      if (!details || !details.open) {
        return;
      }

      const target = event.target;
      if (target instanceof Node && !details.contains(target)) {
        details.open = false;
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      const details = detailsRef.current;
      if (details?.open) {
        details.open = false;
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <details ref={detailsRef} className={className}>
      <summary>{summary}</summary>
      {children}
    </details>
  );
}
