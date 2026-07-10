export default function LoadingState({ label = "Loading..." }) {
  return (
    <div className="rounded-3xl border border-[#ead9d2] bg-white/75 p-8 text-center text-[#735f58]">
      {label}
    </div>
  );
}