"use client";

export default function FamilyCollectionError({
  reset,
}: {
  reset: () => void;
}) {
  return (
    <section className="mx-auto w-full max-w-3xl space-y-4 p-4">
      <p role="alert" className="text-error">
        Không thể tải dữ liệu của cây gia phả. Vui lòng kiểm tra kết nối.
      </p>
      <button className="btn" onClick={reset}>
        Thử lại
      </button>
    </section>
  );
}
