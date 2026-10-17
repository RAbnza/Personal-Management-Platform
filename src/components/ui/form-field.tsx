import { cloneElement, isValidElement, type ReactNode } from "react";

export interface FormFieldProps {
  label: string;
  htmlFor: string;
  children: ReactNode;
  description?: string | undefined;
  descriptionId?: string | undefined;
  error?: string | undefined;
  errorId?: string | undefined;
  required?: boolean;
}

export function FormField({
  label,
  htmlFor,
  children,
  description,
  descriptionId,
  error,
  errorId,
  required,
}: FormFieldProps) {
  const hintId = descriptionId ?? `${htmlFor}-description`;
  const invalidId = errorId ?? `${htmlFor}-error`;
  // Associate a direct control while preserving existing caller-supplied IDs.
  // Compound fields keep explicit associations in their domain adapter.
  const control =
    isValidElement<{
      id?: string;
      "aria-describedby"?: string | undefined;
      "aria-invalid"?: boolean | "true" | "false" | undefined;
      required?: boolean;
    }>(children) && children.props.id === htmlFor
      ? cloneElement(children, {
          "aria-describedby":
            [
              ...new Set(
                [
                  children.props["aria-describedby"],
                  description ? hintId : undefined,
                  error ? invalidId : undefined,
                ]
                  .filter(Boolean)
                  .flatMap((id) => id!.split(" ")),
              ),
            ].join(" ") || undefined,
          "aria-invalid": error ? true : children.props["aria-invalid"],
          ...(required ? { required: true } : {}),
        })
      : children;
  return (
    <div className="min-w-0">
      <label
        htmlFor={htmlFor}
        className="block text-sm font-medium text-foreground"
      >
        {`${label}${required ? " (required)" : ""}`}
      </label>

      <div className="mt-2">{control}</div>

      {description ? (
        <p id={hintId} className="mt-2 text-sm leading-5 text-muted-foreground">
          {description}
        </p>
      ) : null}

      {error ? (
        <p
          id={invalidId}
          role="alert"
          className="mt-2 text-sm leading-5 text-danger"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
