import { logoutAdmin } from "@/actions/admin/auth";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export function AdminShell({
  email,
  children,
}: {
  email: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-56 shrink-0 border-r md:block">
        <AdminSidebar />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <p className="text-sm text-muted-foreground">Signed in as</p>
            <p className="font-medium">{email}</p>
          </div>
          <form action={logoutAdmin}>
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        </header>
        <Separator />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
