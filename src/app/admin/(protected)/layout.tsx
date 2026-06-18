import { redirect } from "next/navigation";
import { Toaster } from "@/components/ui/sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { verifyAdminSession } from "@/lib/auth/adminSession";
import { getAdminPendingOrderCount } from "@/services/admin/adminOrderCounts";

export const dynamic = "force-dynamic";

export default async function AdminProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let session: Awaited<ReturnType<typeof verifyAdminSession>>;
  try {
    session = await verifyAdminSession();
  } catch {
    redirect("/admin/login");
  }

  return (
    <>
      <AdminShell email={session.email} pendingOrderCount={await getAdminPendingOrderCount()}>
        {children}
      </AdminShell>
      <Toaster richColors position="top-center" />
    </>
  );
}
