"use client"

import * as React from "react"
import Link from "next/link"
import { useUser } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import { Icons } from "@/lib/icons"
import { AnimatedSection } from "./animated-section"

export function CTA() {
  const { isSignedIn } = useUser()

  return (
    <section className="relative overflow-hidden py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <AnimatedSection>
          <div className="glass-panel relative mx-auto max-w-2xl overflow-hidden rounded-xl px-6 py-14 text-center sm:px-12">
            <h2 className="font-heading relative text-3xl font-bold tracking-tight sm:text-4xl">
              Start capturing decisions today
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Import your first conversation and see what you&apos;ve been missing.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href={isSignedIn ? "/dashboard" : "/sign-up"}>
                <Button
                  size="lg"
                  className="group h-12 border-0 bg-primary px-8 text-base font-semibold text-primary-foreground transition-all"
                >
                  {isSignedIn ? "Open Dashboard" : "Get Started Free"}
                  <Icons.arrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Button>
              </Link>
            </div>
          </div>
        </AnimatedSection>
      </div>
    </section>
  )
}
