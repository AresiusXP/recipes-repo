import { Suspense } from "react";
import { Navbar, NavbarSkeleton } from "@/components/Navbar";

export default function RecipesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Suspense fallback={<NavbarSkeleton />}>
        <Navbar />
      </Suspense>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:py-14">
        {children}
      </main>
    </>
  );
}
