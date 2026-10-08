import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "green" | "white" | "ghost" | "ghost-sm";

const variantClass: Record<Variant, string> = {
  primary: "btn-primary",
  green: "btn-green",
  white: "btn-white",
  ghost: "btn-ghost",
  "ghost-sm": "btn-ghost-sm",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`${variantClass[variant]} ${className}`}
    />
  );
}
