"use client"

import * as React from "react"
import { ArrowDownIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

// ── Self-contained MessageScroller stub (replaces @shadcn/react/message-scroller) ──

interface ScrollerContextValue {
  scrollRef: React.RefObject<HTMLDivElement | null>
  isAtBottom: boolean
  scrollToBottom: () => void
}

const ScrollerContext = React.createContext<ScrollerContextValue | null>(null)

function useMessageScroller() {
  const ctx = React.useContext(ScrollerContext)
  if (!ctx) throw new Error("useMessageScroller must be used within MessageScrollerProvider")
  return ctx
}

function useMessageScrollerScrollable() {
  const { scrollRef } = useMessageScroller()
  return { ref: scrollRef }
}

function useMessageScrollerVisibility() {
  const { isAtBottom } = useMessageScroller()
  return { isVisible: !isAtBottom }
}

function MessageScrollerProvider({ children }: { children: React.ReactNode }) {
  const scrollRef = React.useRef<HTMLDivElement | null>(null)
  const [isAtBottom, setIsAtBottom] = React.useState(true)

  const scrollToBottom = React.useCallback(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [])

  const handleScroll = React.useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    setIsAtBottom(atBottom)
  }, [])

  React.useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.addEventListener("scroll", handleScroll, { passive: true })
    return () => el.removeEventListener("scroll", handleScroll)
  }, [handleScroll])

  return (
    <ScrollerContext.Provider value={{ scrollRef, isAtBottom, scrollToBottom }}>
      {children}
    </ScrollerContext.Provider>
  )
}

function MessageScroller({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="message-scroller"
      className={cn("group/message-scroller relative flex size-full min-h-0 flex-col overflow-hidden", className)}
      {...props}
    />
  )
}

function MessageScrollerViewport({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const { scrollRef } = useMessageScroller()
  return (
    <div
      ref={scrollRef}
      data-slot="message-scroller-viewport"
      className={cn("size-full min-h-0 min-w-0 overflow-y-auto overscroll-contain", className)}
      {...props}
    />
  )
}

function MessageScrollerContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="message-scroller-content"
      className={cn("flex h-max min-h-full flex-col gap-8", className)}
      {...props}
    />
  )
}

function MessageScrollerItem({
  className,
  scrollAnchor: _scrollAnchor,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { scrollAnchor?: boolean }) {
  return (
    <div
      data-slot="message-scroller-item"
      className={cn("min-w-0 shrink-0", className)}
      {...props}
    />
  )
}

function MessageScrollerButton({
  direction = "end",
  className,
  children,
  variant = "secondary",
  size = "icon-sm",
  ...props
}: React.HTMLAttributes<HTMLButtonElement> & {
  direction?: "start" | "end"
  variant?: React.ComponentProps<typeof Button>["variant"]
  size?: React.ComponentProps<typeof Button>["size"]
  render?: React.ReactElement
}) {
  const { isAtBottom, scrollToBottom } = useMessageScroller()
  const isActive = direction === "end" ? !isAtBottom : false

  return (
    <Button
      data-slot="message-scroller-button"
      data-direction={direction}
      data-active={isActive}
      variant={variant}
      size={size}
      onClick={scrollToBottom}
      className={cn(
        "absolute inset-x-1/2 -translate-x-1/2 transition-[translate,scale,opacity] duration-200",
        "data-[active=false]:pointer-events-none data-[active=false]:scale-95 data-[active=false]:opacity-0",
        "data-[active=true]:scale-100 data-[active=true]:opacity-100",
        direction === "end" ? "bottom-4" : "top-4",
        className
      )}
      {...(props as React.ComponentProps<typeof Button>)}
    >
      {children ?? (
        <>
          <ArrowDownIcon />
          <span className="sr-only">
            {direction === "end" ? "Scroll to end" : "Scroll to start"}
          </span>
        </>
      )}
    </Button>
  )
}

export {
  MessageScrollerProvider,
  MessageScroller,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerButton,
  useMessageScroller,
  useMessageScrollerScrollable,
  useMessageScrollerVisibility,
}
