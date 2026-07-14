import { SectionShell } from "@/components/SectionShell";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SectionShell>{children}</SectionShell>;
}
