import { redirect } from 'next/navigation';

export default async function CustomerTrackingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/customer/tracking?shipmentId=${encodeURIComponent(id)}`);
}
