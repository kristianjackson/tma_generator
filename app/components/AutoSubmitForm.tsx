"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

type AutoSubmitFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  enabled: boolean;
  children: ReactNode;
};

export default function AutoSubmitForm({
  action,
  enabled,
  children
}: AutoSubmitFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const hasSubmitted = useRef(false);

  useEffect(() => {
    if (!enabled || hasSubmitted.current) {
      return;
    }
    hasSubmitted.current = true;
    formRef.current?.requestSubmit();
  }, [enabled]);

  return (
    <form ref={formRef} action={action}>
      {children}
    </form>
  );
}
