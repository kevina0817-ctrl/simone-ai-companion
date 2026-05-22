import { useCallback, useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

const MIN_HEIGHT_PX = 24;
const MAX_HEIGHT_PX = 128;

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

function resizeToContent(textarea: HTMLTextAreaElement) {
  textarea.style.height = "0px";
  const next = Math.min(Math.max(textarea.scrollHeight, MIN_HEIGHT_PX), MAX_HEIGHT_PX);
  textarea.style.height = `${next}px`;
  textarea.style.overflowY = textarea.scrollHeight > MAX_HEIGHT_PX ? "auto" : "hidden";
}

export function ChatMessageInput({
  value,
  onChange,
  onSubmit,
  placeholder = "Message Simone…",
  disabled,
  className,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const syncHeight = useCallback(() => {
    const el = textareaRef.current;
    if (el) resizeToContent(el);
  }, []);

  useLayoutEffect(() => {
    syncHeight();
  }, [value, syncHeight]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter") return;
    if (e.nativeEvent.isComposing) return;
    if (e.shiftKey) return;
    e.preventDefault();
    if (!disabled && value.trim()) onSubmit();
  };

  return (
    <textarea
      ref={textareaRef}
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      disabled={disabled}
      aria-label={placeholder}
      className={cn(
        "min-h-6 w-full resize-none bg-transparent px-3 py-1.5 text-sm leading-relaxed",
        "placeholder:text-muted-foreground focus:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      style={{ maxHeight: MAX_HEIGHT_PX }}
    />
  );
}
