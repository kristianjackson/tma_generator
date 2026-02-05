"use client";

import { useFormStatus } from "react-dom";

type FormStatusIndicatorProps = {
  label?: string;
};

export default function FormStatusIndicator({
  label = "Working…"
}: FormStatusIndicatorProps) {
  const { pending } = useFormStatus();

  if (!pending) {
    return null;
  }

  return (
    <span className="form-status" role="status" aria-live="polite">
      {label}
    </span>
  );
}
