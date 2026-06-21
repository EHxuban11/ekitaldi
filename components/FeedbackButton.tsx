"use client";

/**
 * FeedbackButton — drop-in from EHxuban11/issue-creator (client/react).
 *
 * A floating button that opens a small panel and POSTs feedback to the hosted
 * issue-creator Worker, which files it as a `feedback`-labelled GitHub issue in
 * this repo. No token/secret in the client. Mounted app-wide in app/layout.tsx.
 *
 * url + userAgent are attached to every report automatically (see submit()).
 */
import { useCallback, useState, type CSSProperties } from "react";

export interface FeedbackButtonProps {
  /** Worker base URL or full …/feedback URL. */
  endpoint: string;
  /** Target repo, "owner/name". */
  repo: string;
  /** Optional app name → `app:<name>` label + body row. */
  app?: string;
  /** Optional: extra metadata appended to the issue body. */
  getMeta?: () => Record<string, unknown>;
  /** Optional: return a PNG data URL to attach (e.g. a Tauri screenshot). */
  captureImage?: () => Promise<string | null | undefined>;
  /** Optional: bearer token, when the Worker has AUTH_TOKEN_SECRET enabled. */
  getAuthToken?: () => Promise<string | null | undefined> | string | null | undefined;
}

type Status = { kind: "idle" | "sending" } | { kind: "ok"; url: string } | { kind: "err"; msg: string };

export function FeedbackButton(props: FeedbackButtonProps) {
  const { endpoint, repo, app, getMeta, captureImage, getAuthToken } = props;
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const url = endpoint.replace(/\/+$/, "");
  const postUrl = url.endsWith("/feedback") ? url : `${url}/feedback`;

  const submit = useCallback(async () => {
    const text = message.trim();
    if (!text) {
      setStatus({ kind: "err", msg: "Please write something first." });
      return;
    }
    setStatus({ kind: "sending" });
    try {
      const image = captureImage ? await captureImage() : undefined;
      const token = getAuthToken ? await getAuthToken() : undefined;
      const meta = {
        url: typeof location !== "undefined" ? location.href : undefined,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
        ...(getMeta ? getMeta() : {}),
      };
      const res = await fetch(postUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          repo,
          message: text,
          app,
          meta,
          ...(image ? { image } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; error?: string };
      if (res.ok && data.ok && data.url) {
        setStatus({ kind: "ok", url: data.url });
        setMessage("");
      } else {
        setStatus({ kind: "err", msg: data.error || `Something went wrong (HTTP ${res.status}).` });
      }
    } catch {
      setStatus({ kind: "err", msg: "Network error — could not reach the feedback service." });
    }
  }, [message, postUrl, repo, app, getMeta, captureImage, getAuthToken]);

  return (
    <div style={styles.root}>
      {open && (
        <div style={styles.panel} role="dialog" aria-label="Send feedback">
          <div style={styles.head}>
            <strong style={{ fontSize: 14 }}>Send feedback</strong>
            <button style={styles.close} onClick={() => setOpen(false)} aria-label="Close">
              ×
            </button>
          </div>
          <textarea
            style={styles.textarea}
            placeholder="Describe the bug or idea…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <button style={styles.submit} onClick={submit} disabled={status.kind === "sending"}>
            {status.kind === "sending" ? "Sending…" : "Send"}
          </button>
          {status.kind === "ok" && (
            <div style={{ ...styles.status, color: "#047857" }}>
              Filed →{" "}
              <a href={status.url} target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>
                view issue
              </a>
            </div>
          )}
          {status.kind === "err" && <div style={{ ...styles.status, color: "#b91c1c" }}>{status.msg}</div>}
        </div>
      )}
      <button style={styles.launcher} onClick={() => setOpen((o) => !o)}>
        Feedback
      </button>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  root: { position: "fixed", bottom: 20, right: 20, zIndex: 2147483647 },
  launcher: {
    border: "none",
    borderRadius: 9999,
    padding: "12px 18px",
    cursor: "pointer",
    background: "#1f2937",
    color: "#fff",
    fontSize: 14,
    fontWeight: 600,
    boxShadow: "0 6px 20px rgba(0,0,0,.25)",
  },
  panel: {
    position: "absolute",
    bottom: 56,
    right: 0,
    width: 320,
    maxWidth: "90vw",
    background: "#fff",
    color: "#111827",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    boxShadow: "0 12px 40px rgba(0,0,0,.25)",
    padding: 14,
  },
  head: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  close: { border: "none", background: "none", cursor: "pointer", fontSize: 18, color: "#6b7280" },
  textarea: {
    width: "100%",
    minHeight: 110,
    resize: "vertical",
    padding: 10,
    border: "1px solid #d1d5db",
    borderRadius: 8,
    fontSize: 14,
    fontFamily: "inherit",
    boxSizing: "border-box",
  },
  submit: {
    marginTop: 10,
    width: "100%",
    border: "none",
    borderRadius: 8,
    padding: 10,
    background: "#2563eb",
    color: "#fff",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  status: { marginTop: 10, fontSize: 13 },
};

export default FeedbackButton;
