import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  pending_review: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400",
  active: "bg-green-500/15 text-green-600 dark:text-green-400",
  unpublished: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  suspended: "bg-destructive/15 text-destructive",
  pending_payment: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400",
  paid: "bg-green-500/15 text-green-600 dark:text-green-400",
  refunded: "bg-destructive/15 text-destructive",
  partially_refunded: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  cancelled: "bg-muted text-muted-foreground",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        STATUS_STYLES[status] ?? "bg-muted text-muted-foreground"
      )}
    >
      {status.replace("_", " ")}
    </span>
  );
}
