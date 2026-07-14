import { SectionShell } from "@/components/SectionShell";

export default function RecipesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SectionShell>{children}</SectionShell>;
}
