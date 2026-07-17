import { Suspense } from "react";
import { DeviceAuthorizationFlow } from "@/components/conduit/DeviceAuthorizationFlow";

export default function ConduitAuthorizationPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <DeviceAuthorizationFlow />
    </Suspense>
  );
}
