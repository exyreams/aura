import { Suspense } from "react";
import {
  EmailAuthFallback,
  EmailAuthForm,
} from "@/components/auth/EmailAuthForms";

export default function RecoverPage() {
  return (
    <Suspense fallback={<EmailAuthFallback />}>
      <EmailAuthForm mode="forgot-password" />
    </Suspense>
  );
}
