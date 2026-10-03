import { MetaBadge } from "@/components/ui/meta-badge";
import { displayUrgencyForDeadline } from "@/lib/ui/format";
import { isVisibleTag, normalizeTagValue, type TagKind } from "@/lib/ui/tags";

export function ThreadTags({
  category,
  status,
  importance,
  urgency,
  deadline,
  actionType,
  showStatus = true,
  showImportance = true,
  includeLowImportance = false,
  categoryHref,
}: {
  category?: string | null;
  status?: string | null;
  importance?: string | null;
  urgency?: string | null;
  deadline?: string | null;
  actionType?: string | null;
  showStatus?: boolean;
  showImportance?: boolean;
  includeLowImportance?: boolean;
  categoryHref?: string;
}) {
  const urgencyValue = displayUrgencyForDeadline(deadline, urgency);
  const tags: Array<{ kind: TagKind; value: string }> = [];

  if (isVisibleTag("category", category)) {
    tags.push({ kind: "category", value: category });
  }
  if (showStatus && isVisibleTag("status", status)) {
    tags.push({ kind: "status", value: status });
  }
  if (
    showImportance &&
    isVisibleTag("importance", importance) &&
    (includeLowImportance || normalizeTagValue(importance) !== "low")
  ) {
    tags.push({ kind: "importance", value: importance });
  }
  if (isVisibleTag("urgency", urgencyValue)) {
    tags.push({ kind: "urgency", value: urgencyValue });
  }
  if (isVisibleTag("action", actionType)) {
    tags.push({ kind: "action", value: actionType });
  }

  if (tags.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {tags.map((tag) => (
        <MetaBadge
          key={`${tag.kind}:${tag.value}`}
          kind={tag.kind}
          value={tag.value}
          href={tag.kind === "category" ? categoryHref : undefined}
        />
      ))}
    </div>
  );
}
