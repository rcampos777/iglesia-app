"use client";

import { useActionState } from "react";
import { oauthSignInAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ActionResult } from "@/lib/action-result";
import type { OAuthProvider } from "@/lib/auth/oauth";

const initialState: ActionResult = { ok: true, data: undefined };

const LABELS: Record<OAuthProvider, string> = {
  google: "Continuar con Google",
  apple: "Continuar con Apple",
};

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.81Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.92l-3.88-3c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.1A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.29 14.28a7.2 7.2 0 0 1 0-4.56v-3.1H1.28a12 12 0 0 0 0 10.76l4.01-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.44-3.44A11.97 11.97 0 0 0 12 0 12 12 0 0 0 1.28 6.62l4.01 3.1C6.23 6.88 8.88 4.77 12 4.77Z"
      />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="currentColor">
      <path d="M16.37 12.77c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.77-3.32-1.8-1.41-.14-2.76.83-3.47.83-.72 0-1.82-.81-2.99-.79a4.43 4.43 0 0 0-3.75 2.27c-1.6 2.77-.41 6.87 1.15 9.12.76 1.1 1.67 2.33 2.86 2.29 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.77.74 2.98.72 1.23-.02 2.01-1.12 2.76-2.22a9.9 9.9 0 0 0 1.25-2.57 3.98 3.98 0 0 1-2.4-3.65ZM14.1 6.02c.63-.77 1.06-1.83.94-2.9-.91.04-2.01.61-2.67 1.37-.58.67-1.1 1.76-.96 2.8 1.02.08 2.06-.52 2.69-1.27Z" />
    </svg>
  );
}

/**
 * Botones "Continuar con Google/Apple" para /login y /registro. Solo se
 * muestran los proveedores habilitados (AUTH_OAUTH_PROVIDERS).
 */
export function OAuthButtons({ providers, next }: { providers: OAuthProvider[]; next?: string }) {
  const [state, formAction, isPending] = useActionState(
    async (_prev: ActionResult, formData: FormData) => oauthSignInAction(formData),
    initialState,
  );

  if (providers.length === 0) return null;

  return (
    <div className="space-y-3">
      {!state.ok && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <form action={formAction} className="space-y-2">
        {next && <input type="hidden" name="next" value={next} />}
        {providers.map((provider) => (
          <Button
            key={provider}
            type="submit"
            name="provider"
            value={provider}
            variant="outline"
            className="w-full gap-2"
            disabled={isPending}
          >
            {provider === "google" ? <GoogleIcon /> : <AppleIcon />}
            {LABELS[provider]}
          </Button>
        ))}
      </form>
      <div className="text-muted-foreground flex items-center gap-3 text-xs">
        <span className="bg-border h-px flex-1" />o con tu email
        <span className="bg-border h-px flex-1" />
      </div>
    </div>
  );
}
