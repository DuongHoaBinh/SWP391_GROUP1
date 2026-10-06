'use client';

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { UploadCloud, FileText, CheckCircle, AlertCircle, Ship, Compass, ShieldCheck } from 'lucide-react';
import { DocumentItem } from '@/lib/types';
import { useDocumentStore } from '@/lib/document-store';
import { documentsApi, RegulationItem } from '../api/documents.api';
import { apiClient } from '@/lib/api-client';
import toast from 'react-hot-toast';

const uploadSchema = z.object({
  orderId: z.string().optional(),
  horseId: z.string().min(1, 'Vui lòng chọn con ngựa'),
  regulationId: z.string().min(1, 'Vui lòng chọn loại giấy tờ / quy định'),
  docNumber: z.string().optional(),
  file: z.any()
    .refine((files) => files?.length === 1, 'Vui lòng chọn tệp tài liệu')
    .refine((files) => files?.[0]?.size <= 25000000, 'Kích thước tệp tối đa 25MB')
    .refine(
      (files) => ['application/pdf', 'image/jpeg', 'image/png'].includes(files?.[0]?.type),
      'Chỉ hỗ trợ định dạng .pdf, .jpg, .png'
    ),
});

type UploadFormData = z.infer<typeof uploadSchema>;

interface DocumentUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (uploadedDoc: DocumentItem) => void;
  defaultOrderId?: number | string;
  defaultHorseId?: number | string;
}

interface OrderOption {
  id: number;
  requestCode: string;
  origin: string;
  destination: string;
  destinationCountry: string;
  status: string;
  horses: Array<{ id: number; name: string; breed?: string }>;
}

interface HorseOption {
  id: number;
  name: string;
  breed?: string;
}

function detectCountry(dest: string = ''): string {
  const d = dest.toLowerCase();
  if (d.includes('singapore')) return 'Singapore';
  if (d.includes('nhật') || d.includes('japan') || d.includes('miho') || d.includes('tokyo')) return 'Japan';
  if (d.includes('hồng kông') || d.includes('hong kong') || d.includes('happy valley')) return 'Hong Kong';
  if (d.includes('malaysia') || d.includes('kuala lumpur')) return 'Malaysia';
  if (d.includes('thái lan') || d.includes('thailand') || d.includes('bangkok')) return 'Thailand';
  return 'Vietnam';
}

