import { useEffect, useId, useRef } from 'react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, CircleHelp, LoaderCircle, Search } from 'lucide-react';

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="tooltip" title={label} aria-label={label}>
      {children}
    </span>
  );
}
export function Button({
  variant = 'secondary',
  disabledReason,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger';
  disabledReason?: string;
}) {
  const button = (
    <button
      {...props}
      className={`button ${variant} ${props.className ?? ''}`}
      disabled={props.disabled || !!disabledReason}
      title={disabledReason ?? props.title}
    >
      {children}
    </button>
  );
  return disabledReason ? (
    <span tabIndex={0} className="disabled-button" aria-label={disabledReason} title={disabledReason}>
      {button}
    </span>
  ) : (
    button
  );
}
export function Input({
  label,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  const id = useId();
  return (
    <label className="field" htmlFor={props.id ?? id}>
      <span>{label}</span>
      <input
        {...props}
        id={props.id ?? id}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error && (
        <span className="danger" id={`${id}-error`}>
          <AlertTriangle />
          {error}
        </span>
      )}
    </label>
  );
}
export function SearchInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="search">
      <Search aria-hidden="true" />
      <Input {...props} type="search" label="문제 검색" placeholder="문제 내용·학습목표 검색 (Ctrl+K)" />
    </div>
  );
}
export function Badge({
  kind = 'grade',
  children,
}: {
  kind?: 'warning' | 'error' | 'confirmation' | 'grade';
  children: ReactNode;
}) {
  const Icon =
    kind === 'warning' || kind === 'error'
      ? AlertTriangle
      : kind === 'confirmation'
        ? CircleHelp
        : CheckCircle2;
  return (
    <span className={`badge ${kind}`}>
      <Icon aria-hidden="true" />
      {children}
    </span>
  );
}
export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      {children}
    </section>
  );
}
export function EmptyState({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden="true">
        {icon}
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
      {children && <div className="actions">{children}</div>}
    </div>
  );
}
export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="error-state" role="alert">
      <AlertTriangle aria-hidden="true" />
      <h2>작업을 완료하지 못했습니다</h2>
      <p>{message}</p>
      {retry && <Button onClick={retry}>다시 시도</Button>}
    </div>
  );
}
export function Spinner({ label = '데이터를 불러오고 있습니다' }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" aria-hidden="true" />
      {label}
    </div>
  );
}
export function Skeleton() {
  return (
    <div className="skeleton-list" role="status" aria-label="문제 목록을 불러오고 있습니다">
      {[1, 2, 3, 4, 5, 6].map((n) => (
        <div className="skeleton" key={n} />
      ))}
    </div>
  );
}
export function Toast({ message, undo, close }: { message: string; undo?: () => void; close: () => void }) {
  useEffect(() => {
    const timer = setTimeout(close, 5000);
    return () => clearTimeout(timer);
  }, [close]);
  return (
    <div className="toast" role="status">
      {message}
      {undo && <Button onClick={undo}>실행 취소</Button>}
      <Button aria-label="알림 닫기" onClick={close}>
        닫기
      </Button>
    </div>
  );
}
export function Dialog({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const items = ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input, select, [tabindex="0"]',
        );
        if (!items?.length) return;
        if (event.shiftKey && document.activeElement === items[0]) {
          event.preventDefault();
          items[items.length - 1]?.focus();
        } else if (!event.shiftKey && document.activeElement === items[items.length - 1]) {
          event.preventDefault();
          items[0]?.focus();
        }
      }}
    >
      <h2 id={id}>{title}</h2>
      {children}
      <Button onClick={close}>닫기</Button>
    </dialog>
  );
}
export function Tabs<T extends string>({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={value === item.id}
          tabIndex={value === item.id ? 0 : -1}
          onClick={() => onChange(item.id)}
          onKeyDown={(event) => {
            const next =
              event.key === 'ArrowRight'
                ? (index + 1) % items.length
                : event.key === 'ArrowLeft'
                  ? (index + items.length - 1) % items.length
                  : event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? items.length - 1
                      : -1;
            if (next >= 0) {
              event.preventDefault();
              onChange(items[next]!.id);
              (event.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
            }
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
