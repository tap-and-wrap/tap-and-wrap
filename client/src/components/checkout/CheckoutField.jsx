export default function CheckoutField({
  label,
  error,
  required = false,
  children
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-semibold text-[#4b332b]">
        {label}

        {required ? (
          <span className="ml-1 text-red-600">*</span>
        ) : null}
      </span>

      {children}

      {error ? (
        <span className="text-sm text-red-700">
          {error}
        </span>
      ) : null}
    </label>
  );
}