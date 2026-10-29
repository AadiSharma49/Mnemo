"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * Mnemo logo.
 *
 * `LogoMark` — the icon tile (a geometric "M" with a memory-node accent
 * in its valley) as a flat tile in the theme's primary (ink) colour.
 * `Logo` — the mark plus the "Mnemo" wordmark (serif heading font).
 *
 * Pure SVG so it stays razor-sharp at every size, from a 16px favicon to a hero.
 */

export function LogoMark({
  size = 28,
  className,
}: {
  size?: number
  className?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Mnemo"
      className={className}
    >
      {/* tile */}
      <rect width="512" height="512" rx="120" fill="var(--tw-pr)" />

      {/* M glyph */}
      <path
        d="M148 372 V148 L256 282 L364 148 V372"
        fill="none"
        stroke="var(--tw-pr-fg)"
        strokeWidth="58"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* memory node in the valley */}
      <circle cx="256" cy="340" r="26" fill="var(--tw-pr-fg)" />
      <circle cx="256" cy="340" r="10" fill="var(--tw-pr)" />
    </svg>
  )
}

export function Logo({
  size = 28,
  className,
  wordmark = true,
}: {
  size?: number
  className?: string
  wordmark?: boolean
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark size={size} className="rounded-[22%]" />
      {wordmark && (
        <span className="font-heading text-sm font-semibold tracking-tight">
          Mnemo
        </span>
      )}
    </span>
  )
}

export default Logo
