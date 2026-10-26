import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export function Dialog({
  title,
  children,
  onClose,
  className = "",
  headerActions,
  focusHeading = false,
  closeLabel = "關閉視窗",
  restoreFocus,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
  headerActions?: ReactNode;
  focusHeading?: boolean;
  closeLabel?: string;
  restoreFocus?: HTMLElement | null;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const pointerOutside = useRef(false);
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    dialog.showModal();
    if (focusHeading) heading.current?.focus();
    else dialog.querySelector<HTMLElement>("[data-dialog-autofocus]")?.focus();
    return () => {
      dialog.close();
      document.documentElement.style.overflow = overflow;
      // Wait until the trigger is re-enabled after stopping Python, and do
      // not take focus away from a replacement dialog (drawer → new file).
      requestAnimationFrame(() => {
        if (document.querySelector("dialog[open]")) return;
        const candidate = restoreFocus ?? previous;
        const target =
          candidate?.isConnected &&
          candidate.getClientRects().length &&
          !candidate.closest("dialog:not([open])") &&
          !candidate.matches(":disabled") &&
          candidate !== document.body
            ? candidate
            : document.querySelector<HTMLElement>("[data-focus-fallback]");
        target?.focus({ preventScroll: true });
      });
    };
  }, []);
  const outside = (x: number, y: number) => {
    const bounds = ref.current!.getBoundingClientRect();
    return (
      x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom
    );
  };
  return (
    <dialog
      ref={ref}
      className={`dialog ${className}`}
      aria-labelledby={titleId}
      aria-modal="true"
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const items = Array.from(
          ref.current!.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, iframe, [tabindex]:not([tabindex="-1"])',
          ),
        ).filter(
          (item) => item.getClientRects().length && !item.closest("[hidden]"),
        );
        const index = items.indexOf(document.activeElement as HTMLElement);
        if (event.shiftKey && index <= 0) {
          event.preventDefault();
          (items.at(-1) ?? heading.current)?.focus();
        } else if (
          !event.shiftKey &&
          (index < 0 || index === items.length - 1)
        ) {
          event.preventDefault();
          (items[0] ?? heading.current)?.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onPointerDown={(event) => {
        pointerOutside.current =
          event.target === ref.current && outside(event.clientX, event.clientY);
      }}
      onPointerUp={(event) => {
        if (
          pointerOutside.current &&
          event.target === ref.current &&
          outside(event.clientX, event.clientY)
        )
          onClose();
        pointerOutside.current = false;
      }}
    >
      <div className="dialog-heading">
        <h2 ref={heading} tabIndex={-1} id={titleId}>
          {title}
        </h2>
        <div className="dialog-heading-actions">
          {headerActions}
          <button
            className="icon-button"
            aria-label={closeLabel}
            title={closeLabel}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
      </div>
      {children}
    </dialog>
  );
}
