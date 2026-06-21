"use client";

import { SessionProvider } from "next-auth/react";
import FeedbackButton from "@/components/FeedbackButton";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      {children}
      {/* Feedback widget is admin-only — mounted here so it never shows on
          public homepage or client-facing gallery pages (guests don't see it). */}
      <FeedbackButton
        endpoint="https://issue-creator.xuban-ceccon.workers.dev"
        repo="EHxuban11/ekitaldi"
        app="ekitaldi"
      />
    </SessionProvider>
  );
}
