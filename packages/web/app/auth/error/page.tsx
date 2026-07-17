import Link from "next/link";
import { AuthSplitShell } from "@/components/auth/AuthSplitShell";
import { Button } from "@/components/global/Button";

export default function AuthErrorPage() {
  return (
    <AuthSplitShell
      title="Authentication link failed"
      description="The link may have expired or already been used. Request a new sign-in or recovery email."
      visualLabel="Link expired"
      visualTitle="Auth links are short-lived by design."
      visualDescription="Request a fresh link from the email flow so Supabase can issue a new verified session."
    >
      <div className="mt-6">
        <Link href="/auth/login">
          <Button type="button" variant="primary">
            Return to sign in
          </Button>
        </Link>
      </div>
    </AuthSplitShell>
  );
}
