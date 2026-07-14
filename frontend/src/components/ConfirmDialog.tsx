"use client";

import { useEffect, useRef } from "react";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  confirmingLabel?: string;
  cancelLabel?: string;
  isConfirming?: boolean;
  /** Visual intent — controls the confirm button color. */
  tone?: "danger" | "warning";
  onConfirm: () => void;
  onCancel: () => void;
}

const TONE_CLASSES: Record<NonNullable<ConfirmDialogProps["tone"]>, string> = {
  danger: "bg-red-600 hover:bg-red-700",
  warning: "bg-amber-600 hover:bg-amber-700",
};

/**
 * Shared confirmation modal used across destructive/impactful actions
 * (delete recipe, ban/delete user, etc.) so every confirm dialog gets the
 * same accessibility behavior: focus trap, Escape-to-close, backdrop click
 * to close, and focus returned to the trigger on close.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  confirmingLabel,
  cancelLabel = "Cancel",
  isConfirming = false,
  tone = "danger",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const onCancelRef = useRef(onCancel);

  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onCancelRef.current();
        return;
      }
      if (e.key !== "Tab") return;

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable || focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      // This only runs when `open` transitions to false (or on unmount),
      // since `open` is the sole dependency — not on unrelated rerenders
      // (e.g. `isConfirming` toggling) while the dialog stays open.
      previouslyFocused.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        tabIndex={-1}
        className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-6 shadow-xl outline-none dark:border-zinc-700 dark:bg-zinc-900"
      >
        <h2
          id="confirm-dialog-title"
          className="mb-2 text-base font-semibold text-zinc-900 dark:text-zinc-50"
        >
          {title}
        </h2>
        <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">{description}</p>
        <div className="flex gap-3">
          <button
            onClick={onConfirm}
            disabled={isConfirming}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50 ${TONE_CLASSES[tone]}`}
          >
            {isConfirming ? confirmingLabel ?? `${confirmLabel}…` : confirmLabel}
          </button>
          <button
            onClick={onCancel}
            className="flex-1 rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
