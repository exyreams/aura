import { Button } from "@/components/global/Button";

interface ActivityErrorStateProps {
  error: string;
  onRefresh: () => void;
}

export function ActivityErrorState({
  error,
  onRefresh,
}: ActivityErrorStateProps) {
  return (
    <div className="flex flex-col items-start gap-4 rounded-lg border border-danger/30 bg-danger/10 p-5">
      <div>
        <h3 className="font-semibold text-danger">
          Could not load activity events
        </h3>
        <p className="mt-1 text-sm leading-6 text-danger/90">{error}</p>
      </div>
      <Button type="button" variant="secondary" onClick={onRefresh}>
        Retry
      </Button>
    </div>
  );
}
