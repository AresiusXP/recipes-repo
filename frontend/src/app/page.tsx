import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default function Home() {
  // Auth read is request-time; isolate it behind Suspense (Cache Components).
  // This page only redirects, so there is no visible UI to show meanwhile.
  return (
    <Suspense fallback={null}>
      <HomeRedirect />
    </Suspense>
  );
}

async function HomeRedirect() {
  const session = await auth();
  if (session?.user) {
    redirect("/recipes");
  }
  redirect("/login");
  // Unreachable: both branches above call redirect() (which throws). Returning
  // null keeps TypeScript happy about the component's JSX return type.
  return null;
}
