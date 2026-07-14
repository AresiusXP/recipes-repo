import { SectionShell } from "@/components/SectionShell";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SectionShell maxWidth="6xl">{children}</SectionShell>;
}