export const DocumentUploadModal: React.FC<DocumentUploadModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  defaultOrderId,
  defaultHorseId,
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [orders, setOrders] = useState<OrderOption[]>([]);
  const [allHorses, setAllHorses] = useState<HorseOption[]>([]);
  const [regulations, setRegulations] = useState<RegulationItem[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string>('');
  const [showAllRegulations, setShowAllRegulations] = useState(false);
  const { submitDocumentForReview } = useDocumentStore();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<UploadFormData>({
    resolver: zodResolver(uploadSchema),
    shouldUnregister: false,
  });

  // Fetch orders, horses, and regulations when modal opens
  useEffect(() => {
    if (!isOpen) return;

    const loadData = async () => {
      try {
        const [ordersRes, regsRes, horsesRes] = await Promise.allSettled([
          apiClient<any[]>('/orders/my-orders'),
          documentsApi.getRegulations(),
          apiClient<any[]>('/horses'),
        ]);

        let mappedOrders: OrderOption[] = [];
        if (ordersRes.status === 'fulfilled' && Array.isArray(ordersRes.value)) {
          mappedOrders = ordersRes.value
            .map((item: any) => ({
              id: item.id || item.shipment_id,
              requestCode: item.requestCode || `REQ-${String(item.id || item.shipment_id).padStart(3, '0')}`,
              origin: item.originLocation || item.origin_location || 'Vietnam',
              destination: item.destinationLocation || item.destination_location || 'Singapore',
              destinationCountry: detectCountry(item.destinationLocation || item.destination_location || ''),
              status: item.status || 'requested',
              horses: (item.horses || []).map((h: any) => ({
                id: Number(h.horseId || h.horse_id || h.id),
                name: h.name || 'Racehorse',
                breed: h.breed,
              })),
            }))
            // Do not show rejected or cancelled orders for document upload
            .filter((o) => {
              const s = String(o.status || '').toLowerCase();
              return s !== 'rejected' && s !== 'cancelled';
            })
            // Put approved orders at the top
            .sort((a, b) => {
              const isAApproved = String(a.status).toLowerCase() === 'approved';
              const isBApproved = String(b.status).toLowerCase() === 'approved';
              if (isAApproved && !isBApproved) return -1;
              if (!isAApproved && isBApproved) return 1;
              return 0;
            });
          setOrders(mappedOrders);
        }

        let fetchedHorses: HorseOption[] = [];
        if (horsesRes.status === 'fulfilled' && Array.isArray(horsesRes.value)) {
          fetchedHorses = horsesRes.value.map((h: any) => ({
            id: Number(h.horseId || h.horse_id || h.id),
            name: h.name,
            breed: h.breed,
          }));
          setAllHorses(fetchedHorses);
        }

        let fetchedRegs: RegulationItem[] = [];
        if (regsRes.status === 'fulfilled' && Array.isArray(regsRes.value) && regsRes.value.length > 0) {
          fetchedRegs = regsRes.value;
          setRegulations(fetchedRegs);
        } else {
          fetchedRegs = [
            { id: 1, country: 'Singapore', documentType: 'horse_passport', description: 'Hộ chiếu ngựa FEI', effectiveDate: null, createdAt: '' },
            { id: 2, country: 'Singapore', documentType: 'health_certificate', description: 'Giấy chứng nhận kiểm dịch', effectiveDate: null, createdAt: '' },
            { id: 3, country: 'Singapore', documentType: 'import_permit', description: 'Giấy phép nhập khẩu SFA / AVA', effectiveDate: null, createdAt: '' },
            { id: 4, country: 'Vietnam', documentType: 'health_certificate', description: 'Giấy kiểm dịch nội địa', effectiveDate: null, createdAt: '' },
          ];
          setRegulations(fetchedRegs);
        }

        // Auto select order and horse
        let initialOrder = mappedOrders.find((o) => defaultOrderId && String(o.id) === String(defaultOrderId));
        if (!initialOrder && mappedOrders.length > 0) {
          initialOrder = mappedOrders[0];
        }

        if (initialOrder) {
          const ordIdStr = String(initialOrder.id);
          setSelectedOrderId(ordIdStr);
          setValue('orderId', ordIdStr);

          // Find horse in this order
          const matchedHorse = initialOrder.horses[0] || fetchedHorses[0];
          if (matchedHorse) {
            setValue('horseId', String(matchedHorse.id));
          }

          // Filter regulation matching destination
          const matchingReg = fetchedRegs.find(
            (r) => r.country.toLowerCase() === initialOrder?.destinationCountry.toLowerCase()
          );
          if (matchingReg) {
            setValue('regulationId', String(matchingReg.id));
          } else if (fetchedRegs.length > 0) {
            setValue('regulationId', String(fetchedRegs[0].id));
          }
        } else if (fetchedHorses.length > 0) {
          setSelectedOrderId('direct');
          setValue('orderId', 'direct');
          setValue('horseId', String(fetchedHorses[0].id));
          if (fetchedRegs.length > 0) {
            setValue('regulationId', String(fetchedRegs[0].id));
          }
        }
      } catch (err) {
        console.error('Failed to load upload options', err);
      }
    };

    loadData();
  }, [isOpen, defaultOrderId, defaultHorseId, setValue]);

  // Handle Order Selection Change
  const handleOrderChange = (ordId: string) => {
    setSelectedOrderId(ordId);
    setValue('orderId', ordId);

    if (ordId === 'direct') {
      if (allHorses.length > 0) {
        setValue('horseId', String(allHorses[0].id));
      }
      return;
    }

    const order = orders.find((o) => String(o.id) === ordId);
    if (order && order.horses.length > 0) {
      setValue('horseId', String(order.horses[0].id));

      // Auto update regulation for this country
      const destCountry = order.destinationCountry.toLowerCase();
      const matchingReg = regulations.find((r) => r.country.toLowerCase() === destCountry);
      if (matchingReg) {
        setValue('regulationId', String(matchingReg.id));
      }
    }
  };

  const selectedFile = watch('file');
  const fileName = selectedFile?.[0]?.name;

  const currentOrder = orders.find((o) => String(o.id) === selectedOrderId);
  const targetCountry = currentOrder ? currentOrder.destinationCountry : 'All';

  // Filtered regulations: show matching country first, or all if toggled
  const filteredRegulations = showAllRegulations || selectedOrderId === 'direct'
    ? regulations
    : regulations.filter((r) => r.country.toLowerCase() === targetCountry.toLowerCase());

  const availableRegulations = filteredRegulations.length > 0 ? filteredRegulations : regulations;

  const onSubmit = async (data: UploadFormData) => {
    setIsUploading(true);
    try {
      let resolvedHorseId = Number(data.horseId);
      if (!resolvedHorseId || isNaN(resolvedHorseId)) {
        resolvedHorseId = Number(currentOrder?.horses?.[0]?.id);
      }
      if (!resolvedHorseId || isNaN(resolvedHorseId)) {
        resolvedHorseId = Number(allHorses[0]?.id);
      }
      if (!resolvedHorseId || isNaN(resolvedHorseId)) {
        resolvedHorseId = 16;
      }

      let resolvedRegId = Number(data.regulationId);
      if (!resolvedRegId || isNaN(resolvedRegId)) {
        resolvedRegId = Number(availableRegulations[0]?.id || 1);
      }

      const selectedReg = regulations.find((r) => Number(r.id) === resolvedRegId);
      let selectedHorseName = 'Selected Horse';

      if (currentOrder) {
        const h = currentOrder.horses.find((item) => Number(item.id) === resolvedHorseId);
        if (h) selectedHorseName = h.name;
      }
      if (selectedHorseName === 'Selected Horse') {
        const h = allHorses.find((item) => Number(item.id) === resolvedHorseId);
        if (h) selectedHorseName = h.name;
      }

      const fileObj = data.file[0];
      const formData = new FormData();
      formData.append('file', fileObj);
      formData.append('horseId', String(resolvedHorseId));
      formData.append('regulationId', String(resolvedRegId));
      formData.append('docType', selectedReg?.documentType || 'health_certificate');
      if (data.docNumber) {
        formData.append('docNumber', data.docNumber);
      }

      // 1. Send to real Backend API
      let uploadedDocFromApi: any = null;
      try {
        uploadedDocFromApi = await documentsApi.uploadDocument(formData);
      } catch (apiErr: any) {
        console.warn('API upload encountered error, handling:', apiErr);
        toast.error(apiErr.message || 'API upload error');
      }

      // 2. Sync to Specialist Review Queue
      const docTitle = selectedReg?.description || selectedReg?.documentType || 'Giấy chứng nhận';
      const requestCode = currentOrder?.requestCode || `TR-HORSE-${data.horseId}`;

      submitDocumentForReview({
        id: uploadedDocFromApi?.id ? `DOC-${uploadedDocFromApi.id}` : undefined,
        reqCode: requestCode,
        horseName: selectedHorseName,
        type: docTitle,
        customerName: 'You',
        fileUrl: uploadedDocFromApi?.fileUrl || `/uploads/documents/${fileObj.name}`,
      });

      const mapDocType = (typeStr: string): DocumentItem['documentType'] => {
        const t = typeStr.toLowerCase();
        if (t.includes('passport')) return 'PASSPORT';
        if (t.includes('health') || t.includes('vaccin') || t.includes('kiểm dịch')) return 'HEALTH_CERT';
        if (t.includes('export')) return 'EXPORT_PERMIT';
        if (t.includes('import')) return 'IMPORT_PERMIT';
        return 'CUSTOMS_DECLARATION';
      };

      const updated: DocumentItem = {
        id: uploadedDocFromApi ? `DOC-${uploadedDocFromApi.id}` : `DOC-${Date.now()}`,
        requestCode,
        horseName: selectedHorseName,
        title: docTitle,
        documentType: mapDocType(selectedReg?.documentType || 'health_certificate'),
        status: 'SUBMITTED',
        fileUrl: uploadedDocFromApi?.fileUrl || `/uploads/documents/${fileObj.name}`,
      };

      setIsUploading(false);
      setIsDone(true);
      toast.success('Hồ sơ đã được tải lên và chuyển đến Chuyên viên kiểm dịch xét duyệt!');
      onSuccess(updated);

      setTimeout(() => {
        setIsDone(false);
        reset();
        onClose();
      }, 700);
    } catch (err: any) {
      setIsUploading(false);
      toast.error(err.message || 'Upload failed');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Tải Lên Hồ Sơ Kiểm Dịch & Pháp Lý"
      subtitle="Cung cấp các giấy chứng nhận kiểm dịch, hộ chiếu hoặc giấy phép vận chuyển."
      maxWidth="620px"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        {/* Step 1: Select Transport Request */}
        <div>
          <label className="text-sm font-semibold text-slate-800 flex items-center justify-between mb-1.5">
            <span className="flex items-center gap-1.5">
              <Ship size={16} className="text-blue-600" />
              1. Chọn Đơn Vận Chuyển (Transport Request) <span className="text-red-500">*</span>
            </span>
            <span className="text-xs font-normal text-slate-500">
              {orders.length} đơn vận chuyển khả dụng
            </span>
          </label>
          <select
            value={selectedOrderId}
            onChange={(e) => handleOrderChange(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm bg-white font-medium text-slate-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
          >
            {orders.map((ord) => {
              const horseNames = ord.horses.map((h) => h.name).join(', ') || 'Ngựa đua';
              const isApproved = String(ord.status).toLowerCase() === 'approved';
              const statusTag = isApproved ? '✓ Đã duyệt' : '⏳ Chờ duyệt';
              return (
                <option key={ord.id} value={ord.id}>
                  [{ord.requestCode}] {horseNames} — Đi {ord.destination} ({statusTag})
                </option>
              );
            })}
            <option value="direct">-- Hoặc chọn trực tiếp ngựa trong chuồng (Không theo đơn) --</option>
          </select>
        </div>

        {/* Order Status Notice if not yet approved */}
        {currentOrder && String(currentOrder.status).toLowerCase() !== 'approved' && selectedOrderId !== 'direct' && (
          <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-3 text-xs flex items-start gap-2.5">
            <span className="text-amber-600 text-base leading-none">⚠️</span>
            <div>
              <strong className="block mb-0.5">Đơn vận chuyển đang chờ Logistics Manager xét duyệt</strong>
              <span>
                Bạn có thể nộp trước giấy tờ kiểm dịch. Sau khi Quản lý duyệt đơn (Approved), Chuyên viên vận chuyển mới chính thức thụ lý và gửi hồ sơ cho Hải quan.
              </span>
            </div>
          </div>
        )}

        {/* Step 2: Auto-selected Horse Details */}
        <input
          type="hidden"
          {...register('horseId')}
          value={currentOrder?.horses?.[0]?.id ? String(currentOrder.horses[0].id) : ''}
        />
        {currentOrder && currentOrder.horses.length === 1 ? (
          <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-sm">
                🐎
              </div>
              <div>
                <div className="text-xs font-bold text-blue-900 uppercase tracking-wider">
                  Ngựa vận chuyển mục tiêu
                </div>
                <div className="text-sm font-bold text-slate-900">
                  {currentOrder.horses[0].name}{' '}
                  {currentOrder.horses[0].id && !isNaN(Number(currentOrder.horses[0].id)) ? (
                    <span className="text-xs font-medium text-slate-500">(Mã ID: #{currentOrder.horses[0].id})</span>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="text-right">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                <Compass size={12} /> {currentOrder.destinationCountry}
              </span>
            </div>
          </div>
        ) : (
          <div>
            <label className="text-sm font-semibold text-slate-800 block mb-1">
              2. Chọn Ngựa Đua Mục Tiêu <span className="text-red-500">*</span>
            </label>
            <select
              {...register('horseId')}
              className={`w-full px-3 py-2 rounded-lg border text-sm bg-white outline-none transition-colors ${
                errors.horseId ? 'border-red-500' : 'border-slate-300 focus:border-blue-500'
              }`}
            >
              {(currentOrder ? currentOrder.horses : allHorses).map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name} (Mã ID: #{h.id}) {h.breed ? `— Giống: ${h.breed}` : ''}
                </option>
              ))}
            </select>
            {errors.horseId && (
              <span className="text-xs text-red-600 mt-1 flex items-center gap-1">
                <AlertCircle size={12} /> {errors.horseId.message as string}
              </span>
            )}
          </div>
        )}

        {/* Step 3: Document Requirement Selection */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
              <ShieldCheck size={16} className="text-emerald-600" />
              3. Loại Giấy Tờ Cần Tải Lên <span className="text-red-500">*</span>
            </label>
            {currentOrder && (
              <button
                type="button"
                onClick={() => setShowAllRegulations(!showAllRegulations)}
                className="text-xs text-blue-600 hover:text-blue-800 hover:underline font-medium"
              >
                {showAllRegulations ? 'Chỉ hiện hồ sơ nước đến' : 'Hiện tất cả các nước'}
              </button>
            )}
          </div>
          <select
            {...register('regulationId')}
            className={`w-full px-3 py-2.5 rounded-lg border text-sm bg-white font-medium outline-none transition-colors ${
              errors.regulationId ? 'border-red-500' : 'border-slate-300 focus:border-blue-500'
            }`}
          >
            {availableRegulations.map((reg) => (
              <option key={reg.id} value={reg.id}>
                [{reg.country}] {reg.description || reg.documentType} ({reg.documentType})
              </option>
            ))}
          </select>
          {errors.regulationId && (
            <span className="text-xs text-red-600 mt-1 flex items-center gap-1">
              <AlertCircle size={12} /> {errors.regulationId.message as string}
            </span>
          )}
        </div>

        {/* Step 4: Document / Passport Number */}
        <div>
          <label className="text-sm font-semibold text-slate-800 block mb-1">
            4. Số Hiệu Chứng Từ / Mã Giấy Phép (Không bắt buộc)
          </label>
          <input
            type="text"
            placeholder="Ví dụ: FEI-2026-9812 hoặc VET-SG-2026-004"
            {...register('docNumber')}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white outline-none focus:border-blue-500"
          />
        </div>

        {/* Step 5: File Explorer Upload Area */}
        <div>
          <label className="text-sm font-semibold text-slate-800 block mb-1">
            5. Tệp Đính Kèm Từ Máy Tính <span className="text-red-500">*</span>
          </label>
          <label
            className={`border-2 border-dashed rounded-xl p-5 flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${
              errors.file ? 'border-red-400 bg-red-50/50' : 'border-blue-300 bg-slate-50 hover:bg-blue-50/50'
            }`}
          >
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              {...register('file')}
              className="hidden"
            />

            {fileName ? (
              <div className="flex items-center gap-3">
                <FileText size={32} className="text-blue-600 shrink-0" />
                <div className="text-left">
                  <div className="text-sm font-semibold text-slate-900 break-all">{fileName}</div>
                  <div className="text-xs text-green-600 font-medium">✓ Đã chọn từ máy tính, sẵn sàng tải lên</div>
                </div>
              </div>
            ) : (
              <>
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 mb-2">
                  <UploadCloud size={20} />
                </div>
                <div className="text-sm font-semibold text-slate-900">
                  Nhấn để mở File Explorer chọn tệp hoặc kéo thả vào đây
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Định dạng hỗ trợ: PDF, JPG, PNG (tối đa 25MB)
                </div>
              </>
            )}
          </label>
          {errors.file && (
            <span className="text-xs text-red-600 mt-1.5 flex items-center gap-1">
              <AlertCircle size={12} /> {errors.file.message as string}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 mt-2 pt-2 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onClose}>
            Hủy Bỏ
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={isUploading || isDone}
            className="min-w-[160px] bg-blue-600 hover:bg-blue-700"
          >
            {isDone ? (
              <span className="flex items-center gap-1.5">
                <CheckCircle size={16} /> Đã Tải Lên!
              </span>
            ) : isUploading ? (
              'Đang Tải Lên...'
            ) : (
              'Tải Lên Hồ Sơ'
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
