"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
export function FeedbackDraft({ email }: { email: string | null }) {
  const [topic, setTopic] = useState(""),
    [details, setDetails] = useState(""),
    [message, setMessage] = useState("");
  const body = `Topic: ${topic}\n\nWhat happened / expected behavior:\n${details}\n\nProduct: Personal Management Platform V1`;
  return (
    <Panel
      title="Prepare feedback"
      description="Describe the workflow and expected result. The draft contains only what you type; private records and session credentials are never attached automatically."
    >
      <div className="max-w-2xl space-y-4">
        <label htmlFor="feedback-topic" className="block font-medium">
          Topic
        </label>
        <Input
          id="feedback-topic"
          maxLength={150}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        />
        <label htmlFor="feedback-details" className="block font-medium">
          Details
        </label>
        <textarea
          id="feedback-details"
          rows={6}
          maxLength={5000}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          className="w-full rounded-control border border-input bg-background p-3"
        />
        <div className="flex flex-wrap gap-4">
          <Button
            disabled={!topic.trim() || !details.trim()}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(body);
                setMessage("Feedback draft copied. It has not been sent.");
              } catch {
                setMessage(
                  "Copy was unavailable. Select and copy the details manually.",
                );
              }
            }}
          >
            Copy feedback draft
          </Button>
          {email ? (
            <a
              className="inline-flex min-h-11 items-center text-link underline"
              href={`mailto:${email}?subject=${encodeURIComponent(topic)}&body=${encodeURIComponent(body)}`}
            >
              Open support email draft
            </a>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">
          {email
            ? "Your email application opens a draft for you to review and send."
            : "A support contact is not configured for this deployment. Copy your draft and share it with the workspace service operator through your agreed support channel."}
        </p>
        {message ? <p role="status">{message}</p> : null}
      </div>
    </Panel>
  );
}
