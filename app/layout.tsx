import type { Metadata } from "next";
import { Raleway } from "next/font/google";
import "./globals.css";
import FeedbackButton from "@/components/FeedbackButton";

const raleway = Raleway({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-raleway",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Ekitaldi",
    template: "%s | Ekitaldi",
  },
  description: "Free, self-hosted photo galleries for photographers. A Pixieset alternative.",
  openGraph: {
    title: "Ekitaldi",
    description: "Free, self-hosted photo galleries for photographers. A Pixieset alternative.",
    siteName: "Ekitaldi",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Ekitaldi",
    description: "Free, self-hosted photo galleries for photographers. A Pixieset alternative.",
  },
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📷</text></svg>",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={raleway.variable}>
      <body className="bg-white text-gray-900 min-h-screen">
        {children}
        <FeedbackButton
          endpoint="https://issue-creator.xuban-ceccon.workers.dev"
          repo="EHxuban11/ekitaldi"
          app="ekitaldi"
        />
      </body>
    </html>
  );
}
