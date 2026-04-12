"use client";

import { useState } from "react";
import { getOtherUsers, shareRecipe, type ShareableUser } from "@/app/actions/recipes";

interface ShareRecipeButtonProps {
  recipeId: string;
}

type ModalState = "closed" | "loading" | "picker" | "submitting" | "success" | "error";

export function ShareRecipeButton({ recipeId }: ShareRecipeButtonProps) {
  const [modalState, setModalState] = useState<ModalState>("closed");
  const [users, setUsers] = useState<ShareableUser[]>([]);
  const [errorMessage, setErrorMessage] = useState<string>("");

  async function handleOpen() {
    setModalState("loading");
    try {
      const fetched = await getOtherUsers();
      setUsers(fetched);
      setModalState("picker");
    } catch {
      setErrorMessage("Could not load users. Please try again.");
      setModalState("error");
    }
  }

  function handleClose() {
    setModalState("closed");
    setUsers([]);
    setErrorMessage("");
  }

  async function handleShare(recipientId: string) {
    setModalState("submitting");
    try {
      const result = await shareRecipe(recipeId, recipientId);
      if (result.success) {
        setModalState("success");
      } else {
        setErrorMessage(result.error ?? "Failed to share recipe.");
        setModalState("error");
      }
    } catch {
      setErrorMessage("An unexpected error occurred.");
      setModalState("error");
    }
  }

  const isOpen = modalState !== "closed";

  return (
    <>
      {/* Trigger button */}
      <button
        type="button"
        onClick={handleOpen}
        className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        Share
      </button>

      {/* Modal overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClose();
          }}
        >
          <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-800">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-700">
              <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
                Share recipe
              </h2>
              <button
                type="button"
                onClick={handleClose}
                aria-label="Close"
                className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-4">
              {/* Loading */}
              {modalState === "loading" && (
                <div className="flex items-center justify-center py-8">
                  <svg className="h-6 w-6 animate-spin text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                </div>
              )}

              {/* User picker */}
              {(modalState === "picker" || modalState === "submitting") && (
                <>
                  {users.length === 0 ? (
                    <p className="py-4 text-center text-sm text-zinc-500 dark:text-zinc-400">
                      No other users found in the app.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {users.map((user) => {
                        const displayName = user.name ?? user.email ?? "Unknown user";
                        const initials = (user.name ?? "?")
                          .split(/\s+/)
                          .map((n) => n[0])
                          .join("")
                          .toUpperCase()
                          .slice(0, 2);

                        return (
                          <li key={user.id}>
                            <button
                              type="button"
                              disabled={modalState === "submitting"}
                              onClick={() => handleShare(user.id)}
                              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:hover:bg-zinc-800"
                            >
                              {/* Avatar */}
                              {user.image ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={user.image}
                                  alt={displayName}
                                  className="h-9 w-9 shrink-0 rounded-full object-cover"
                                />
                              ) : (
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
                                  {initials}
                                </span>
                              )}
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">
                                  {displayName}
                                </p>
                                {user.name && user.email && (
                                  <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                                    {user.email}
                                  </p>
                                )}
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </>
              )}

              {/* Success */}
              {modalState === "success" && (
                <div className="flex flex-col items-center gap-3 py-6 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="font-medium text-zinc-900 dark:text-zinc-50">Recipe shared!</p>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    The recipe has been added to their collection and they have been notified.
                  </p>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
                  >
                    Done
                  </button>
                </div>
              )}

              {/* Error */}
              {modalState === "error" && (
                <div className="flex flex-col items-center gap-3 py-6 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                  <p className="font-medium text-zinc-900 dark:text-zinc-50">Something went wrong</p>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">{errorMessage}</p>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="mt-2 rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
