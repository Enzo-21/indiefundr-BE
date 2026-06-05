import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default function AdminLoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <LoginForm />
    </div>
  );
}
