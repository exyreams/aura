import { Suspense } from "react";
import {
  EmailAuthFallback,
  EmailAuthForm,
} from "@/components/auth/EmailAuthForms";

export default function SignupPage() {
  return (
    <Suspense fallback={<EmailAuthFallback />}>
      <EmailAuthForm mode="sign-up" />
    </Suspense>
  );
}
