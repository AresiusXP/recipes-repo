import { SectionShell } from "@/components/SectionShell";

export default function NotificationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SectionShell>{children}</SectionShell>;
}
