"use client"

import * as React from "react"
import Link from "next/link"
import { useUser } from "@clerk/nextjs"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Icons } from "@/lib/icons"

import {
  SiOpenai,
  SiAnthropic,
  SiGooglegemini,
  SiGithub,
  SiNotion,
  SiSlack,
  SiDiscord,
} from "react-icons/si"
import { VscVscode } from "react-icons/vsc"

const EASING = [0.21, 0.47, 0.32, 0.98] as [number, number, number, number]

function EcosystemLogos() {
  const logos = [
    { icon: SiOpenai, name: "OpenAI", color: "text-emerald-500" },
    { icon: SiAnthropic, name: "Anthropic", color: "text-amber-500" },
    { icon: SiGooglegemini, name: "Gemini", color: "text-blue-500" },
    { icon: SiGithub, name: "GitHub", color: "text-gray-300" },
    { icon: SiNotion, name: "Notion", color: "text-gray-200" },
    { icon: SiSlack, name: "Slack", color: "text-pink-500" },
    { icon: SiDiscord, name: "Discord", color: "text-indigo-400" },
    { icon: VscVscode, name: "VS Code", color: "text-sky-400" },
  ]

  const allLogos = [...logos, ...logos]

  return (
    <div className="relative overflow-hidden mt-16">
      <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-background to-transparent" />

      <div className="flex animate-marquee whitespace-nowrap">
        {allLogos.map((logo, idx) => {
          const Icon = logo.icon
          return (
            <div
              key={logo.name + idx}
              className="flex items-center justify-center mx-8 transition-all duration-300 hover:scale-110"
            >
              <Icon
                className={`h-7 w-7 ${logo.color} opacity-70 transition-all duration-300 hover:opacity-100 hover:drop-shadow-[0_0_8px_rgba(96,165,250,0.5)]`}
                title={logo.name}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function Hero() {
  const { isSignedIn } = useUser()
  return (
    <section className="relative flex flex-col items-center justify-center overflow-hidden pt-32 pb-16 sm:pt-40 sm:pb-24">
      <div className="w-full mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 text-center">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASING }}
          className="mb-6 inline-flex items-center gap-2 rounded-full border bg-card px-3.5 py-1.5 text-xs font-medium text-muted-foreground"
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
          </span>
          New · One-click browser capture
        </motion.div>

        {/* LCP element — rendered immediately (no entrance animation) so the
            largest text paints without waiting for JS hydration. */}
        <h1 className="font-heading text-3xl sm:text-5xl md:text-6xl font-bold leading-[1.1] tracking-tight text-balance">
          Your AI conversations are full of decisions.
          <br />
          <span className="text-gradient-hero">Stop losing them.</span>
        </h1>

        <p className="mt-6 max-w-2xl mx-auto text-lg text-muted-foreground">
          One click captures your ChatGPT, Claude, and Gemini chats — Mnemo pulls out the decisions and makes them searchable forever.
        </p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6, ease: EASING }}
          className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
        >
          <Link href={"/extension" as any}>
            <Button
              size="lg"
              className="group h-12 border-0 bg-primary px-8 text-base font-semibold text-primary-foreground transition-all"
            >
              <Icons.plug className="mr-2 h-4 w-4" />
              Get the extension
              <Icons.arrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Button>
          </Link>
          <Link href={"/dashboard/import" as any}>
            <Button
              size="lg"
              variant="outline"
              className="h-12 px-6 text-base font-medium"
            >
              <Icons.download className="mr-2 h-4 w-4" />
              or paste a chat link / import history
            </Button>
          </Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35, duration: 0.6 }}
          className="mt-4"
        >
          <Link
            href="#how-it-works"
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            See how it works
          </Link>
        </motion.div>

        <EcosystemLogos />
      </div>
    </section>
  )
}
