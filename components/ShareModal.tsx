"use client";

import { useState } from "react";

interface ShareModalProps {
  url: string;
  title?: string;
  onClose: () => void;
}

const socials = [
  {
    name: "WhatsApp",
    href: (url: string) => `https://wa.me/?text=${encodeURIComponent(url)}`,
    icon: (
      <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
      </svg>
    ),
  },
  {
    name: "Facebook",
    href: (url: string) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    icon: (
      <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
      </svg>
    ),
  },
  {
    name: "Email",
    href: (url: string, title?: string) =>
      `mailto:?subject=${encodeURIComponent(title || "Check out this gallery")}&body=${encodeURIComponent(url)}`,
    icon: (
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
      </svg>
    ),
  },
  {
    name: "X (Twitter)",
    href: (url: string) => `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}`,
    icon: (
      <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
      </svg>
    ),
  },
  {
    name: "Pinterest",
    href: (url: string) => `https://pinterest.com/pin/create/button/?url=${encodeURIComponent(url)}`,
    icon: (
      <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
        <path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 01.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12.017 24c6.624 0 11.99-5.367 11.99-11.988C24.007 5.367 18.641 0 12.017 0z"/>
      </svg>
    ),
  },
];

export default function ShareModal({ url, title, onClose }: ShareModalProps) {
  const [copied, setCopied] = useState(false);
  const hasNativeShare = typeof navigator !== "undefined" && !!navigator.share;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleNativeShare = async () => {
    try {
      await navigator.share({ title: title || "Gallery", url });
    } catch {
      // user cancelled
    }
  };

  // Instagram has no web post/story intent, so the best we can do is copy the
  // link and open Instagram, ready for the user to paste into a story or bio.
  const handleInstagram = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked
    }
    window.open("https://www.instagram.com", "_blank", "noopener,noreferrer");
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-black/30"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-[61] flex items-center justify-center p-4 pointer-events-none">
        <div
          className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6 pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="text-lg font-bold uppercase tracking-wide text-gray-900 mb-4">
            Share
          </h2>

          <div className="flex items-center gap-2 mb-5">
            <div className="flex-1 bg-gray-100 rounded px-3 py-2.5 text-sm text-gray-600 truncate">
              {url}
            </div>
            <button
              onClick={handleCopy}
              className="bg-gray-900 text-white text-xs font-semibold uppercase tracking-wider px-4 py-2.5 rounded hover:bg-gray-800 transition-colors whitespace-nowrap"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>

          <div className="grid grid-cols-4 gap-4">
            {socials.map((s) => (
              <a
                key={s.name}
                href={s.href(url, title)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center gap-1.5 text-gray-500 hover:text-gray-800 transition-colors"
              >
                <div className="w-12 h-12 rounded-full bg-gray-500 hover:bg-gray-700 text-white flex items-center justify-center transition-colors">
                  {s.icon}
                </div>
                <span className="text-[10px] text-gray-500">{s.name}</span>
              </a>
            ))}
            <button
              onClick={handleInstagram}
              className="flex flex-col items-center gap-1.5 text-gray-500 hover:text-gray-800 transition-colors"
              title="Copy link and open Instagram (paste into your story or bio)"
            >
              <div className="w-12 h-12 rounded-full bg-gray-500 hover:bg-gray-700 text-white flex items-center justify-center transition-colors">
                <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                  <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                  <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
                </svg>
              </div>
              <span className="text-[10px] text-gray-500">Instagram</span>
            </button>
            {hasNativeShare && (
              <button
                onClick={handleNativeShare}
                className="flex flex-col items-center gap-1.5"
              >
                <div className="w-12 h-12 rounded-full bg-gray-500 hover:bg-gray-700 text-white flex items-center justify-center transition-colors">
                  <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
                    <circle cx="5" cy="12" r="2" />
                    <circle cx="12" cy="12" r="2" />
                    <circle cx="19" cy="12" r="2" />
                  </svg>
                </div>
                <span className="text-[10px] text-gray-500">More</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
