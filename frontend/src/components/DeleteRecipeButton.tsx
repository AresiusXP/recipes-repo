"use client";

import { useState } from "react";
import { deleteRecipe } from "@/app/actions/recipes";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/ToastProvider";

export function DeleteRecipeButton({ recipeId }: { recipeId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { showToast } = useToast();

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteRecipe(recipeId);
    } catch {
      setDeleting(false);
      setConfirming(false);
      showToast("error", "Failed to delete recipe. Please try again.");
    }
  }

  return (
    <>
      <ConfirmDialog
        open={confirming}
        title="Delete recipe?"
        description="This action cannot be undone."
        confirmLabel="Delete"
        confirmingLabel="Deleting…"
        isConfirming={deleting}
        tone="danger"
        onConfirm={handleDelete}
        onCancel={() => setConfirming(false)}
      />
      <button
        onClick={() => setConfirming(true)}
        className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
      >
        Delete
      </button>
    </>
  );
}
