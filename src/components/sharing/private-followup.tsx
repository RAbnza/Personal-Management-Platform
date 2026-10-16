"use client";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { CommandForm, Field } from "./forms";
export function PrivateFollowup({
  groupId,
  settlementId,
}: {
  groupId: string;
  settlementId: string;
}) {
  const router = useRouter();
  return (
    <details>
      <summary className="min-h-11 cursor-pointer">
        Create your private Calendar follow-up
      </summary>
      <p>
        Choose your own review date. This personal event remains until you
        complete or cancel it. On its detail page you can explicitly opt into
        reminders and optional email through your existing notification
        settings. No message is sent to other participants.
      </p>
      <CommandForm
        url="/api/v1/personal-events"
        label="Create private follow-up"
        onSuccess={(r) =>
          router.push(`/calendar/events/${(r as { eventId: string }).eventId}`)
        }
        build={(f) => ({
          clientCommandId: crypto.randomUUID(),
          title: "Review shared payment",
          temporalKind: "date",
          eventDate: f.get("date"),
          referenceUrl: new URL(
            `/sharing/${groupId}#settlement-${settlementId}`,
            window.location.origin,
          ).toString(),
          description:
            "Private follow-up. Review current group evidence before acting; complete or cancel this event yourself.",
        })}
      >
        <Field label="Your private review date">
          <Input type="date" name="date" required />
        </Field>
      </CommandForm>
    </details>
  );
}
