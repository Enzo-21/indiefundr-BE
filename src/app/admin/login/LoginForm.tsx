"use client";

import { useActionState } from "react";
import {
  startAdminLogin,
  verifyAdminLogin,
  type AdminLoginState,
} from "@/actions/admin/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: AdminLoginState = { step: "email" };

export function LoginForm() {
  const [emailState, emailAction, emailPending] = useActionState(
    startAdminLogin,
    initialState
  );
  const [codeState, codeAction, codePending] = useActionState(
    verifyAdminLogin,
    initialState
  );

  const step = codeState.step === "code" ? "code" : emailState.step ?? "email";
  const email = codeState.email || emailState.email || "";
  const error = codeState.error || emailState.error;
  const message = emailState.message;

  if (step === "code") {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Enter sign-in code</CardTitle>
          <CardDescription>
            We sent a 6-digit code to {email || "your email"}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={codeAction} className="flex flex-col gap-4">
            <input type="hidden" name="email" value={email} />
            {message ? (
              <Alert>
                <AlertDescription>{message}</AlertDescription>
              </Alert>
            ) : null}
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="code">Verification code</Label>
              <Input
                id="code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                maxLength={6}
              />
            </div>
            <Button type="submit" disabled={codePending}>
              {codePending ? "Verifying…" : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Admin sign in</CardTitle>
        <CardDescription>
          Enter your authorized email to receive a one-time code.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={emailAction} className="flex flex-col gap-4">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </div>
          <Button type="submit" disabled={emailPending}>
            {emailPending ? "Sending…" : "Send code"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
