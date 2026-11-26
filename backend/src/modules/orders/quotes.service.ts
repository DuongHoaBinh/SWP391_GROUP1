import {
  Injectable,
  Optional,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { QuotesStore, ShipmentQuoteRecord } from './quotes.store';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { UserRole } from '../auth/auth.types';
import { PricingService } from './pricing.service';
import { DocumentsService } from '../documents/documents.service';
import { haversineKm } from '../routes/geo-policy';
import { isInServiceArea, SERVICE_AREA } from '../routes/route-network.geo';
import { calculateInsurance, totalInsuranceFee } from './insurance-policy';
import { currentReturnPolicy } from './return-policy';
import { AllocationQuoteResult, QuoteAllocationService } from './quote-allocation.service';
import { localToUtc } from '../fleet/city-restriction-policy';

@Injectable()
export class QuotesService {
  constructor(
    private readonly quotesStore: QuotesStore,
    private readonly pricingService: PricingService,
    private readonly documentsService: DocumentsService,
    @Optional() private readonly allocationService?: QuoteAllocationService,
  ) {}

  async createQuote(user: AuthenticatedUser, dto: CreateQuoteDto) {
    const customerId = Number(user.id);
    const isRoundTrip = dto.tripType === 'round_trip';

    // 1. Kiểm tra tripType & returnDepartureAt nếu khứ hồi
    if (isRoundTrip && !dto.returnDepartureAt) {
      throw new BadRequestException('Báo giá khứ hồi bắt buộc phải có thời điểm hẹn đón chặng về (returnDepartureAt)');
    }

    // 2. Kiểm tra tọa độ điểm đón và giao
    this.validateCoordinates(dto.origin.lat, dto.origin.lng, 'Điểm đón');
    this.validateCoordinates(dto.destination.lat, dto.destination.lng, 'Điểm giao');

    const distanceOriginDest = haversineKm(dto.origin, dto.destination);
    if (distanceOriginDest < 1) {
      throw new BadRequestException('Điểm đón và điểm giao không được trùng nhau (cách nhau tối thiểu 1 km)');
    }

    // 3. Kiểm tra ngày khởi hành không ở quá khứ (theo múi giờ VN UTC+7)
    this.validateDepartureDate(dto.departureDate);
    const pickupAt = this.resolvePickupAt(dto);

    // 3.5. Kiểm tra thời gian chuẩn bị hồ sơ kiểm dịch (Step 8 lead time)
    if (this.documentsService && typeof this.documentsService.assertDocumentLeadTime === 'function') {
      await this.documentsService.assertDocumentLeadTime({
        departDate: dto.departureDate,
        destinationLocation: dto.destination.address,
        originLocation: dto.origin.address,
        transportMode: dto.transportMode,
        horseIds: dto.horses?.map((h) => h.horseId).filter((id): id is number => typeof id === 'number' && id > 0),
      });
    }

    // 4. Kiểm tra danh sách ngựa
    if (!dto.horses || !dto.horses.length) {
      throw new BadRequestException('Báo giá yêu cầu ít nhất một con ngựa');
    }

    const horseSnapshots: Array<{
      horseId: number;
      name: string;
      quantity: number;
      requiresPrivateStall: boolean;
      insurance: ReturnType<typeof calculateInsurance>;
      roundTripInsuranceFee?: number;
      returnInsuranceFee?: number;
    }> = [];

    const seenHorses = new Set<number>();

    for (const h of dto.horses) {
      if (seenHorses.has(h.horseId)) {
        throw new BadRequestException(`Ngựa #${h.horseId} bị trùng lặp trong yêu cầu báo giá`);
      }
      seenHorses.add(h.horseId);

      const horse = await this.quotesStore.findHorseById(h.horseId);
      if (!horse) {
        throw new NotFoundException(`Không tìm thấy ngựa #${h.horseId}`);
      }

      // Kiểm tra quyền sở hữu (Customer chỉ được báo giá cho ngựa của mình)
      if (horse.ownerId !== customerId) {
        throw new ForbiddenException(`Ngựa "${horse.name}" (#${h.horseId}) không thuộc tài khoản của bạn`);
      }

      if (horse.status !== 'active') {
        throw new BadRequestException(`Ngựa "${horse.name}" hiện không sẵn sàng vận chuyển`);
      }

      const qty = h.quantity && h.quantity > 0 ? h.quantity : 1;
      const insResult = calculateInsurance({
        declaredValue: h.declaredValue ?? 0,
        declaredCurrency: h.declaredCurrency ?? 'VND',
        insurancePackage: h.insurancePackage ?? 'basic',
      });

      const oneWayFee = insResult.insuranceFee;
      const roundTripFee = Math.round(oneWayFee * 2 * 0.9);
      const returnInsFee = roundTripFee - oneWayFee;

      horseSnapshots.push({
        horseId: horse.horseId,
        name: horse.name,
        quantity: qty,
        requiresPrivateStall: horse.requiresPrivateStall, // Lấy từ DB, không tin client
        insurance: insResult,
        roundTripInsuranceFee: roundTripFee,
        returnInsuranceFee: returnInsFee,
      });
    }

    const oneWayInsuranceTotal = totalInsuranceFee(
      horseSnapshots.map((h) => ({
        insuranceFee: h.insurance.insuranceFee,
        quantity: h.quantity,
      })),
    );

    const roundTripInsuranceTotal = horseSnapshots.reduce(
      (sum, h) => sum + (h.roundTripInsuranceFee || 0) * h.quantity,
      0,
    );

    const returnInsuranceTotal = roundTripInsuranceTotal - oneWayInsuranceTotal;
    const insuranceTotal = isRoundTrip ? roundTripInsuranceTotal : oneWayInsuranceTotal;

    // 5. Kiểm tra phương thức
    if (dto.transportMode === 'sea' && !dto.seaMode) {
      throw new BadRequestException('Vui lòng chọn hình thức đường thủy (ferry hoặc vessel)');
    }

    // 6. Tính toán cước chặng đi. Step 9: có QuoteAllocationService thì phân bổ xe thật (tối đa 3 phương án)
    let allocation: AllocationQuoteResult | null = null;
    if (this.allocationService) {
      allocation = await this.allocationService.allocate({
        mode: dto.transportMode,
        seaMode: dto.seaMode,
        origin: dto.origin,
        destination: dto.destination,
        horses: horseSnapshots.map((h) => ({ quantity: h.quantity, requiresPrivateStall: h.requiresPrivateStall })),
        pickupAt,
      });
      if (!allocation.options.length) {
        // Không có phương án: trả 200 với options rỗng + ngày gợi ý, không lưu báo giá
        return {
          quoteId: null,
          transportMode: dto.transportMode,
          seaMode: dto.seaMode ?? null,
          tripType: dto.tripType ?? 'one_way',
          legs: allocation.context.legs,
          routePlan: allocation.context.routePlan ?? null,
          requiredStallSlots: allocation.context.requiredStallSlots,
          requestedPickupAt: pickupAt.toISOString(),
          options: [],
          recommendedOptionCode: null,
          shortage: allocation.shortage,
          jetStallsRequired: allocation.jetStallsRequired,
          vesselPens: allocation.vesselPens,
          warnings: allocation.warnings,
        } as any;
      }
    }
    const recommendedAlloc = allocation
      ? allocation.options.find((o) => o.optionCode === allocation!.recommendedOptionCode) ?? allocation.options[0]
      : null;
    const preview = allocation && recommendedAlloc
      ? {
          ...recommendedAlloc.freight,
          legs: allocation.context.legs,
          routePlan: allocation.context.routePlan ?? null,
          requiredStallSlots: allocation.context.requiredStallSlots,
          vehicles: recommendedAlloc.vehicles.map((v) => ({
            classCode: v.classCode,
            className: v.className,
            priceCoefficient: 1,
            capacity: v.capacity,
            deadheadKm: v.deadheadKm,
          })),
          tariffVersions: {
            road: allocation.context.tariffs.road.version ?? 1,
            ...(allocation.context.tariffs.air ? { air: allocation.context.tariffs.air.version ?? 1 } : {}),
            ...(allocation.context.tariffs.sea ? { sea: allocation.context.tariffs.sea.version ?? 1 } : {}),
            ...(allocation.context.tariffs.partnerRoad ? { partnerRoad: allocation.context.tariffs.partnerRoad.version ?? 1 } : {}),
          } as Record<string, number>,
          warnings: [...allocation.warnings, ...recommendedAlloc.warnings],
        }
      : await this.pricingService.previewPricing({
      mode: dto.transportMode,
      seaMode: dto.seaMode,
      sample: {
        origin: dto.origin,
        destination: dto.destination,
        horses: horseSnapshots.map((h) => ({
          quantity: h.quantity,
          requiresPrivateStall: h.requiresPrivateStall,
        })),
      },
    });

    // 7. Nếu là khứ hồi: kiểm tra thời gian hẹn đón và tính cước chặng về
    let returnPreview: Awaited<ReturnType<PricingService['previewPricing']>> | null = null;
    let discountedReturnFreight = 0;
    let returnDiscountAmount = 0;
    const returnDiscountPercent = 10;

    if (isRoundTrip) {
      const estimatedHours = preview.legs.reduce((sum, leg) => sum + (leg.durationHours || 0), 0);
      const departureTime = new Date(dto.departureDate).getTime();
      const minReturnTime = departureTime + (estimatedHours + 12) * 3600 * 1000;
      const returnDepartureTime = new Date(dto.returnDepartureAt!).getTime();

      if (returnDepartureTime < minReturnTime) {
        throw new BadRequestException(
          `Thời điểm hẹn đón chặng về phải sau thời điểm khởi hành tối thiểu ${estimatedHours.toFixed(1)}h di chuyển + 12h nghỉ (sớm nhất là ${new Date(minReturnTime).toISOString()})`,
        );
      }

      // Tính cước chặng về (điểm đi và điểm đến đảo ngược, deadhead tính từ trạm gần điểm giao chặng đi)
      returnPreview = await this.pricingService.previewPricing({
        mode: dto.transportMode,
        seaMode: dto.seaMode,
        sample: {
          origin: dto.destination,
          destination: dto.origin,
          horses: horseSnapshots.map((h) => ({
            quantity: h.quantity,
            requiresPrivateStall: h.requiresPrivateStall,
          })),
        },
      });

      discountedReturnFreight = Math.ceil((returnPreview.total * (1 - returnDiscountPercent / 100)) / 1000) * 1000;
      returnDiscountAmount = returnPreview.total - discountedReturnFreight;
    }

    const ttlMinutes = Number(process.env.QUOTE_TTL_MINUTES) || 30;
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

    const vehicleSummary = preview.vehicles
      .map((v) => `${v.className || v.classCode}`)
      .join(', ');

    const outboundFreightTotal = preview.total;
    const freightTotal = isRoundTrip ? outboundFreightTotal + discountedReturnFreight : outboundFreightTotal;
    const grandTotal = freightTotal + insuranceTotal;

    const returnLines = returnPreview
      ? [
          ...returnPreview.lines,
          ...(returnDiscountAmount > 0
            ? [
                {
                  code: 'return_discount',
                  label: `Giảm giá chặng về (${returnDiscountPercent}%)`,
                  quantity: 1,
                  unit: 'chặng',
                  unitPrice: -returnDiscountAmount,
                  amount: -returnDiscountAmount,
                  meta: { returnDiscountPercent },
                },
              ]
            : []),
        ]
      : [];

    const responsePayload = {
      expiresAt: expiresAt.toISOString(),
      transportMode: dto.transportMode,
      seaMode: dto.seaMode ?? null,
      tripType: dto.tripType ?? 'one_way',
      returnDepartureAt: isRoundTrip ? dto.returnDepartureAt : null,
      legs: preview.legs,
      routePlan: preview.routePlan ?? null,
      requiredStallSlots: preview.requiredStallSlots,
      outbound: {
        legs: preview.legs,
        freight: {
          lines: preview.lines,
          subtotal: preview.subtotal,
          rounding: preview.rounding,
          total: preview.total,
        },
      },
      return: returnPreview
        ? {
            legs: returnPreview.legs,
            freight: {
              lines: returnLines,
              subtotal: returnPreview.subtotal,
              rounding: returnPreview.rounding,
              discount: returnDiscountAmount,
              total: discountedReturnFreight,
            },
          }
        : null,
      returnFreight: isRoundTrip ? discountedReturnFreight : 0,
      returnInsuranceFee: isRoundTrip ? returnInsuranceTotal : 0,
      requestedPickupAt: pickupAt.toISOString(),
      pickupAt: recommendedAlloc?.pickupAt ?? pickupAt.toISOString(),
      jetStallsRequired: allocation?.jetStallsRequired ?? null,
      vesselPens: allocation?.vesselPens ?? null,
      partnerDepot: allocation?.partnerDepot ?? null,
      shortage: null,
      options: allocation
        ? allocation.options.map((o) => ({
            ...o,
            recommended: o.optionCode === recommendedAlloc?.optionCode,
            outboundFreightTotal: o.freight.total,
            freight: { ...o.freight, total: o.freight.total + (isRoundTrip ? discountedReturnFreight : 0) },
          }))
        : [
        {
          optionCode: 'default',
          label: vehicleSummary,
          vehicles: preview.vehicles.map((v) => ({
            classCode: v.classCode,
            className: v.className,
            count: 1,
            deadheadKm: v.deadheadKm,
          })),
          freight: {
            lines: preview.lines,
            subtotal: preview.subtotal,
            rounding: preview.rounding,
            total: freightTotal,
          },
        },
      ],
      recommendedOptionCode: recommendedAlloc?.optionCode ?? 'default',
      insurance: {
        total: insuranceTotal,
        outboundTotal: oneWayInsuranceTotal,
        returnTotal: isRoundTrip ? returnInsuranceTotal : 0,
        horses: horseSnapshots.map((h) => ({
          horseId: h.horseId,
          name: h.name,
          quantity: h.quantity,
          declaredValue: h.insurance.declaredValue,
          declaredCurrency: h.insurance.declaredCurrency,
          insurancePackage: h.insurance.insurancePackage,
          insuranceFee: isRoundTrip ? h.roundTripInsuranceFee : h.insurance.insuranceFee,
          maxCompensation: h.insurance.maxCompensation,
        })),
      },
      returnPolicy: isRoundTrip ? currentReturnPolicy() : null,
      total: grandTotal,
      tariffVersions: preview.tariffVersions,
      warnings: returnPreview ? [...preview.warnings, ...returnPreview.warnings] : preview.warnings,
    };

    const quoteId = await this.quotesStore.createQuote({
      customerId,
      transportMode: dto.transportMode,
      seaMode: dto.seaMode ?? null,
      tripType: dto.tripType ?? 'one_way',
      inputJson: {
        ...dto,
        horses: horseSnapshots.map((h) => ({
          horseId: h.horseId,
          name: h.name,
          quantity: h.quantity,
          requiresPrivateStall: h.requiresPrivateStall,
          declaredValue: h.insurance.declaredValue,
          declaredCurrency: h.insurance.declaredCurrency,
          insurancePackage: h.insurance.insurancePackage,
        })),
      },
      resultJson: responsePayload,
      tariffVersionsJson: preview.tariffVersions,
      freightTotal,
      insuranceTotal,
      total: grandTotal,
      expiresAt,
    });

    return {
      quoteId,
      ...responsePayload,
    };
  }

  async getQuoteById(user: AuthenticatedUser, quoteId: number) {
    const record = await this.quotesStore.findQuoteById(quoteId);
    if (!record) {
      throw new NotFoundException(`Không tìm thấy báo giá #${quoteId}`);
    }

    const userId = Number(user.id);
    const isOwner = record.customerId === userId;
    const isStaff = user.role === UserRole.LOGISTICS_MANAGER || user.role === UserRole.ADMIN;

    if (!isOwner && !isStaff) {
      throw new ForbiddenException('Bạn không có quyền xem báo giá của người khác');
    }

    return {
      quoteId: record.quoteId,
      customerId: record.customerId,
      status: record.status,
      expiresAt: record.expiresAt,
      usedByShipmentId: record.usedByShipmentId,
      createdAt: record.createdAt,
      ...record.resultJson,
    };
  }

  private validateCoordinates(lat: number, lng: number, label: string) {
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      throw new BadRequestException(`${label}: vĩ độ phải nằm trong khoảng [-90, 90]`);
    }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      throw new BadRequestException(`${label}: kinh độ phải nằm trong khoảng [-180, 180]`);
    }

    // Ràng buộc khu vực phục vụ: Đông Nam Á + Trung Quốc (gồm Hồng Kông, Ma Cao) — xem route-network.geo
    if (!isInServiceArea(lat, lng)) {
      const a = SERVICE_AREA;
      throw new BadRequestException(
        `${label} nằm ngoài khu vực phục vụ của EquiTransit (Đông Nam Á & Trung Quốc: vĩ độ [${a.minLat}, ${a.maxLat}], kinh độ [${a.minLng}, ${a.maxLng}])`,
      );
    }
  }

  /**
   * Giờ đón mong muốn (Step 9). Nhận ISO có múi giờ, hoặc 'YYYY-MM-DDTHH:mm' hiểu là giờ Việt Nam.
   * Thiếu pickupAt thì mặc định 08:00 giờ Việt Nam của departureDate (tương thích Step 4).
   */
  private resolvePickupAt(dto: CreateQuoteDto): Date {
    const raw = dto.pickupAt?.trim();
    let at: Date;
    if (raw && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(raw)) {
      at = localToUtc(raw.slice(0, 10), raw.slice(11, 16));
    } else if (raw) {
      at = new Date(raw);
    } else {
      const day = /^\d{4}-\d{2}-\d{2}/.test(dto.departureDate)
        ? dto.departureDate.slice(0, 10)
        : new Date(dto.departureDate).toISOString().slice(0, 10);
      at = localToUtc(day, '08:00');
    }
    if (!Number.isFinite(at.getTime())) throw new BadRequestException('Giờ đón (pickupAt) không đúng định dạng');
    if (raw && at.getTime() < Date.now() - 5 * 60 * 1000) throw new BadRequestException('Giờ đón không được ở quá khứ');
    return at;
  }

  private validateDepartureDate(dateStr: string) {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      throw new BadRequestException('Ngày khởi hành không đúng định dạng');
    }

    // So sánh theo ngày (bỏ qua giờ)
    const now = new Date();
    const todayVn = new Date(now.getTime() + 7 * 60 * 60 * 1000).toISOString().split('T')[0];
    const departureVn = new Date(date.getTime() + 7 * 60 * 60 * 1000).toISOString().split('T')[0];

    if (departureVn < todayVn) {
      throw new BadRequestException('Ngày khởi hành không được ở quá khứ');
    }
  }
}
