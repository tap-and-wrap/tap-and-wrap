export default function ErrorState({
  title = "Something went wrong",
  message = "Please try again."
}) {
  return (
    <div className="rounded-3xl border border-red-200 bg-red-50 p-8 text-center">
      <h3 className="font-semibold text-red-800">{title}</h3>
      <p className="mt-2 text-sm text-red-700">{message}</p>
    </div>
  );
}