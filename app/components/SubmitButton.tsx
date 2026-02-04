"use client";

import { useFormStatus } from "react-dom";

type SubmitButtonProps = {
  className?: string;
  idleText: string;
  pendingText?: string;
};

export default function SubmitButton({
  className,
  idleText,
  pendingText = "Working..."
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button className={className} type="submit" disabled={pending}>
      {pending ? (
        <>
          <span className="spinner button-spinner" aria-hidden="true" />
          {pendingText}
        </>
      ) : (
        idleText
      )}
    </button>
  );
}
