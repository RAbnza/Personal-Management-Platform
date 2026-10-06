import type { ReactNode } from "react";

export interface FormFieldProps {
  label: string;
  htmlFor: string;
  children: ReactNode;
  description?: string | undefined;
  descriptionId?: string | undefined;
  error?: string | undefined;
  errorId?: string | undefined;
}

export function FormField({
  label,
  htmlFor,
  children,
  description,
  descriptionId,
  error,
  errorId,
}: FormFieldProps) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="block text-sm font-medium text-foreground"
      >
        {label}
      </label>

      <div className="mt-2">{children}</div>

      {description ? (
        <p
          id={descriptionId}
          className="mt-2 text-sm leading-5 text-muted-foreground"
        >
          {description}
        </p>
      ) : null}

      {error ? (
        <p
          id={errorId}
          role="alert"
          className="mt-2 text-sm leading-5 text-danger"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
