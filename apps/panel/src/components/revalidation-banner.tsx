import { revalidateSite } from "@/app/sites/[siteId]/actions";
import { messages } from "@/lib/messages";
import type { RevalidationStatus } from "@/lib/revalidation";
import { ActionButton } from "./action-button";

export function RevalidationBanner({
  siteId,
  status,
}: {
  siteId: string;
  status: RevalidationStatus;
}) {
  if (!status.pending) return null;
  return (
    <div className="banner" role="region" aria-label="Atualização pendente">
      <p>{messages.revalidation.pending}</p>
      <ActionButton
        action={revalidateSite.bind(null, siteId)}
        label={messages.revalidation.retry}
        pendingLabel={messages.revalidation.retrying}
      />
    </div>
  );
}
