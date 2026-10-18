"use client";

import React, { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { motion, useReducedMotion } from "framer-motion";

gsap.registerPlugin(ScrollTrigger);

const EASE = [0.16, 1, 0.3, 1] as const;
;

/**
 * Page-level scroll reveal. Wraps page content and fades/raises each direct
 * section as it enters the viewport via GSAP ScrollTrigger. Respects both the
 * OS reduced-motion preference and the in-app reduce-motion setting.
 */
export function PageScrollReveal({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (prefersReducedMotion || !ref.current) return;
    if (typeof document !== "undefined" && document.documentElement.dataset.reduceMotion === "reduce") return;
    const ctx = gsap.context(() => {
      // Content may be wrapped once (e.g. route templates render .page-enter).
      // Animate the innermost meaningful sections, not the single wrapper.
      let sections = ref.current ? gsap.utils.toArray<HTMLElement>(":scope > *") : [];
      if (sections.length === 1 && sections[0].children.length > 1) {
        sections = gsap.utils.toArray<HTMLElement>(":scope > * > *");
      }
      sections.forEach((section, index) => {
        gsap.fromTo(
          section,
          { opacity: 0, y: 24, scale: 0.985 },
          {
            opacity: 1,
            y: 0,
            scale: 1,
            duration: 0.65,
            ease: "back.out(1.4)",
            delay: index * 0.06,
            // Hidden until its own scroll entry — content pops in as you scroll.
            scrollTrigger: { trigger: section, start: "top 85%", once: true },
            clearProps: "opacity,transform,scale",
          },
        );
      });
      // Repeated cards inside a page reveal item-by-item as they enter view.
      const items = ref.current ? gsap.utils.toArray<HTMLElement>(
        ":scope .timeline-memories > *, :scope .memory-card, :scope .conversation-row, :scope .person-card, :scope .settings-card, :scope .day-recap, :scope .ride-option, :scope .care-record-row, :scope .chat-exchange, :scope .install-steps > li, :scope .ask-sidebar-links > a",
      ) : [];
      items.forEach((item, index) => {
        gsap.fromTo(
          item,
          { opacity: 0, y: 20 },
          {
            opacity: 1,
            y: 0,
            duration: 0.6,
            ease: "power3.out",
            delay: (index % 4) * 0.06,
            scrollTrigger: { trigger: item, start: "top 92%", once: true },
            clearProps: "opacity,transform",
          },
        );
      });
    }, ref);
    return () => ctx.revert();
  }, [prefersReducedMotion]);

  return <div ref={ref} className={`page-scroll-reveal ${className}`.trim()}>{children}</div>;
}

/**
 * Stagger-reveal wrapper for tile lists. Uses GSAP ScrollTrigger so items
 * fade/raise into place the first time the list enters the viewport.
 */
export function ScrollRevealList({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (prefersReducedMotion || !ref.current) return;
    if (typeof document !== "undefined" && document.documentElement.dataset.reduceMotion === "reduce") return;
    const ctx = gsap.context(() => {
      const items = ref.current ? gsap.utils.toArray<HTMLElement>(":scope > *") : [];
      if (!items.length) return;
      gsap.fromTo(
        items,
        { opacity: 0, y: 20 },
        {
          opacity: 1,
          y: 0,
          duration: 0.6,
          ease: "power3.out",
          stagger: 0.08,
          scrollTrigger: { trigger: ref.current, start: "top 90%", once: true },
          clearProps: "opacity,transform",
        },
      );
    }, ref);
    return () => ctx.revert();
  }, [prefersReducedMotion]);

  return <div ref={ref} className={`patient-reveal-list ${className}`.trim()}>{children}</div>;
}

/**
 * Quiet entrance animation for headings and standalone blocks that render
 * before scroll (above the fold). Use inside server components via wrappers.
 */
export function FadeIn({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const prefersReducedMotion = useReducedMotion();
  if (prefersReducedMotion) return <div className={className}>{children}</div>;
  return <motion.div
    className={className}
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.6, ease: EASE, delay }}
  >{children}</motion.div>;
}
