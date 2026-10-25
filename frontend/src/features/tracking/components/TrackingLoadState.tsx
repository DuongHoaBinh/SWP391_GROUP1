'use client';

export function TrackingLoadState({ loading, error, retry }: { loading: boolean; error?: Error; retry: () => unknown }) {
  if (error) return <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
    <p>Chưa đồng bộ được dữ liệu: {error.message}</p>
    <button type="button" onClick={retry} className="mt-2 rounded border border-red-300 px-3 py-2 font-semibold">Thử lại</button>
  </div>;
  if (loading) return <p role="status" className="rounded-xl border bg-white p-6 text-sm text-slate-600">Đang tải hành trình…</p>;
  return null;
}
