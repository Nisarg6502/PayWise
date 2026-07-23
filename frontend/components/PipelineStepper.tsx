"use client";

export interface StepDetail {
  text: string;
  kind: "accent" | "reward" | "plain";
}

export type Phase = "idle" | "running" | "done" | "error";
export type QueryType = "purchase" | "general" | "off_topic";

export const STEP_LABELS = [
  "Understanding your question",
  "Reading your cards' reward rules",
  "Ranking the relevant rules",
  "Calculating your rewards",
  "Writing your recommendation",
];

const STEP_LABELS_GENERAL = [
  "Understanding your question",
  "Gathering the right context",
  "Ranking the relevant rules",
  "Preparing your sources",
  "Writing your answer",
];

const STEP_LABELS_OFF_TOPIC = [
  "Understanding your question",
  "Checking it's about your cards",
  "Checking it's about your cards",
  "Checking it's about your cards",
  "Replying",
];

function labelsFor(queryType: QueryType | undefined): string[] {
  if (queryType === "general") return STEP_LABELS_GENERAL;
  if (queryType === "off_topic") return STEP_LABELS_OFF_TOPIC;
  return STEP_LABELS;
}

interface Props {
  phase: Phase;
  activeStep: number; // index of the currently-running step
  errorStep: number;
  details: Record<number, StepDetail[]>;
  coldStart: boolean; // true when step 0 has been active for a while
  queryType?: QueryType;
  onRetry: () => void;
}

export default function PipelineStepper({ phase, activeStep, errorStep, details, coldStart, queryType, onRetry }: Props) {
  if (phase === "idle") return null;
  const labels = labelsFor(queryType);

  return (
    <div
      className="panel fade-up"
      style={{ marginTop: 26, padding: "8px 22px" }}
      role="list"
      aria-label="AI pipeline progress"
    >
      {labels.map((label, i) => {
        let status: "pending" | "active" | "complete" | "error";
        if (phase === "error" && i === errorStep) status = "error";
        else if (phase === "error" && i > errorStep) status = "pending";
        else if (i < activeStep || phase === "done") status = "complete";
        else if (i === activeStep && phase === "running") status = "active";
        else status = "pending";

        const stepDetails = status === "complete" ? details[i] ?? [] : [];
        const displayLabel =
          i === 0 && status === "active" && coldStart
            ? "Waking up the brain… first answer after a nap takes a moment"
            : label;

        return (
          <div className="step-row" key={i} role="listitem" aria-current={status === "active" ? "step" : undefined}>
            <div className={`step-dot ${status}`}>
              {status === "complete" ? "✓" : status === "active" ? <span /> : status === "error" ? "!" : ""}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className={`step-label ${status === "error" ? "err" : status !== "pending" ? "on" : ""}`}>
                {displayLabel}
              </div>
              {stepDetails.length > 0 && (
                <div style={{ display: "flex", gap: 7, marginTop: 9, flexWrap: "wrap", animation: "fadeUp .35s var(--ease) both" }}>
                  {stepDetails.map((d) => (
                    <span key={d.text} className={`chip ${d.kind === "accent" ? "chip-accent" : d.kind === "reward" ? "chip-reward" : ""}`}>
                      {d.text}
                    </span>
                  ))}
                </div>
              )}
              {status === "error" && (
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 9 }}>
                  <span style={{ fontSize: 13, color: "var(--danger)" }}>This step failed — the engine may be waking up.</span>
                  <button className="chip-btn" onClick={onRetry}>↻ Retry</button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
