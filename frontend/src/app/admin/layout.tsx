import { Suspense } from "react";
import { Navbar, NavbarSkeleton } from "@/components/Navbar";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Suspense fallback={<NavbarSkeleton />}>
        <Navbar />
      </Suspense>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        {children}
      </main>
    </>
  );
}
