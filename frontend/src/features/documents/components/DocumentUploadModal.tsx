'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import {
  UploadCloud,
  FileText,
  CheckCircle,
  AlertCircle,
  Ship,
  Compass,
  ShieldCheck,
  X,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import { DocumentItem } from '@/lib/types';
import { useOptionalDocumentStore } from '@/lib/document-store';
import { documentsApi, RegulationItem } from '../api/documents.api';
import { apiClient } from '@/lib/api-client';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import toast from 'react-hot-toast';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'];

function buildUploadSchema(language: 'en' | 'vi') {
  const isEn = language === 'en';
  return z.object({
    orderId: z.string().optional(),
    horseId: z.string().min(1, isEn ? 'Please select a horse' : 'Vui lòng chọn con ngựa'),
    regulationId: z
      .string()
      .min(1, isEn ? 'Please select a document type / regulation' : 'Vui lòng chọn loại giấy tờ / quy định'),
    docNumber: z.string().optional(),
    file: z
      .any()
      .refine((files) => files?.length === 1, isEn ? 'Please choose a document file' : 'Vui lòng chọn tệp tài liệu')
      .refine(
        (files) => files?.[0]?.size <= MAX_FILE_SIZE,
        isEn ? 'Maximum file size is 10MB' : 'Kích thước tệp tối đa 10MB'
      )
      .refine(
        (files) => {
          const file = files?.[0];
          if (!file) return false;
          const mime = file.type?.toLowerCase() || '';
          const name = file.name?.toLowerCase() || '';
          return ALLOWED_MIME_TYPES.includes(mime) || ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext));
        },
        isEn ? 'Only .pdf, .jpg, .jpeg, .png formats are supported' : 'Chỉ hỗ trợ định dạng .pdf, .jpg, .jpeg, .png'
      ),
  });
}

type UploadFormData = z.infer<ReturnType<typeof buildUploadSchema>>;

interface DocumentUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (uploadedDoc: DocumentItem) => void;
  defaultOrderId?: number | string;
  defaultHorseId?: number | string;
  defaultRegulationId?: number | string;
  reuploadDocId?: number;
  reuploadTitle?: string;
  onSwitchToBatch?: () => void;
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
  if (d.includes('australia') || d.includes('úc') || d.includes('sydney') || d.includes('melbourne') || d.includes('brisbane')) return 'Australia';
  if (d.includes('singapore')) return 'Singapore';
  if (d.includes('nhật') || d.includes('japan') || d.includes('miho') || d.includes('tokyo') || d.includes('osaka')) return 'Japan';
  if (d.includes('hồng kông') || d.includes('hong kong') || d.includes('happy valley') || d.includes('sha tin')) return 'Hong Kong';
  if (d.includes('malaysia') || d.includes('kuala lumpur') || d.includes('penang')) return 'Malaysia';
  if (d.includes('thái lan') || d.includes('thailand') || d.includes('bangkok')) return 'Thailand';
  if (d.includes('uae') || d.includes('dubai') || d.includes('abu dhabi') || d.includes('emirates')) return 'United Arab Emirates';
  if (d.includes('qatar') || d.includes('doha')) return 'Qatar';
  if (d.includes('pháp') || d.includes('france') || d.includes('paris')) return 'France';
  if (d.includes('đức') || d.includes('germany') || d.includes('berlin')) return 'Germany';
  if (d.includes('anh') || d.includes('united kingdom') || d.includes('uk') || d.includes('london')) return 'United Kingdom';
  if (d.includes('mỹ') || d.includes('hoa kỳ') || d.includes('usa') || d.includes('united states')) return 'United States';
  if (d.includes('hàn quốc') || d.includes('korea') || d.includes('seoul')) return 'South Korea';
  if (d.includes('campuchia') || d.includes('cambodia')) return 'Cambodia';
  if (d.includes('lào') || d.includes('laos')) return 'Laos';
  if (d.includes('indonesia') || d.includes('jakarta')) return 'Indonesia';
  if (d.includes('philippines') || d.includes('manila')) return 'Philippines';
  if (d.includes('việt nam') || d.includes('vietnam') || d.includes('hà nội') || d.includes('hồ chí minh') || d.includes('saigon')) return 'Vietnam';
  return dest.trim() || 'Global Baseline';
}

