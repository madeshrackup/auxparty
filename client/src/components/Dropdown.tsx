import { useEffect, useId, useRef, useState } from "react";

type Option<T extends string | number> = {
  value: T;
  label: string;
};

export default function Dropdown<T extends string | number>({
  value,
  options,
  onChange,
  placeholder = "Pick one",
  disabled,
}: {
  value: T | "";
  options: Option<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = options.find((opt) => opt.value === value);
  const selectedIndex = options.findIndex((opt) => opt.value === value);

  useEffect(() => {
    if (!open) return;
    setActive(selectedIndex >= 0 ? selectedIndex : 0);
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, selectedIndex]);

  function pick(opt: Option<T>) {
    onChange(opt.value);
    setOpen(false);
  }

  function onTriggerKey(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const dir = event.key === "ArrowDown" ? 1 : -1;
      setActive((i) => {
        const next = i < 0 ? 0 : (i + dir + options.length) % options.length;
        return next;
      });
    } else if (event.key === "Enter" || event.key === " ") {
      if (open && active >= 0 && options[active]) {
        event.preventDefault();
        pick(options[active]);
      }
    }
  }

  return (
    <div className={`dropdown ${open ? "open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="dropdown-trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onTriggerKey}
      >
        <span className={selected ? "" : "dropdown-placeholder"}>{selected?.label ?? placeholder}</span>
        <span className="dropdown-chevron" aria-hidden />
      </button>
      {open && (
        <ul id={listId} className="dropdown-menu" role="listbox">
          {options.map((opt, i) => (
            <li key={String(opt.value)}>
              <button
                type="button"
                role="option"
                aria-selected={opt.value === value}
                className={`dropdown-option ${opt.value === value ? "on" : ""} ${i === active ? "active" : ""}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(opt)}
              >
                {opt.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
