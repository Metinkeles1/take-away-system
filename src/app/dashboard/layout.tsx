import { Suspense } from "react";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full flex">
      <Suspense>
        <DashboardSidebar />
      </Suspense>
      <main className="flex-1 min-w-0 overflow-hidden">{children}</main>
    </div>
  );
}
