import { Suspense } from "react";
import {
  EmailAuthFallback,
  EmailAuthForm,
} from "@/components/auth/EmailAuthForms";

export default function ResetPage() {
  return (
    <Suspense fallback={<EmailAuthFallback />}>
      <EmailAuthForm mode="reset-password" />
    </Suspense>
  );
}
