// Minimal shadcn-style primitives. Tailwind-only, no runtime deps beyond cn().
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "ghost" | "destructive";
  size?: "default" | "sm";
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors",
        "disabled:pointer-events-none disabled:opacity-50",
        size === "default" ? "h-9 px-4 text-sm" : "h-8 px-3 text-xs",
        variant === "default" &&
          "bg-indigo-600 text-white hover:bg-indigo-700",
        variant === "outline" &&
          "border border-neutral-300 bg-white hover:bg-neutral-100",
        variant === "ghost" && "hover:bg-neutral-100",
        variant === "destructive" && "bg-red-600 text-white hover:bg-red-500",
        className
      )}
      {...props}
    />
  );
}

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm shadow-sm transition-colors",
        "hover:border-neutral-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/25",
        className
      )}
      {...props}
    />
  );
}

export function Select({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "select-chevron h-9 cursor-pointer appearance-none rounded-lg border border-neutral-300 bg-white pl-3 pr-8 text-sm shadow-sm transition-colors",
        "hover:border-neutral-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/25",
        className
      )}
      {...props}
    />
  );
}

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-lg border border-neutral-200 bg-white p-4 shadow-sm",
        className
      )}
      {...props}
    />
  );
}

export function Badge({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        className
      )}
      {...props}
    />
  );
}
