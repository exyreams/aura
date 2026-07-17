import { Suspense } from "react";
import {
  EmailAuthFallback,
  EmailAuthForm,
} from "@/components/auth/EmailAuthForms";

export default function LoginPage() {
  return (
    <Suspense fallback={<EmailAuthFallback />}>
      <EmailAuthForm mode="sign-in" />
    </Suspense>
  );
}
