import { Suspense } from "react";
import { DeviceAuthorizationFlow } from "@/components/conduit/DeviceAuthorizationFlow";

export default function ConduitDeviceAuthorizationPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <DeviceAuthorizationFlow />
    </Suspense>
  );
}