export const DocumentUploadModal: React.FC<DocumentUploadModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  defaultOrderId,
  defaultHorseId,
  defaultRegulationId,
  reuploadDocId,
  reuploadTitle,
  onSwitchToBatch,
}) => {
  const { t, language, translateDocType, translateCountry } = useLanguage();
  const [isUploading, setIsUploading] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderOption[]>([]);
  const [allHorses, setAllHorses] = useState<HorseOption[]>([]);
  const [regulations, setRegulations] = useState<RegulationItem[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string>('');
  const [showAllRegulations, setShowAllRegulations] = useState(false);

  const docStore = useOptionalDocumentStore();
  const submitDocumentForReview = docStore?.submitDocumentForReview;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const langRef = useRef(language);
  langRef.current = language;

  const uploadSchema = useMemo(() => buildUploadSchema(language), [language]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

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

  const { ref: registerFileRef, ...fileInputProps } = register('file');

  const fetchModalOptions = useCallback(async () => {
    const lang = langRef.current;
    setIsLoadingOptions(true);
    setOptionsError(null);
    try {
      const [ordersRes, regsRes, horsesRes] = await Promise.allSettled([
        apiClient<any[]>('/orders/my-orders'),
        documentsApi.getRegulations(),
        apiClient<any[]>('/horses'),
      ]);

      const anyFailed =
        ordersRes.status === 'rejected' &&
        regsRes.status === 'rejected' &&
        horsesRes.status === 'rejected';

      if (anyFailed) {
        setOptionsError(
          lang === 'en'
            ? 'Unable to load shipments, horses, and regulations. Please retry.'
            : 'Không thể tải danh sách đơn hàng, ngựa đua và quy chuẩn kiểm dịch. Vui lòng thử lại.'
        );
        return;
      }

      if (ordersRes.status === 'rejected' && !defaultOrderId) {
        setOptionsError(
          ordersRes.reason?.message ||
            (lang === 'en'
              ? 'Could not load transport orders. Showing direct stable horses if available.'
              : 'Không thể tải danh sách đơn vận chuyển. Bạn vẫn có thể thử lại hoặc chọn trực tiếp ngựa.')
        );
      }

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
          .filter((o) => {
            const s = String(o.status || '').toLowerCase();
            return s !== 'rejected' && s !== 'cancelled';
          })
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

      let initialOrder = mappedOrders.find((o) => defaultOrderId && String(o.id) === String(defaultOrderId));
      if (!initialOrder && mappedOrders.length > 0) {
        initialOrder = mappedOrders[0];
      }

      if (initialOrder) {
        const ordIdStr = String(initialOrder.id);
        setSelectedOrderId(ordIdStr);
        setValue('orderId', ordIdStr);

        if (defaultHorseId) {
          setValue('horseId', String(defaultHorseId));
        } else {
          const matchedHorse = initialOrder.horses[0] || fetchedHorses[0];
          if (matchedHorse) {
            setValue('horseId', String(matchedHorse.id));
          }
        }

        if (defaultRegulationId) {
          setValue('regulationId', String(defaultRegulationId));
        } else {
          const matchingReg =
            fetchedRegs.find(
              (r) => r.country.toLowerCase() === initialOrder?.destinationCountry.toLowerCase()
            ) ||
            fetchedRegs.find((r) => r.country.toLowerCase() === 'global baseline');
          if (matchingReg) {
            setValue('regulationId', String(matchingReg.id));
          } else if (fetchedRegs.length > 0) {
            setValue('regulationId', String(fetchedRegs[0].id));
          }
        }
      } else if (fetchedHorses.length > 0) {
        setSelectedOrderId('direct');
        setValue('orderId', 'direct');
        setValue('horseId', defaultHorseId ? String(defaultHorseId) : String(fetchedHorses[0].id));
        if (defaultRegulationId) {
          setValue('regulationId', String(defaultRegulationId));
        } else if (fetchedRegs.length > 0) {
          setValue('regulationId', String(fetchedRegs[0].id));
        }
      } else if (defaultHorseId) {
        setValue('horseId', String(defaultHorseId));
        if (defaultRegulationId) {
          setValue('regulationId', String(defaultRegulationId));
        }
      }
    } catch (err: any) {
      console.error('Failed to load upload options', err);
      setOptionsError(
        err?.message ||
          (lang === 'en' ? 'Unable to load form options.' : 'Không thể tải dữ liệu biểu mẫu.')
      );
    } finally {
      setIsLoadingOptions(false);
    }
  }, [defaultOrderId, defaultHorseId, defaultRegulationId, setValue]);

  useEffect(() => {
    if (!isOpen) {
      reset({ docNumber: '', file: undefined });
      setIsDone(false);
      setIsDragging(false);
      setShowAllRegulations(false);
      setOptionsError(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    void fetchModalOptions();
  }, [isOpen, fetchModalOptions, reset]);

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

      const destCountry = order.destinationCountry.toLowerCase();
      const matchingReg =
        regulations.find((r) => r.country.toLowerCase() === destCountry) ||
        regulations.find((r) => r.country.toLowerCase() === 'global baseline');
      if (matchingReg) {
        setValue('regulationId', String(matchingReg.id));
      }
    }
  };

  const selectedFile = watch('file');
  const fileName = selectedFile?.[0]?.name;

  const handleDropFiles = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (isUploading) return;
    const dropped = e.dataTransfer?.files;
    if (dropped && dropped.length > 0) {
      const dt = new DataTransfer();
      dt.items.add(dropped[0]);
      setValue('file', dt.files, { shouldValidate: true, shouldDirty: true });
      if (fileInputRef.current) {
        fileInputRef.current.files = dt.files;
      }
    }
  };

  const handleRemoveFile = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isUploading) return;
    setValue('file', undefined as any, { shouldValidate: true });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const currentOrder = orders.find((o) => String(o.id) === selectedOrderId);
  const targetCountry = currentOrder ? currentOrder.destinationCountry : 'All';

  const countryRegulations = regulations.filter((r) => r.country.toLowerCase() === targetCountry.toLowerCase());
  const baselineRegulations = regulations.filter((r) => r.country.toLowerCase() === 'global baseline');

  const rawRegulations =
    showAllRegulations || selectedOrderId === 'direct'
      ? regulations
      : countryRegulations.length > 0
      ? countryRegulations
      : baselineRegulations.length > 0
      ? baselineRegulations
      : regulations;

  const availableRegulations = [...rawRegulations];
  if (defaultRegulationId) {
    const targetReg = regulations.find((r) => String(r.id) === String(defaultRegulationId));
    if (targetReg && !availableRegulations.some((r) => String(r.id) === String(defaultRegulationId))) {
      availableRegulations.unshift(targetReg);
    }
  }

  const selectedHorseId = watch('horseId') || defaultHorseId;
  const selectedHorse =
    currentOrder?.horses?.find((h) => String(h.id) === String(selectedHorseId)) ||
    allHorses.find((h) => String(h.id) === String(selectedHorseId));
  const selectedHorseNameDisplay = selectedHorse?.name || (language === 'en' ? 'Selected Horse' : 'Ngựa được chọn');

  const selectedRegulationId = watch('regulationId') || defaultRegulationId;
  const currentRegulation = regulations.find((r) => String(r.id) === String(selectedRegulationId));

  // Keep form steps implicit without noisy numbered prefixes
  const showHorseSelector = !defaultOrderId && !(currentOrder && currentOrder.horses.length === 1);

  const onSubmit = async (data: UploadFormData) => {
    if (isUploading) return;
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
        toast.error(
          language === 'en'
            ? 'Please select a horse before uploading.'
            : 'Vui lòng chọn thông tin ngựa trước khi tải lên tài liệu.'
        );
        setIsUploading(false);
        return;
      }

      let resolvedRegId = Number(data.regulationId);
      if (!resolvedRegId || isNaN(resolvedRegId)) {
        resolvedRegId = Number(availableRegulations[0]?.id || 1);
      }

      const selectedReg = regulations.find((r) => Number(r.id) === resolvedRegId);
      let resolvedHorseName = 'Selected Horse';

      if (currentOrder) {
        const h = currentOrder.horses.find((item) => Number(item.id) === resolvedHorseId);
        if (h) resolvedHorseName = h.name;
      }
      if (resolvedHorseName === 'Selected Horse') {
        const h = allHorses.find((item) => Number(item.id) === resolvedHorseId);
        if (h) resolvedHorseName = h.name;
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

      let uploadedDocFromApi: any = null;
      try {
        if (reuploadDocId) {
          uploadedDocFromApi = await documentsApi.reuploadDocument(Number(reuploadDocId), formData);
        } else {
          uploadedDocFromApi = await documentsApi.uploadDocument(formData);
        }
      } catch (apiErr: any) {
        console.error('API upload error:', apiErr);
        toast.error(apiErr.message || (language === 'en' ? 'Document upload failed' : 'Tải lên tài liệu thất bại'));
        setIsUploading(false);
        return;
      }

      const docTitle = selectedReg?.description || selectedReg?.documentType || 'Giấy chứng nhận';
      const requestCode = currentOrder?.requestCode || `TR-HORSE-${data.horseId}`;

      submitDocumentForReview?.({
        id: uploadedDocFromApi?.id ? `DOC-${uploadedDocFromApi.id}` : undefined,
        reqCode: requestCode,
        horseName: resolvedHorseName,
        type: docTitle,
        customerName: 'You',
        fileUrl: uploadedDocFromApi?.fileUrl || `/uploads/documents/${fileObj.name}`,
      });

      const mapDocType = (typeStr: string): DocumentItem['documentType'] => {
        const typeLower = typeStr.toLowerCase();
        if (typeLower.includes('passport')) return 'PASSPORT';
        if (typeLower.includes('health') || typeLower.includes('vaccin') || typeLower.includes('kiểm dịch')) return 'HEALTH_CERT';
        if (typeLower.includes('export')) return 'EXPORT_PERMIT';
        if (typeLower.includes('import')) return 'IMPORT_PERMIT';
        return 'CUSTOMS_DECLARATION';
      };

      const updated: DocumentItem = {
        id: uploadedDocFromApi ? `DOC-${uploadedDocFromApi.id}` : `DOC-${Date.now()}`,
        requestCode,
        horseName: resolvedHorseName,
        title: docTitle,
        documentType: mapDocType(selectedReg?.documentType || 'health_certificate'),
        status: 'SUBMITTED',
        fileUrl: uploadedDocFromApi?.fileUrl || `/uploads/documents/${fileObj.name}`,
      };

      setIsUploading(false);
      setIsDone(true);
      toast.success(
        reuploadDocId
          ? language === 'en'
            ? 'Document updated! Awaiting Specialist re-review.'
            : 'Đã cập nhật lại hồ sơ thành công! Đang chờ chuyên viên duyệt lại.'
          : language === 'en'
          ? 'Document uploaded and queued for Specialist review!'
          : 'Hồ sơ đã được tải lên và chuyển đến Chuyên viên kiểm dịch xét duyệt!'
      );
      onSuccess(updated);

      timeoutRef.current = setTimeout(() => {
        setIsDone(false);
        reset();
        onClose();
      }, 700);
    } catch (err: any) {
      setIsUploading(false);
      toast.error(err.message || (language === 'en' ? 'Upload failed' : 'Tải lên thất bại'));
    }
  };

  const handleClose = () => {
    if (isUploading) return;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    reset({ docNumber: '', file: undefined });
    setIsDone(false);
    setIsDragging(false);
    setShowAllRegulations(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      closeDisabled={isUploading}
      title={
        reuploadDocId
          ? `${t('documents.reuploadTitle', 'Cập Nhật / Nộp Lại')}: ${translateDocType(reuploadTitle || 'Hồ Sơ')}`
          : t('documents.uploadTitle', 'Tải Lên Hồ Sơ Kiểm Dịch & Pháp Lý')
      }
      subtitle={
        reuploadDocId
          ? t('documents.reuploadSubtitle', 'Chọn tệp mới để cập nhật và gửi lại cho chuyên viên kiểm duyệt.')
          : t('documents.uploadSubtitle', 'Cung cấp các giấy chứng nhận kiểm dịch, hộ chiếu hoặc giấy phép vận chuyển.')
      }
      maxWidth="620px"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        {optionsError && (
          <div
            role="alert"
            className="bg-red-50 border border-red-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs text-red-800"
          >
            <div className="flex items-center gap-2 font-medium">
              <AlertCircle size={15} className="text-red-600 shrink-0" />
              <span>{optionsError}</span>
            </div>
            <button
              type="button"
              onClick={() => void fetchModalOptions()}
              className="px-2.5 py-1 rounded-lg bg-white border border-red-200 text-red-700 font-bold hover:bg-red-100 flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw size={12} /> {t('common.retry', language === 'en' ? 'Retry' : 'Thử lại')}
            </button>
          </div>
        )}

        {isLoadingOptions && (
          <div className="bg-[#FAF8F4] border border-[#D8CEBE] rounded-xl p-3 flex items-center gap-2 text-xs text-[#5F6977]">
            <Loader2 size={14} className="animate-spin text-[#A67C2E] shrink-0" />
            <span>
              {language === 'en'
                ? 'Loading shipments, horses, and quarantine requirements...'
                : 'Đang tải danh sách đơn hàng, ngựa đua và quy định kiểm dịch...'}
            </span>
          </div>
        )}

        {onSwitchToBatch && !reuploadDocId && (
          <div className="bg-[#FAF8F4] border border-[#D4C5A3] rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5 text-[#181A17] min-w-0 flex-1">
              <span className="text-base shrink-0">⚡</span>
              <div>
                <strong className="block text-[#181A17] font-bold">
                  {t('documents.batchBannerTitle', 'Nộp cùng lúc trọn bộ hồ sơ?')}
                </strong>
                <span className="text-[#5B6779]">
                  {t('documents.batchBannerDesc', 'Chuyến đi này có thể đính kèm và nộp tất cả chứng từ trong 1 lần duy nhất.')}
                </span>
              </div>
            </div>
            <button
              type="button"
              disabled={isUploading}
              onClick={() => {
                if (isUploading) return;
                onClose();
                onSwitchToBatch();
              }}
              className="px-3.5 py-1.5 bg-[#181A17] hover:bg-[#242722] disabled:opacity-50 text-white font-bold rounded-lg shrink-0 cursor-pointer text-xs transition-colors"
            >
              {t('documents.batchButton', 'Nộp cả bộ')}
            </button>
          </div>
        )}

        {defaultOrderId ? (
          <>
            <input type="hidden" {...register('horseId')} />
            <input type="hidden" {...register('regulationId')} />
            <div className="bg-[#F0EEE8] border border-[#D8CEBE] rounded-xl p-3.5 flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-[#181A17] bg-[#FFFFFF] border border-[#D8CEBE] px-2.5 py-1 rounded-md font-mono">
                  {currentOrder?.requestCode || `REQ-${String(defaultOrderId).padStart(3, '0')}`}
                </span>
                <span className="text-xs text-[#5B6779] font-medium">
                  {t('common.destination', 'Điểm đến')}:{' '}
                  <strong className="text-[#181A17]">
                    {currentOrder?.destinationCountry ? translateCountry(currentOrder.destinationCountry) : currentOrder?.destination || (language === 'en' ? 'Destination' : 'Điểm đến')}
                  </strong>
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-2 border-t border-[#D8CEBE]/80">
                <span className="text-[#5B6779] font-medium">
                  {t('customer.table.horse', 'Chiến mã')}: <strong className="text-[#181A17]">{selectedHorseNameDisplay}</strong>
                </span>
                <span className="text-[#5B6779] font-medium">
                  {t('documents.docTypeLabel', 'Loại giấy tờ')}:{' '}
                  <strong className="text-[#966516]">
                    {translateDocType(currentRegulation?.documentType || reuploadTitle || 'Hồ sơ kiểm dịch', reuploadTitle || currentRegulation?.description)}
                  </strong>
                </span>
              </div>
            </div>
          </>
        ) : (
          <>
            <div>
              <label htmlFor="upload-order-select" className="text-sm font-semibold text-[#181A17] flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                <span className="flex items-center gap-1.5">
                  <Ship size={16} className="text-[#A67C2E]" />
                  {language === 'en' ? 'Transport Order' : 'Đơn vận chuyển'} <span className="text-[#B33E3E]">*</span>
                </span>
                <span className="text-xs font-normal text-[#5B6779]">
                  {orders.length} {t('documents.availableOrders', 'đơn vận chuyển khả dụng')}
                </span>
              </label>
              <select
                id="upload-order-select"
                value={selectedOrderId}
                disabled={isLoadingOptions || isUploading}
                onChange={(e) => handleOrderChange(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-[#D8CEBE] text-sm bg-white font-medium text-[#181A17] outline-none focus:border-[#C4B38E] transition-colors"
              >
                {orders.map((ord) => {
                  const horseNames = ord.horses.map((h) => h.name).join(', ') || (language === 'en' ? 'Racehorse' : 'Ngựa đua');
                  const isApproved = String(ord.status).toLowerCase() === 'approved';
                  const statusTag = isApproved
                    ? language === 'en'
                      ? '✓ Approved'
                      : '✓ Đã duyệt'
                    : language === 'en'
                    ? '⏳ Pending'
                    : '⏳ Chờ duyệt';
                  return (
                    <option key={ord.id} value={ord.id}>
                      [{ord.requestCode}] {horseNames} — {ord.destination} ({statusTag})
                    </option>
                  );
                })}
                <option value="direct">
                  {language === 'en'
                    ? '-- Select horse directly from stable (No order) --'
                    : '-- Chọn trực tiếp ngựa trong chuồng (Không theo đơn) --'}
                </option>
              </select>
            </div>

            {currentOrder && String(currentOrder.status).toLowerCase() !== 'approved' && selectedOrderId !== 'direct' && (
              <div className="bg-[#F8F0DF] border border-[#DFCA9A] text-[#966516] rounded-xl px-3 py-2 text-xs flex items-center gap-2">
                <span className="text-sm leading-none shrink-0">⚠️</span>
                <span>
                  {language === 'en'
                    ? 'Order is awaiting Manager approval — you can upload documents in advance.'
                    : 'Đơn đang chờ Quản lý duyệt — bạn vẫn có thể nộp trước hồ sơ kiểm dịch.'}
                </span>
              </div>
            )}

            {currentOrder && currentOrder.horses.length === 1 ? (
              <>
                <input type="hidden" {...register('horseId')} />
                <div className="bg-[#FAF8F4] border border-[#EAE5DA] rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-[#181A17] text-[#C4B38E] border border-[#2D312C] flex items-center justify-center font-bold text-sm shrink-0">
                      🐎
                    </div>
                    <div>
                      <div className="text-[11px] font-bold text-[#8A7548] uppercase tracking-wider">
                        {t('documents.targetHorseLabel', 'Chiến mã')}
                      </div>
                      <div className="text-sm font-bold text-[#181A17]">
                        {currentOrder.horses[0].name}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#F3EFE6] text-[#181A17] border border-[#C4B38E]">
                      <Compass size={12} /> {translateCountry(currentOrder.destinationCountry)}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div>
                <label htmlFor="upload-horse-select" className="text-sm font-semibold text-[#181A17] block mb-1">
                  {language === 'en' ? 'Target Horse' : 'Chiến mã'} <span className="text-[#9E3B3B]">*</span>
                </label>
                <select
                  id="upload-horse-select"
                  disabled={isLoadingOptions || isUploading}
                  {...register('horseId')}
                  className={`w-full px-3 py-2 rounded-lg border text-sm bg-white outline-none transition-colors ${
                    errors.horseId ? 'border-[#9E3B3B]' : 'border-[#EAE5DA] focus:border-[#C4B38E]'
                  }`}
                >
                  {(currentOrder ? currentOrder.horses : allHorses).map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}{h.breed ? ` — ${h.breed}` : ''}
                    </option>
                  ))}
                </select>
                {errors.horseId && (
                  <span className="text-xs text-[#9E3B3B] mt-1 flex items-center gap-1">
                    <AlertCircle size={12} /> {errors.horseId.message as string}
                  </span>
                )}
              </div>
            )}

            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                <label htmlFor="upload-reg-select" className="text-sm font-semibold text-[#181A17] flex items-center gap-1.5">
                  <ShieldCheck size={16} className="text-[#287653]" />
                  {language === 'en' ? 'Document Type' : 'Loại giấy tờ'} <span className="text-[#B33E3E]">*</span>
                </label>
                {currentOrder && (
                  <button
                    type="button"
                    onClick={() => setShowAllRegulations(!showAllRegulations)}
                    className="text-xs text-[#A67C2E] hover:text-[#242722] hover:underline font-semibold cursor-pointer"
                  >
                    {showAllRegulations
                      ? language === 'en'
                        ? 'Show destination only'
                        : 'Chỉ hiện hồ sơ nước đến'
                      : language === 'en'
                      ? 'Show all countries'
                      : 'Hiện tất cả các nước'}
                  </button>
                )}
              </div>
              <select
                id="upload-reg-select"
                disabled={isLoadingOptions || isUploading}
                {...register('regulationId')}
                className={`w-full px-3 py-2.5 rounded-lg border text-sm bg-white font-medium outline-none transition-colors ${
                  errors.regulationId ? 'border-[#B33E3E]' : 'border-[#D8CEBE] focus:border-[#C4B38E]'
                }`}
              >
                {availableRegulations.map((reg) => (
                  <option key={reg.id} value={reg.id}>
                    [{translateCountry(reg.country)}] {translateDocType(reg.documentType, reg.description)}
                  </option>
                ))}
              </select>
              {errors.regulationId && (
                <span className="text-xs text-[#B33E3E] mt-1 flex items-center gap-1">
                  <AlertCircle size={12} /> {errors.regulationId.message as string}
                </span>
              )}
            </div>
          </>
        )}

        <div>
          <label htmlFor="doc-upload-file-input" className="text-sm font-semibold text-[#181A17] block mb-1">
            {language === 'en' ? 'Document File' : 'Tệp đính kèm'} <span className="text-[#B33E3E]">*</span>
          </label>
          <label
            htmlFor="doc-upload-file-input"
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!isUploading) setIsDragging(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDragging(false);
            }}
            onDrop={handleDropFiles}
            className={`relative border-2 border-dashed rounded-xl p-5 flex flex-col items-center justify-center text-center cursor-pointer transition-all focus-within:ring-2 focus-within:ring-[#A67C2E] ${
              isDragging
                ? 'border-[#A67C2E] bg-[#FAF5EB] ring-2 ring-[#A67C2E]/30'
                : errors.file
                ? 'border-[#B33E3E] bg-[#F8EAEA]'
                : 'border-[#C4B38E]/60 bg-[#F0EEE8] hover:bg-[#FAF8F4]'
            }`}
          >
            <input
              id="doc-upload-file-input"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              disabled={isUploading}
              {...fileInputProps}
              ref={(el) => {
                registerFileRef(el);
                fileInputRef.current = el;
              }}
              className="sr-only"
            />

            {fileName ? (
              <div className="flex items-center justify-between gap-3 w-full max-w-md bg-white border border-[#D8CEBE] rounded-xl px-3.5 py-2.5 shadow-sm">
                <div className="flex items-center gap-3 min-w-0">
                  <FileText size={26} className="text-[#A67C2E] shrink-0" />
                  <div className="text-left min-w-0">
                    <div className="text-sm font-semibold text-[#181A17] break-all">{fileName}</div>
                    <div className="text-xs text-[#287653] font-medium">
                      {language === 'en' ? '✓ File selected, ready to upload' : '✓ Đã chọn tệp, sẵn sàng tải lên'}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={handleRemoveFile}
                  aria-label={language === 'en' ? 'Remove selected file' : 'Gỡ tệp đã chọn'}
                  title={language === 'en' ? 'Remove file' : 'Gỡ tệp'}
                  className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer shrink-0 disabled:opacity-40"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <>
                <div className="w-10 h-10 rounded-full bg-[#FAF8F4] flex items-center justify-center text-[#A67C2E] mb-2 border border-[#D4C5A3]">
                  <UploadCloud size={20} />
                </div>
                <div className="text-sm font-semibold text-[#181A17]">
                  {language === 'en'
                    ? 'Click to choose a file or drag & drop here'
                    : 'Chọn tệp hoặc kéo thả vào đây'}
                </div>
                <div className="text-xs text-[#5B6779] mt-1">
                  {t('documents.dropzoneFormats', 'Hỗ trợ PDF, JPG, PNG (tối đa 10MB)')}
                </div>
              </>
            )}
          </label>
          {errors.file && (
            <span className="text-xs text-[#B33E3E] mt-1.5 flex items-center gap-1">
              <AlertCircle size={12} /> {errors.file.message as string}
            </span>
          )}
        </div>

        <div>
          <label htmlFor="upload-doc-number" className="text-sm font-semibold text-[#181A17] block mb-1">
            {language === 'en' ? 'Document / Permit No. (Optional)' : 'Số hiệu chứng từ (Tùy chọn)'}
          </label>
          <input
            id="upload-doc-number"
            type="text"
            disabled={isUploading}
            placeholder={language === 'en' ? 'e.g. FEI-2026-9812 or VET-SG-2026-004' : 'Ví dụ: FEI-2026-9812 hoặc VET-SG-2026-004'}
            {...register('docNumber')}
            className="w-full px-3 py-2 rounded-lg border border-[#D8CEBE] text-sm bg-white outline-none focus:border-[#C4B38E]"
          />
        </div>

        <div className="sticky -bottom-6 -mx-6 px-6 py-3.5 bg-white/95 backdrop-blur-sm border-t border-[#E8E2D8] flex flex-wrap justify-end gap-3 mt-2 z-10">
          <Button type="button" variant="outline" disabled={isUploading} onClick={handleClose}>
            {t('common.cancel', 'Hủy Bỏ')}
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={isUploading || isDone || isLoadingOptions}
            className="min-w-[160px]"
          >
            {isDone ? (
              <span className="flex items-center gap-1.5">
                <CheckCircle size={16} /> {language === 'en' ? 'Uploaded!' : 'Đã Tải Lên!'}
              </span>
            ) : isUploading ? (
              <span className="flex items-center gap-1.5">
                <Loader2 size={16} className="animate-spin" /> {t('common.loading', 'Đang Tải Lên...')}
              </span>
            ) : (
              t('common.submit', 'Tải Lên Hồ Sơ')
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
