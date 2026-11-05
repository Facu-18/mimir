'use client';

import { MotionConfig, motion } from 'motion/react';
import type { ReactNode } from 'react';

/** Makes every Motion animation below it respect `prefers-reduced-motion`. */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

const VIEW_SECONDS = 0.18;

/** View entrance: only `opacity` and `transform`, as the plan asks. */
export function Reveal({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      data-view=""
      className={className}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: VIEW_SECONDS, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
