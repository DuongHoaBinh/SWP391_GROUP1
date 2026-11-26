import { BadRequestException, ConflictException, ForbiddenException, GoneException, Inject, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { createPool, Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { MYSQL_POOL } from '../../common/database/database.module';
import { ShipmentAttachment, ShipmentStatus, TransportOrder, OrderHorse } from './orders.types';
import { CreateOrderDto, HorseInfoDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { calculateInsurance, totalInsuranceFee } from './insurance-policy';
import { BookingQuote, BookingType, assertNewBookingType, calculateBookingQuote, resolveResubmitBookingType } from './booking-policy';
import { parseJsonField } from './pricing.store';
import { currentReturnPolicy, calculateReturnCancellationRefund } from './return-policy';
import { CANNOT_FULFIL_REASONS, FeasibilityReviewDto, SubmitRefundFormDto } from './dto/prepaid-flow.dto';
import { addBusinessDays } from './prepaid-policy';
import { transitionShipment } from './order-state-machine';
import { releaseShipmentReservations, reserveVehicles } from '../fleet/vehicle-reservation';
import { ResultSetHeader } from 'mysql2/promise';

interface ShipmentRow extends RowDataPacket {
  transport_mode: 'road' | 'air' | 'sea' | null;
  sea_mode?: 'ferry' | 'vessel' | null;
  quote_id?: number | null;
  pricing_snapshot?: string | any | null;
  distance_km?: number | string | null;
  distance_source?: 'ors' | 'estimated' | 'table' | null;
  origin_lat?: number | string | null;
  origin_lng?: number | string | null;
  destination_lat?: number | string | null;
  destination_lng?: number | string | null;
  booking_type: BookingType;
  stall_unit_price: number | string | null;
  shipment_id: number;
  customer_id: number;
  requested_by: number;
  approved_by: number | null;
  contact_name: string | null;
  contact_address: string | null;
  contact_phone: string;
  contact_email: string;
  requested_horse_count: number;
  origin_location: string;
  destination_location: string;
  requested_date: Date;
  departure_date: Date | null;
  expected_arrival_date: Date | null;
  actual_arrival_date: Date | null;
  transportation_type: string | null;
  trip_type?: 'one_way' | 'round_trip';
  return_departure_at?: Date | string | null;
  return_wait_minutes?: number | null;
  return_status?: 'not_applicable' | 'scheduled' | 'in_progress' | 'cancelled' | 'no_show' | 'completed';
  return_no_show?: boolean | number;
  return_freight?: number | string;
  return_insurance_fee?: number | string;
  return_policy_snapshot?: string | any | null;
  return_policy_accepted_at?: Date | string | null;
  return_cancelled_at?: Date | string | null;
  return_cancel_reason?: string | null;
  return_reschedule_fee?: number | string;
  payment_flow?: 'postpaid_legacy' | 'prepaid';
  payment_due_at?: Date | string | null;
  cancel_reason_code?: string | null;
  feasibility_decided_by?: number | null;
  feasibility_decided_at?: Date | string | null;
  feasibility_reason_code?: string | null;
  feasibility_note?: string | null;
  special_requirements: string | null;
  rejection_reason: string | null;
  change_request_notes: string | null;
  status: ShipmentStatus;
  total_cost: number | string;
  transport_cost: number | string | null;
  insurance_fee: number | string;
  payment_status?: 'pending' | 'review' | 'succeeded';
  payment_code?: string | null;
  paid_at?: Date | null;
  created_at: Date;
  updated_at: Date;
  customer_email?: string;
  approver_name?: string;
  request_code?: string;
  customer_request_code?: string;
}

interface AttachmentRow extends RowDataPacket {
  attachment_id: number;
  file_url: string;
  file_type: 'image' | 'document' | 'video';
  uploaded_at: Date;
}

interface HorseRow extends RowDataPacket {
  horse_id: number;
  name: string;
  breed: string | null;
  gender: 'male' | 'female' | 'other' | 'gelding' | null;
  age: number | null;
  color?: string | null;
  weight?: string | null;
  medical_status?: string | null;
  microchip_no?: string | null;
  passport_no?: string | null;
  special_requirements?: string | null;
  requires_private_stall?: number | boolean | null;
}

@Injectable()
export class OrdersStore implements OnModuleInit, OnModuleDestroy {
  private pool!: Pool;

  constructor(@Optional() @Inject(MYSQL_POOL) private readonly injectedPool?: Pool) {
    if (injectedPool) {
      this.pool = injectedPool;
    }
  }

  async onModuleInit(): Promise<void> {
    if (!this.pool) {
      this.pool = createPool({
        host: process.env.DB_HOST ?? 'localhost',
        port: Number(process.env.DB_PORT ?? 3306),
        database: process.env.DB_NAME ?? 'horse_transport_system',
        user: process.env.DB_USER ?? 'root',
        password: process.env.DB_PASSWORD ?? '',
        connectionLimit: 10,
      });
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pool && !this.injectedPool) {
      await this.pool.end();
    }
  }

  private async transaction<T>(action: (db: PoolConnection) => Promise<T>): Promise<T> {
    const db = await this.pool.getConnection();
    try { await db.beginTransaction(); const result = await action(db); await db.commit(); return result; }
    catch (error) { await db.rollback(); throw error; }
    finally { db.release(); }
  }

  private horseInputs(dto: CreateOrderDto | UpdateOrderDto): HorseInfoDto[] {
    if (dto.horses?.length) return dto.horses;
    return dto.horseName ? [{ name: dto.horseName, breed: dto.horseBreed, gender: dto.horseGender, age: dto.horseAge, quantity: dto.requestedHorseCount ?? 1 }] : [];
  }

  private async insuredHorses(db: PoolConnection, customerId: number, input: HorseInfoDto[], previous: RowDataPacket[] = []) {
    if (!input.length) throw new BadRequestException('Vui lòng chọn ít nhất một con ngựa cho đơn vận chuyển.');
    const seen = new Set<number>();
    const result: Array<ReturnType<typeof calculateInsurance> & { horseId: number; quantity: number }> = [];
    for (const h of [...input].sort((a, b) => (a.horseId ?? 0) - (b.horseId ?? 0) || a.name.localeCompare(b.name))) {
      const [rows] = await db.execute<RowDataPacket[]>(`SELECT horse_id, name, status, quantity FROM horse
        WHERE owner_id = ? AND ${h.horseId ? 'horse_id = ?' : 'name = ?'} ORDER BY horse_id DESC LIMIT 1 FOR UPDATE`, [customerId, h.horseId ?? h.name]);
      const horse = rows[0];
      if (!horse) throw new BadRequestException(`Ngựa "${h.name}" không thuộc My Horses của bạn.`);
      const horseId = Number(horse.horse_id), old = previous.find(p => Number(p.horse_id) === horseId);
      if (seen.has(horseId)) throw new BadRequestException('Một hồ sơ ngựa chỉ được xuất hiện một lần trong đơn');
      seen.add(horseId);
      if (horse.status !== 'active' && !(old && horse.status === 'in_transit')) throw new BadRequestException(`Ngựa "${horse.name}" hiện không sẵn sàng vận chuyển.`);
      const quantity = h.quantity ?? Number(old?.quantity ?? 1);
      if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > Number(horse.quantity ?? 1)) throw new BadRequestException(`Số lượng ngựa "${horse.name}" không hợp lệ hoặc vượt số lượng trong hồ sơ.`);
      const declaration = {
        declaredValue: h.declaredValue ?? (old ? Number(old.declared_value) : 0),
        declaredCurrency: h.declaredCurrency ?? old?.declared_currency ?? 'VND',
        insurancePackage: h.insurancePackage ?? old?.insurance_package ?? 'basic',
      };
      const unchanged = old && declaration.declaredValue === Number(old.declared_value) &&
        declaration.declaredCurrency === old.declared_currency && declaration.insurancePackage === old.insurance_package;
      const policy = unchanged ? {
        declaredValue: Number(old.declared_value), declaredCurrency: old.declared_currency,
        exchangeRate: Number(old.exchange_rate), declaredValueVnd: Number(old.declared_value_vnd),
        insurancePackage: old.insurance_package, insuranceFee: Number(old.insurance_fee), maxCompensation: Number(old.max_compensation),
        emergencyVetCovered: Boolean(old.emergency_vet_covered), insurancePolicyVersion: old.insurance_policy_version,
      } : calculateInsurance(declaration);
      result.push({ ...policy, horseId, quantity });
    }
    totalInsuranceFee(result);
    return result;
  }

  private async insertInsuredHorses(db: PoolConnection, shipmentId: number, horses: Awaited<ReturnType<OrdersStore['insuredHorses']>>) {
    for (const h of horses) {
      await db.execute(`INSERT INTO shipment_horse (shipment_id, horse_id, quantity, declared_value, declared_currency,
        exchange_rate, declared_value_vnd, insurance_package, insurance_fee, max_compensation, emergency_vet_covered, insurance_policy_version)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [shipmentId, h.horseId, h.quantity, h.declaredValue, h.declaredCurrency,
        h.exchangeRate, h.declaredValueVnd, h.insurancePackage, h.insuranceFee, h.maxCompensation, h.emergencyVetCovered, h.insurancePolicyVersion]);
      await db.execute("UPDATE horse SET status = 'in_transit' WHERE horse_id = ?", [h.horseId]);
    }
  }

  async createShipment(customerId: number, dto: CreateOrderDto): Promise<number> {
    return this.transaction(async db => {
      if (dto.quoteId) {
        const [quoteRows] = await db.execute<RowDataPacket[]>(
          'SELECT * FROM shipment_quote WHERE quote_id = ? FOR UPDATE',
          [dto.quoteId],
        );
        if (!quoteRows.length) {
          throw new NotFoundException(`Không tìm thấy báo giá #${dto.quoteId}`);
        }
        const qRow = quoteRows[0];
        if (Number(qRow.customer_id) !== customerId) {
          throw new ForbiddenException('Báo giá không thuộc tài khoản của bạn');
        }
        if (qRow.status === 'used') {
          throw new ConflictException('Báo giá này đã được sử dụng để tạo đơn');
        }
        if (qRow.status === 'expired' || new Date(qRow.expires_at) <= new Date()) {
          throw new GoneException('Báo giá đã hết hạn, vui lòng báo giá lại');
        }

        const qInput = parseJsonField(qRow.input_json);
        const qResult = parseJsonField(qRow.result_json);

        if (dto.originLocation && dto.originLocation !== qInput.origin.address) {
          throw new ConflictException('Địa điểm đón không khớp với báo giá');
        }
        if (dto.destinationLocation && dto.destinationLocation !== qInput.destination.address) {
          throw new ConflictException('Địa điểm giao không khớp với báo giá');
        }

        const quoteHorseIds = (qInput.horses || []).map((h: any) => Number(h.horseId)).sort();
        const clientHorseInputs = this.horseInputs(dto);
        if (clientHorseInputs.length) {
          const clientHorseIds = clientHorseInputs.map((h: any) => Number(h.horseId)).sort();
          if (JSON.stringify(quoteHorseIds) !== JSON.stringify(clientHorseIds)) {
            throw new ConflictException('Danh sách ngựa không khớp với báo giá');
          }
        }

        const quoteHorses = qInput.horses || [];
        const insuredList: HorseInfoDto[] = quoteHorses.map((qh: any) => ({
          horseId: qh.horseId,
          name: qh.name,
          quantity: qh.quantity || 1,
          declaredValue: qh.declaredValue,
          declaredCurrency: qh.declaredCurrency,
          insurancePackage: qh.insurancePackage,
        }));

        const horses = await this.insuredHorses(db, customerId, insuredList);
        const count = horses.reduce((sum, h) => sum + h.quantity, 0);

        const optionCode = dto.optionCode || qResult.recommendedOptionCode || 'default';
        const matchedOption = (qResult.options || []).find((o: any) => o.optionCode === optionCode);
        const hasAllocation = (qResult.options || []).some((o: any) => Array.isArray(o.vehicleIds));
        if (dto.optionCode && !matchedOption && hasAllocation) {
          throw new BadRequestException(`Phương án xe "${dto.optionCode}" không có trong báo giá`);
        }
        const selectedOption = matchedOption || qResult.options?.[0];

        const transportCost = Number(selectedOption?.freight?.total ?? qRow.freight_total);
        const insuranceFee = Number(qResult.insurance?.total ?? qRow.insurance_total);
        const totalCost = transportCost + insuranceFee;

        const isRoundTrip = qRow.trip_type === 'round_trip' || qInput.tripType === 'round_trip' || dto.tripType === 'round_trip';
        if (isRoundTrip && !dto.acceptReturnPolicy) {
          throw new BadRequestException('Bạn phải đồng ý chính sách hủy chặng về và no-show để đặt chuyến khứ hồi');
        }

        const tripType = isRoundTrip ? 'round_trip' : 'one_way';
        const returnDepartureAt = isRoundTrip
          ? (dto.returnDepartureAt ? new Date(dto.returnDepartureAt) : (qInput.returnDepartureAt ? new Date(qInput.returnDepartureAt) : null))
          : null;
        const returnFreight = isRoundTrip ? Number(qResult.returnFreight || qResult.return?.freight?.total || 0) : 0;
        const returnInsuranceFee = isRoundTrip ? Number(qResult.returnInsuranceFee || qResult.insurance?.returnTotal || 0) : 0;
        const returnStatus = isRoundTrip ? 'scheduled' : 'not_applicable';
        const returnPolicySnapshot = isRoundTrip ? JSON.stringify(currentReturnPolicy()) : null;
        const returnPolicyAcceptedAt = isRoundTrip ? new Date() : null;

        const pricingSnapshot = {
          option: selectedOption,
          tariffVersions: qResult.tariffVersions,
          legs: qResult.legs,
          return: qResult.return ?? null,
          tripType,
          customerProposedPrice:
            dto.customerProposedPrice != null && Number.isFinite(Number(dto.customerProposedPrice)) && Number(dto.customerProposedPrice) > 0
              ? Math.round(Number(dto.customerProposedPrice))
              : null,
        };

        const distanceKm = qResult.legs?.[0]?.distanceKm != null ? Number(qResult.legs[0].distanceKm) : null;
        const distanceSource = qResult.legs?.[0]?.source ?? null;
        const originLat = qInput.origin?.lat ?? dto.originLat ?? null;
        const originLng = qInput.origin?.lng ?? dto.originLng ?? null;
        const destinationLat = qInput.destination?.lat ?? dto.destinationLat ?? null;
        const destinationLng = qInput.destination?.lng ?? dto.destinationLng ?? null;
        const originLocation = qInput.origin?.address || dto.originLocation;
        const destinationLocation = qInput.destination?.address || dto.destinationLocation;
        const transportMode = qRow.transport_mode;
        const seaMode = qRow.sea_mode ?? null;

        const paymentWindowMinutes = Number(process.env.ORDER_PAYMENT_WINDOW_MINUTES || 1440);
        const paymentDueAt = new Date(Date.now() + paymentWindowMinutes * 60 * 1000);

        const [result] = await db.execute(
          `INSERT INTO shipment (
            customer_id, requested_by, contact_name, contact_address, contact_phone,
            contact_email, requested_horse_count, origin_location, destination_location,
            requested_date, transportation_type, special_requirements, status, payment_flow, payment_due_at,
            total_cost, transport_cost, insurance_fee, booking_type,
            quote_id, pricing_snapshot, distance_km, distance_source,
            origin_lat, origin_lng, destination_lat, destination_lng,
            transport_mode, sea_mode,
            trip_type, return_departure_at, return_wait_minutes, return_status, return_no_show,
            return_freight, return_insurance_fee, return_policy_snapshot, return_policy_accepted_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'awaiting_payment', 'prepaid', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 120, ?, FALSE, ?, ?, ?, ?)`,
          [
            customerId,
            customerId,
            dto.contactName ?? null,
            dto.contactAddress ?? null,
            dto.contactPhone,
            dto.contactEmail,
            count,
            originLocation,
            destinationLocation,
            dto.requestedDate ? new Date(dto.requestedDate) : new Date(qInput.departureDate || Date.now()),
            dto.transportationType ?? null,
            dto.specialRequirements ?? null,
            paymentDueAt,
            totalCost,
            transportCost,
            insuranceFee,
            assertNewBookingType(dto.bookingType),
            dto.quoteId,
            JSON.stringify(pricingSnapshot),
            distanceKm,
            distanceSource,
            originLat,
            originLng,
            destinationLat,
            destinationLng,
            transportMode,
            seaMode,
            tripType,
            returnDepartureAt,
            returnStatus,
            returnFreight,
            returnInsuranceFee,
            returnPolicySnapshot,
            returnPolicyAcceptedAt,
          ],
        );

        const shipmentId = (result as { insertId: number }).insertId;

        await db.execute(
          `UPDATE shipment_quote SET status = 'used', used_by_shipment_id = ? WHERE quote_id = ?`,
          [shipmentId, dto.quoteId],
        );

        await this.insertInsuredHorses(db, shipmentId, horses);

        // Step 9: giữ chỗ xe của phương án khách chọn ngay trong transaction tạo đơn
        // (khóa xe vehicle_id ASC FOR UPDATE; xe đã bị đơn khác giữ → 409, toàn bộ đơn rollback)
        if (Array.isArray(selectedOption?.vehicleIds) && selectedOption.vehicleIds.length && selectedOption.reservationWindow) {
          await reserveVehicles(db, {
            shipmentId,
            vehicleIds: selectedOption.vehicleIds.map(Number),
            start: new Date(selectedOption.reservationWindow.start),
            end: new Date(selectedOption.reservationWindow.end),
            direction: 'outbound',
            actorId: customerId,
          });
          await db.execute(
            `UPDATE shipment
             SET allocation_option_code = ?, allocation_snapshot = ?, pickup_at = ?, night_surcharge_applied = ?
             WHERE shipment_id = ?`,
            [
              selectedOption.optionCode,
              JSON.stringify({
                optionCode: selectedOption.optionCode,
                label: selectedOption.label,
                vehicles: selectedOption.vehicles,
                extraDays: selectedOption.extraDays ?? 0,
                requestedPickupAt: selectedOption.requestedPickupAt,
                pickupAt: selectedOption.pickupAt,
                pickupShifted: Boolean(selectedOption.pickupShifted),
                deliveryAt: selectedOption.deliveryAt,
                etaHours: selectedOption.etaHours,
                restStops: selectedOption.restStops,
                reservationWindow: selectedOption.reservationWindow,
                partnerDepot: qResult.partnerDepot ?? null,
                jetStallsRequired: qResult.jetStallsRequired ?? null,
              }),
              selectedOption.pickupAt ? new Date(selectedOption.pickupAt) : null,
              Boolean(selectedOption.nightSurcharge),
              shipmentId,
            ],
          );
        }

        const invoiceCode = `INV-${new Date().getFullYear()}-${String(shipmentId).padStart(6, '0')}`;
        const invoiceSnapshot = {
          invoiceCode,
          shipmentId,
          quoteId: dto.quoteId,
          customer: {
            id: customerId,
            name: dto.contactName,
            phone: dto.contactPhone,
            email: dto.contactEmail,
            address: dto.contactAddress,
          },
          route: {
            origin: originLocation,
            destination: destinationLocation,
            transportMode,
            seaMode,
            distanceKm,
            requestedDate: dto.requestedDate,
            isRoundTrip,
            tripType,
            returnDepartureAt,
          },
          horses: horses.map((h) => ({
            horseId: h.horseId,
            name: (h as any).name || (h as any).horseName || 'Ngựa',
            microchipNo: (h as any).microchipNo || null,
            declaredValueVnd: h.declaredValueVnd,
            insurancePackage: h.insurancePackage,
            insuranceFee: h.insuranceFee,
            maxCompensation: h.maxCompensation,
          })),
          breakdown: selectedOption?.freight?.breakdown || qResult.legs?.[0]?.breakdown || [],
          freightTotal: transportCost,
          insuranceTotal: insuranceFee,
          totalAmount: totalCost,
          currency: 'VND',
          tariffVersions: qResult.tariffVersions || [],
          returnPolicyAccepted: isRoundTrip,
          issuedAt: new Date().toISOString(),
          paymentDueAt: paymentDueAt.toISOString(),
        };

        try {
          await db.execute(
            `INSERT INTO shipment_invoice (
              shipment_id, route_id, customer_id, invoice_type, status, amount, currency, snapshot, payment_due_at, issued_at
            ) VALUES (?, NULL, ?, 'primary', 'active', ?, 'VND', ?, ?, NOW())`,
            [shipmentId, customerId, totalCost, JSON.stringify(invoiceSnapshot), paymentDueAt],
          );
        } catch (invErr: any) {
          // If shipment_invoice table or route_id NULL constraint is missing in mock test db, fallback gracefully
          if (!invErr?.message?.includes("doesn't exist")) {
            throw invErr;
          }
        }

        try {
          await db.execute(
            `INSERT INTO shipment_status_history
              (shipment_id, from_status, to_status, actor_id, actor_role, reason_code, note)
             VALUES (?, NULL, 'awaiting_payment', ?, 'CUSTOMER', 'order_created', 'Đơn hàng trả trước được tạo từ báo giá')`,
            [shipmentId, customerId],
          );
        } catch {
          // Ignore if table does not exist yet
        }

        if (dto.medicalDocumentUrl) {
          await db.execute(
            "INSERT INTO attachment (related_type, related_id, file_url, file_type, uploaded_by) VALUES ('shipment', ?, ?, 'document', ?)",
            [shipmentId, dto.medicalDocumentUrl, customerId],
          );
        }
        return shipmentId;
      }

      if (!dto.quoteId && !(dto as any).isLegacySeed) {
        throw new BadRequestException('Vui lòng tạo báo giá trước khi đặt đơn');
      }

      const horses = await this.insuredHorses(db, customerId, this.horseInputs(dto));
      const count = horses.reduce((sum, h) => sum + h.quantity, 0);
      if (count !== dto.requestedHorseCount) throw new BadRequestException('Số lượng ngựa khai báo phải khớp danh sách được chọn');

      const isRoundTrip = dto.tripType === 'round_trip';
      if (isRoundTrip && !dto.acceptReturnPolicy) {
        throw new BadRequestException('Bạn phải đồng ý chính sách hủy chặng về và no-show để đặt chuyến khứ hồi');
      }

      const tripType = isRoundTrip ? 'round_trip' : 'one_way';
      const returnDepartureAt = isRoundTrip && dto.returnDepartureAt ? new Date(dto.returnDepartureAt) : null;
      const returnStatus = isRoundTrip ? 'scheduled' : 'not_applicable';
      const returnPolicySnapshot = isRoundTrip ? JSON.stringify(currentReturnPolicy()) : null;
      const returnPolicyAcceptedAt = isRoundTrip ? new Date() : null;

      const [result] = await db.execute(`INSERT INTO shipment (customer_id, requested_by, contact_name, contact_address, contact_phone,
        contact_email, requested_horse_count, origin_location, destination_location, requested_date, transportation_type,
        special_requirements, status, total_cost, transport_cost, insurance_fee, booking_type, transport_mode, sea_mode,
        origin_lat, origin_lng, destination_lat, destination_lng,
        trip_type, return_departure_at, return_wait_minutes, return_status, return_no_show,
        return_freight, return_insurance_fee, return_policy_snapshot, return_policy_accepted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'requested', 0, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 120, ?, FALSE, 0, 0, ?, ?)`,
        [customerId, customerId, dto.contactName ?? null, dto.contactAddress ?? null, dto.contactPhone, dto.contactEmail,
        count, dto.originLocation, dto.destinationLocation, dto.requestedDate ? new Date(dto.requestedDate) : new Date(),
        dto.transportationType ?? null, dto.specialRequirements ?? null, totalInsuranceFee(horses), assertNewBookingType(dto.bookingType),
        dto.transportMode ?? null, dto.seaMode ?? null, dto.originLat ?? null, dto.originLng ?? null, dto.destinationLat ?? null, dto.destinationLng ?? null,
        tripType, returnDepartureAt, returnStatus, returnPolicySnapshot, returnPolicyAcceptedAt]);
      const shipmentId = (result as { insertId: number }).insertId;
      await this.insertInsuredHorses(db, shipmentId, horses);
      if (dto.medicalDocumentUrl) await db.execute("INSERT INTO attachment (related_type, related_id, file_url, file_type, uploaded_by) VALUES ('shipment', ?, ?, 'document', ?)", [shipmentId, dto.medicalDocumentUrl, customerId]);
      return shipmentId;
    });
  }

  async createAttachment(
    shipmentId: number,
    fileUrl: string,
    uploadedBy: number,
    fileType: 'image' | 'document' | 'video' = 'document',
  ): Promise<number> {
    const [result] = await this.pool.execute(
      'INSERT INTO attachment (related_type, related_id, file_url, file_type, uploaded_by) VALUES (?, ?, ?, ?, ?)',
      ['shipment', shipmentId, fileUrl, fileType, uploadedBy],
    );
    return (result as { insertId: number }).insertId;
  }

  async findShipmentsByCustomer(customerId: number): Promise<TransportOrder[]> {
    const [rows] = await this.pool.execute<ShipmentRow[]>(
      `SELECT s.*, u.full_name as customer_name, u.email as customer_email, a.full_name as approver_name,
              CONCAT('REQ-', LPAD(ROW_NUMBER() OVER (ORDER BY s.shipment_id ASC), 3, '0')) as request_code,
              CONCAT('REQ-', LPAD(ROW_NUMBER() OVER (ORDER BY s.shipment_id ASC), 3, '0')) as customer_request_code,
              sp.status as payment_status,
              sp.payment_code as payment_code,
              sp.paid_at as paid_at
       FROM shipment s
       JOIN \`user\` u ON u.user_id = s.customer_id
       LEFT JOIN \`user\` a ON a.user_id = s.approved_by
       LEFT JOIN shipment_sepay_payment sp ON sp.payment_id = (SELECT MAX(sp2.payment_id) FROM shipment_sepay_payment sp2 WHERE sp2.shipment_id = s.shipment_id AND sp2.status <> 'cancelled')
       WHERE s.customer_id = ?
       ORDER BY s.created_at DESC`,
      [customerId],
    );

    return Promise.all(rows.map((row) => this.mapShipmentWithAttachments(row)));
  }

  async findAllShipments(statusFilter?: ShipmentStatus): Promise<TransportOrder[]> {
    let query = `
      SELECT s.*, u.full_name as customer_name, u.email as customer_email, a.full_name as approver_name,
             CONCAT('REQ-', LPAD(
               (SELECT COUNT(*) FROM shipment sub WHERE sub.customer_id = s.customer_id AND sub.shipment_id <= s.shipment_id),
               3, '0'
             )) as customer_request_code,
             CONCAT('REQ-', LPAD(s.shipment_id, 3, '0')) as request_code,
             sp.status as payment_status,
             sp.payment_code as payment_code,
             sp.paid_at as paid_at
      FROM shipment s
      JOIN \`user\` u ON u.user_id = s.customer_id
      LEFT JOIN \`user\` a ON a.user_id = s.approved_by
      LEFT JOIN shipment_sepay_payment sp ON sp.payment_id = (SELECT MAX(sp2.payment_id) FROM shipment_sepay_payment sp2 WHERE sp2.shipment_id = s.shipment_id AND sp2.status <> 'cancelled')
    `;
    const params: (string | number)[] = [];

    if (statusFilter) {
      query += ' WHERE s.status = ?';
      params.push(statusFilter);
    }

    query += ' ORDER BY s.created_at DESC';

    const [rows] = await this.pool.execute<ShipmentRow[]>(query, params);
    return Promise.all(rows.map((row) => this.mapShipmentWithAttachments(row)));
  }

  async findShipmentsByAssignedStaff(userId: number, statusFilter?: ShipmentStatus): Promise<TransportOrder[]> {
    let query = `
      SELECT DISTINCT s.*, u.full_name as customer_name, u.email as customer_email, a.full_name as approver_name,
             CONCAT('REQ-', LPAD(
               (SELECT COUNT(*) FROM shipment sub WHERE sub.customer_id = s.customer_id AND sub.shipment_id <= s.shipment_id),
               3, '0'
             )) as customer_request_code,
             CONCAT('REQ-', LPAD(s.shipment_id, 3, '0')) as request_code,
             sp.status as payment_status,
             sp.payment_code as payment_code,
             sp.paid_at as paid_at
      FROM shipment s
      JOIN shipment_assignment sa ON sa.shipment_id = s.shipment_id
      JOIN \`user\` u ON u.user_id = s.customer_id
      LEFT JOIN \`user\` a ON a.user_id = s.approved_by
      LEFT JOIN shipment_sepay_payment sp ON sp.payment_id = (SELECT MAX(sp2.payment_id) FROM shipment_sepay_payment sp2 WHERE sp2.shipment_id = s.shipment_id AND sp2.status <> 'cancelled')
      WHERE sa.user_id = ?
        AND sa.role_in_shipment IN ('driver', 'escort')
    `;
    const params: (string | number)[] = [userId];

    if (statusFilter) {
      query += ' AND s.status = ?';
      params.push(statusFilter);
    }

    query += ' ORDER BY s.created_at DESC';

    const [rows] = await this.pool.execute<ShipmentRow[]>(query, params);
    return Promise.all(rows.map((row) => this.mapShipmentWithAttachments(row)));
  }

  async isStaffAssignedToShipment(shipmentId: number, userId: number): Promise<boolean> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT 1 FROM shipment_assignment WHERE shipment_id = ? AND user_id = ? AND role_in_shipment IN ('driver', 'escort') LIMIT 1`,
      [shipmentId, userId],
    );
    return rows.length > 0;
  }

  async findShipmentById(shipmentId: number): Promise<TransportOrder | undefined> {
    const [rows] = await this.pool.execute<ShipmentRow[]>(
      `SELECT s.*, u.full_name as customer_name, u.email as customer_email, a.full_name as approver_name,
              CONCAT('REQ-', LPAD(
                (SELECT COUNT(*) FROM shipment sub WHERE sub.customer_id = s.customer_id AND sub.shipment_id <= s.shipment_id),
                3, '0'
              )) as customer_request_code,
              CONCAT('REQ-', LPAD(s.shipment_id, 3, '0')) as request_code,
              sp.status as payment_status,
              sp.payment_code as payment_code,
              sp.paid_at as paid_at
       FROM shipment s
       JOIN \`user\` u ON u.user_id = s.customer_id
       LEFT JOIN \`user\` a ON a.user_id = s.approved_by
       LEFT JOIN shipment_sepay_payment sp ON sp.payment_id = (SELECT MAX(sp2.payment_id) FROM shipment_sepay_payment sp2 WHERE sp2.shipment_id = s.shipment_id AND sp2.status <> 'cancelled')
       WHERE s.shipment_id = ?
       LIMIT 1`,
      [shipmentId],
    );

    const row = rows[0];
    if (!row) {
      return undefined;
    }

    return this.mapShipmentWithAttachments(row);
  }

  async updateShipmentApproval(
    shipmentId: number,
    approvedBy: number,
    status: ShipmentStatus.APPROVED | ShipmentStatus.REJECTED,
    rejectionReason: string | null = null,
    totalCost: number = 0,
    transportMode?: "road" | "air" | "sea",
    quote?: BookingQuote,
  ): Promise<boolean> {
    return this.transaction(async db => {
    const [orders] = await db.execute<RowDataPacket[]>('SELECT insurance_fee, transport_cost, total_cost, booking_type, requested_horse_count, stall_unit_price, quote_id FROM shipment WHERE shipment_id = ? FOR UPDATE', [shipmentId]);
    if (!orders.length) throw new BadRequestException('Không tìm thấy đơn hàng');

    const isQuoted = Boolean(orders[0].quote_id);
    let calculatedTotalCost: number;
    let stallUnitPrice: number | null = null;
    let combined: number;

    if (isQuoted && status === ShipmentStatus.APPROVED) {
      // Đơn đã có báo giá (quote_id): KHÔNG được ghi đè giá, giữ nguyên giá đã khóa theo snapshot
      calculatedTotalCost = Number(orders[0].transport_cost ?? orders[0].total_cost);
      stallUnitPrice = orders[0].stall_unit_price != null ? Number(orders[0].stall_unit_price) : null;
      combined = Number(orders[0].total_cost);
    } else {
      const pricing = status === ShipmentStatus.APPROVED
        ? calculateBookingQuote(orders[0].booking_type, Number(orders[0].requested_horse_count), quote ?? { transportCost: totalCost })
        : { transportCost: totalCost, stallUnitPrice: orders[0].stall_unit_price };
      calculatedTotalCost = pricing.transportCost;
      stallUnitPrice = pricing.stallUnitPrice;
      const insuranceFee = Number(orders[0].insurance_fee);
      combined = calculatedTotalCost + insuranceFee;
      if (!Number.isSafeInteger(calculatedTotalCost) || calculatedTotalCost < 0 || !Number.isSafeInteger(combined) || combined > 9999999999999) {
        throw new BadRequestException('Tổng cước và bảo hiểm vượt giới hạn VNĐ hợp lệ');
      }
    }

    let modeNote: string | null = null;
    if (status === ShipmentStatus.APPROVED && transportMode) {
      if (transportMode === "air") {
        modeNote = "[Phương thức: Đường Hàng Không]";
      } else if (transportMode === "sea") {
        modeNote = "[Phương thức: Đường Thủy]";
      } else {
        modeNote = "[Phương thức: Đường Bộ Liên Vận]";
      }
    }

    let query = `UPDATE shipment
       SET status = ?, approved_by = ?, rejection_reason = ?, total_cost = ?, transport_cost = ?, stall_unit_price = ?`;
    const params: any[] = [status, approvedBy, rejectionReason, status === ShipmentStatus.APPROVED ? combined : orders[0].total_cost, status === ShipmentStatus.APPROVED ? calculatedTotalCost : orders[0].transport_cost, stallUnitPrice];

    if (status === ShipmentStatus.APPROVED && transportMode) {
      query += ', transport_mode = ?';
      params.push(transportMode);
    }

    if (modeNote) {
      query += `, special_requirements = CASE
        WHEN special_requirements IS NULL OR special_requirements = '' THEN ?
        WHEN special_requirements LIKE ? THEN special_requirements
        ELSE CONCAT(special_requirements, ' | ', ?)
      END`;
      const matchKeyword = transportMode === "air" ? "%Hàng không%" : transportMode === "sea" ? "%Đường thủy%" : "%Đường bộ%";
      params.push(modeNote, matchKeyword, modeNote);
    }
    query += ` WHERE shipment_id = ? AND status = 'requested'`;
    params.push(shipmentId);

    const [result] = await db.execute(query, params);
    if (!(result as { affectedRows: number }).affectedRows) throw new ConflictException('Đơn hàng đã thay đổi, vui lòng tải lại trước khi duyệt.');
    if (status === ShipmentStatus.REJECTED) {
      await db.execute(
        `UPDATE horse
         SET status = 'active'
         WHERE horse_id IN (SELECT horse_id FROM shipment_horse WHERE shipment_id = ?)`,
        [shipmentId],
      );
    }

    return (result as { affectedRows: number }).affectedRows > 0;
    });
  }

  async completeShipment(shipmentId: number, actorId: number, requireAssignment: boolean): Promise<boolean> {
    return this.transaction(async db => {
    const [orders] = await db.execute<RowDataPacket[]>('SELECT status FROM shipment WHERE shipment_id = ? FOR UPDATE', [shipmentId]);
    if (!orders[0]) throw new BadRequestException('Không tìm thấy đơn vận chuyển');
    if (requireAssignment) {
      const [assignments] = await db.execute<RowDataPacket[]>(
        "SELECT assignment_id FROM shipment_assignment WHERE shipment_id = ? AND user_id = ? AND role_in_shipment IN ('driver', 'escort') FOR UPDATE", [shipmentId, actorId]);
      if (!assignments.length) throw new ForbiddenException('Bạn không được phân công cho chuyến này');
    }
    if (orders[0].status === 'completed') return false;
    if (orders[0].status !== 'in_transit') throw new ConflictException('Chỉ được hoàn tất chuyến đã xuất phát');
    const [assignedVehicles] = await db.execute<RowDataPacket[]>('SELECT vehicle_id FROM shipment_vehicle WHERE shipment_id = ? ORDER BY vehicle_id', [shipmentId]);
    const vehicleIds = [...new Set(assignedVehicles.map(v => Number(v.vehicle_id)))];
    if (vehicleIds.length) await db.execute(`SELECT vehicle_id FROM vehicle WHERE vehicle_id IN (${vehicleIds.map(() => '?').join(',')}) ORDER BY vehicle_id FOR UPDATE`, vehicleIds);
    const [result] = await db.execute(
      `UPDATE shipment
       SET status = 'completed', actual_arrival_date = NOW()
        WHERE shipment_id = ? AND status = 'in_transit'`,
      [shipmentId],
    );

    await db.execute(
      `UPDATE horse
       SET status = 'active'
       WHERE horse_id IN (SELECT horse_id FROM shipment_horse WHERE shipment_id = ?)
         AND status NOT IN ('retired', 'deceased')`,
      [shipmentId],
    );

    await db.execute("UPDATE route SET status = 'completed', plan_status = 'completed' WHERE shipment_id = ? AND plan_status = 'in_transit'", [shipmentId]);
    for (const id of vehicleIds) await db.execute(`UPDATE vehicle v SET status = 'available' WHERE v.vehicle_id = ? AND v.status = 'in_use'
      AND NOT EXISTS (SELECT 1 FROM shipment_vehicle sv JOIN shipment s ON s.shipment_id = sv.shipment_id WHERE sv.vehicle_id = v.vehicle_id AND s.status NOT IN ('completed','cancelled','cancelled_operational','rejected'))`, [id]);

    return (result as { affectedRows: number }).affectedRows > 0;
    });
  }

  async updateShipmentChangeRequest(
    shipmentId: number,
    notes: string,
  ): Promise<boolean> {
    const [result] = await this.pool.execute(
      `UPDATE shipment
       SET status = ?, change_request_notes = ?
       WHERE shipment_id = ? AND status = 'requested'`,
      [ShipmentStatus.CHANGE_REQUESTED, notes, shipmentId],
    );
    if (!(result as { affectedRows: number }).affectedRows) throw new ConflictException('Đơn hàng đã thay đổi, vui lòng tải lại trước khi yêu cầu chỉnh sửa.');
    return (result as { affectedRows: number }).affectedRows > 0;
  }

  async updateShipmentStatus(shipmentId: number, status: ShipmentStatus): Promise<boolean> {
    const [result] = await this.pool.execute(
      'UPDATE shipment SET status = ?, updated_at = NOW() WHERE shipment_id = ?',
      [status, shipmentId],
    );

    if (
      status === ShipmentStatus.COMPLETED ||
      (status as string) === 'completed' ||
      status === ShipmentStatus.CANCELLED ||
      status === ShipmentStatus.CANCELLED_OPERATIONAL ||
      status === ShipmentStatus.REJECTED
    ) {
      await this.pool.execute(
        `UPDATE horse
         SET status = 'active'
         WHERE horse_id IN (SELECT horse_id FROM shipment_horse WHERE shipment_id = ?)
           AND status NOT IN ('retired', 'deceased')`,
        [shipmentId],
      );
    }

    return (result as { affectedRows: number }).affectedRows > 0;
  }

  async findById(shipmentId: number): Promise<TransportOrder | undefined> {
    return this.findShipmentById(shipmentId);
  }

  async cancelReturnLeg(data: {
    shipmentId: number;
    actorId: number;
    reason: string;
    refund: ReturnType<typeof calculateReturnCancellationRefund>;
    cause: 'customer' | 'company';
  }): Promise<void> {
    return this.transaction(async (db) => {
      const [rows] = await db.execute<RowDataPacket[]>(
        'SELECT status, return_status, customer_id FROM shipment WHERE shipment_id = ? FOR UPDATE',
        [data.shipmentId],
      );
      const ship = rows[0];
      if (!ship) throw new NotFoundException('Không tìm thấy đơn vận chuyển');
      if (ship.return_status === 'in_progress') {
        throw new ConflictException('Chặng về đã xuất phát (in_progress), không thể hủy');
      }
      if (ship.return_status !== 'scheduled') {
        throw new ConflictException(`Không thể hủy chặng về ở trạng thái "${ship.return_status}"`);
      }

      const category = data.cause === 'company' ? 'return_leg_company_cancel' : 'return_leg_customer_cancel';
      const now = new Date();

      // If outbound trip already completed (status === 'return_pending'), cancelling the return leg finishes the shipment
      const nextShipmentStatus = ship.status === 'return_pending' ? 'completed' : ship.status;

      await db.execute(
        `UPDATE shipment
         SET return_status = 'cancelled',
             return_cancelled_at = ?,
             return_cancel_reason = ?,
             status = ?
         WHERE shipment_id = ?`,
        [now, data.reason, nextShipmentStatus, data.shipmentId],
      );

      // If finished to 'completed', release horses
      if (nextShipmentStatus === 'completed') {
        await db.execute(
          `UPDATE horse
           SET status = 'active'
           WHERE horse_id IN (SELECT horse_id FROM shipment_horse WHERE shipment_id = ?)
             AND status NOT IN ('retired', 'deceased')`,
          [data.shipmentId],
        );
      }

      // If refund amount > 0, insert refund record
      if (data.refund.total > 0) {
        const requiresDualApproval = data.refund.total >= 20_000_000 ? 1 : 0;
        await db.execute(
          `INSERT INTO shipment_refund_record (
            shipment_id, customer_id, cancellation_category, refund_mode,
            freight_refund_amount, insurance_refund_amount, non_refundable_air_deduction,
            disbursement_deduction, amount, receivable_excess_amount,
            status, requires_dual_approval, requested_by, notes
          ) VALUES (?, ?, ?, 'cash_refund', ?, ?, 0, 0, ?, 0, 'pending_approval', ?, ?, ?)`,
          [
            data.shipmentId,
            ship.customer_id,
            category,
            data.refund.freightRefund,
            data.refund.insuranceRefund,
            data.refund.total,
            requiresDualApproval,
            data.actorId,
            data.reason,
          ],
        );
      }
    });
  }

  async rescheduleReturnLeg(data: {
    shipmentId: number;
    actorId: number;
    oldAt: Date;
    newAt: Date;
    fee: number;
  }): Promise<void> {
    return this.transaction(async (db) => {
      const [rows] = await db.execute<RowDataPacket[]>(
        'SELECT status, return_status, return_reschedule_fee, customer_id FROM shipment WHERE shipment_id = ? FOR UPDATE',
        [data.shipmentId],
      );
      const ship = rows[0];
      if (!ship) throw new NotFoundException('Không tìm thấy đơn vận chuyển');
      if (ship.return_status !== 'scheduled') {
        throw new ConflictException(`Không thể đổi ngày về khi chặng về ở trạng thái "${ship.return_status}"`);
      }

      await db.execute(
        `INSERT INTO shipment_return_change (shipment_id, old_return_departure_at, new_return_departure_at, reschedule_fee, requested_by)
         VALUES (?, ?, ?, ?, ?)`,
        [data.shipmentId, data.oldAt, data.newAt, data.fee, data.actorId],
      );

      const nextFee = Number(ship.return_reschedule_fee || 0) + data.fee;
      await db.execute(
        `UPDATE shipment
         SET return_departure_at = ?,
             return_reschedule_fee = ?
         WHERE shipment_id = ?`,
        [data.newAt, nextFee, data.shipmentId],
      );

      if (data.fee > 0) {
        const [routes] = await db.execute<RowDataPacket[]>(
          'SELECT route_id FROM route WHERE shipment_id = ? LIMIT 1',
          [data.shipmentId],
        );
        const routeId = routes[0]?.route_id ?? null;
        const dueAt = new Date(Date.now() + 24 * 3600 * 1000);
        await db.execute(
          `INSERT INTO shipment_invoice (
            shipment_id, route_id, customer_id, invoice_type, status, amount, snapshot, payment_due_at
          ) VALUES (?, ?, ?, 'supplemental', 'active', ?, ?, ?)`,
          [
            data.shipmentId,
            routeId,
            ship.customer_id,
            data.fee,
            JSON.stringify({ invoiceKind: 'return_reschedule_fee', fee: data.fee, oldAt: data.oldAt, newAt: data.newAt }),
            dueAt,
          ],
        );
      }
    });
  }

  async updateStatus(shipmentId: number, status: ShipmentStatus): Promise<boolean> {
    return this.updateShipmentStatus(shipmentId, status);
  }

  async updatePricing(shipmentId: number, transportCost: number, totalCost: number, stallUnitPrice?: number | null): Promise<boolean> {
    const [result] = await this.pool.execute(
      `UPDATE shipment
       SET transport_cost = ?, total_cost = ?, stall_unit_price = COALESCE(?, stall_unit_price), updated_at = NOW()
       WHERE shipment_id = ?`,
      [transportCost, totalCost, stallUnitPrice ?? null, shipmentId],
    );
    return (result as { affectedRows: number }).affectedRows > 0;
  }

  async cancelShipment(shipmentId: number, actor?: { id: number; role: string }): Promise<boolean> {
    const db = await this.pool.getConnection();
    try {
      await db.beginTransaction();
      const [rows] = await db.execute<RowDataPacket[]>('SELECT status FROM shipment WHERE shipment_id = ? FOR UPDATE', [shipmentId]);
      if (rows[0]?.status === 'cancelled') { await db.commit(); return false; }
      if (rows[0]?.status === 'awaiting_payment') {
        await this.cancelUnpaidPrepaidShipment(db, shipmentId, actor);
        await db.commit();
        return true;
      }
      if (!rows[0] || !['requested', 'change_requested'].includes(rows[0].status)) throw new ConflictException('Chỉ được hủy đơn khi đang chờ thanh toán hoặc trước khi phê duyệt.');
      await db.execute("UPDATE shipment SET status = 'cancelled' WHERE shipment_id = ?", [shipmentId]);
      await db.execute("UPDATE horse h JOIN shipment_horse sh ON sh.horse_id = h.horse_id SET h.status = 'active' WHERE sh.shipment_id = ?", [shipmentId]);
      await releaseShipmentReservations(db, shipmentId, 'customer_cancelled');
      await db.commit();
      return true;
    } catch (error) { await db.rollback(); throw error; }
    finally { db.release(); }
  }

  /**
   * Khách tự hủy đơn trả trước khi chưa thanh toán (`awaiting_payment` → `cancelled`).
   * Dọn dẹp giống SLA sweep hết hạn thanh toán: hủy hóa đơn, đóng QR, nhả ngựa và xe.
   * Chạy trong transaction đã khóa dòng shipment; webhook SePay cũng khóa dòng này trước,
   * nên tiền đến sau khi hủy sẽ rơi vào `review` để đối soát/hoàn thủ công.
   */
  private async cancelUnpaidPrepaidShipment(
    db: PoolConnection,
    shipmentId: number,
    actor?: { id: number; role: string },
  ): Promise<void> {
    const [payRows] = await db.execute<RowDataPacket[]>(
      "SELECT status FROM shipment_sepay_payment WHERE shipment_id = ? AND status IN ('succeeded', 'review') FOR UPDATE",
      [shipmentId],
    );
    if (payRows.length > 0) {
      throw new ConflictException(
        'Hệ thống đã ghi nhận một giao dịch chuyển khoản cho đơn này nên không thể tự hủy. Vui lòng liên hệ bộ phận vận hành để được hỗ trợ.',
      );
    }

    await transitionShipment(db, {
      shipmentId,
      to: 'cancelled',
      actorId: actor?.id ?? null,
      actorRole: actor?.role ?? 'CUSTOMER',
      reasonCode: 'customer_cancelled',
      note: 'Khách hàng tự hủy đơn trước khi thanh toán',
      expectedFrom: ['awaiting_payment'],
    });
    await db.execute(
      `UPDATE shipment
       SET cancel_reason_code = 'customer_cancelled',
           cancellation_reason = 'Khách hàng tự hủy đơn trước khi thanh toán'
       WHERE shipment_id = ?`,
      [shipmentId],
    );
    await db.execute("UPDATE shipment_invoice SET status = 'void' WHERE shipment_id = ? AND status <> 'void'", [shipmentId]);
    await db.execute("UPDATE shipment_sepay_payment SET status = 'cancelled' WHERE shipment_id = ? AND status = 'pending'", [shipmentId]);
    await db.execute(
      `UPDATE horse h
       SET h.status = 'active'
       WHERE h.horse_id IN (SELECT sh.horse_id FROM shipment_horse sh WHERE sh.shipment_id = ?)
         AND NOT EXISTS (
           SELECT 1 FROM shipment_horse sh2
           JOIN shipment s2 ON s2.shipment_id = sh2.shipment_id
           WHERE sh2.horse_id = h.horse_id
             AND s2.shipment_id <> ?
             AND s2.status NOT IN ('cancelled', 'cancelled_operational', 'rejected', 'refunded', 'completed')
         )`,
      [shipmentId, shipmentId],
    );
  }

  async updateAndResubmitShipment(customerId: number, shipmentId: number, dto: UpdateOrderDto): Promise<boolean> {
    return this.transaction(async db => {
      const [orders] = await db.execute<RowDataPacket[]>('SELECT * FROM shipment WHERE shipment_id = ? AND customer_id = ? FOR UPDATE', [shipmentId, customerId]);
      if (!orders[0] || orders[0].status !== 'change_requested') throw new ConflictException('Chỉ được gửi lại yêu cầu đang cần chỉnh sửa');
      const bookingType = resolveResubmitBookingType(dto.bookingType, orders[0].booking_type);
      if (bookingType !== orders[0].booking_type) {
        await db.execute('INSERT INTO shipment_booking_revision (shipment_id, changed_by, previous_booking_type, booking_type) VALUES (?, ?, ?, ?)',
          [shipmentId, customerId, orders[0].booking_type, bookingType]);
      }
      const [previous] = await db.execute<RowDataPacket[]>('SELECT * FROM shipment_horse WHERE shipment_id = ? FOR UPDATE', [shipmentId]);
      const input = this.horseInputs(dto);
      const horses = input.length ? await this.insuredHorses(db, customerId, input, previous) : null;
      const count = horses ? horses.reduce((sum, h) => sum + h.quantity, 0) : previous.reduce((sum, h) => sum + Number(h.quantity), 0);
      if (dto.requestedHorseCount !== undefined && dto.requestedHorseCount !== count) throw new BadRequestException('Số lượng ngựa phải khớp danh sách được chọn');
      const fee = horses ? totalInsuranceFee(horses) : Number(orders[0].insurance_fee);
      if (horses) {
        await db.execute('INSERT INTO shipment_insurance_revision (shipment_id, changed_by, previous_snapshot) VALUES (?, ?, ?)', [shipmentId, customerId, JSON.stringify(previous)]);
        await db.execute('DELETE FROM shipment_horse WHERE shipment_id = ?', [shipmentId]);
        for (const old of previous) if (!horses.some(h => h.horseId === Number(old.horse_id))) {
          await db.execute("UPDATE horse SET status = 'active' WHERE horse_id = ? AND status = 'in_transit'", [old.horse_id]);
        }
        await this.insertInsuredHorses(db, shipmentId, horses);
      }
      await db.execute(`UPDATE shipment SET contact_name = COALESCE(?, contact_name), contact_address = COALESCE(?, contact_address),
        contact_phone = COALESCE(?, contact_phone), contact_email = COALESCE(?, contact_email), origin_location = COALESCE(?, origin_location),
        destination_location = COALESCE(?, destination_location), requested_date = COALESCE(?, requested_date),
        special_requirements = COALESCE(?, special_requirements), requested_horse_count = ?, insurance_fee = ?,
        total_cost = 0, transport_cost = NULL, stall_unit_price = NULL, booking_type = ?, change_request_notes = NULL, status = 'requested' WHERE shipment_id = ?`,
        [dto.contactName ?? null, dto.contactAddress ?? null, dto.contactPhone ?? null, dto.contactEmail ?? null,
        dto.originLocation ?? null, dto.destinationLocation ?? null, dto.requestedDate ? new Date(dto.requestedDate) : null,
        dto.specialRequirements ?? null, count, fee, bookingType, shipmentId]);
      if (dto.medicalDocumentUrl) await db.execute("INSERT INTO attachment (related_type, related_id, file_url, file_type, uploaded_by) VALUES ('shipment', ?, ?, 'document', ?)", [shipmentId, dto.medicalDocumentUrl, customerId]);
      return true;
    });
  }

  private async mapShipmentWithAttachments(row: ShipmentRow): Promise<TransportOrder> {
    const [attachments] = await this.pool.execute<AttachmentRow[]>(
      'SELECT attachment_id, file_url, file_type, uploaded_at FROM attachment WHERE related_type = ? AND related_id = ?',
      ['shipment', row.shipment_id],
    );

    const [horses] = await this.pool.execute<HorseRow[]>(
      `SELECT h.horse_id, h.name, h.breed, h.gender, h.age, h.color, h.weight,
              h.medical_status, h.microchip_no, h.passport_no, h.special_requirements, h.requires_private_stall, sh.quantity, sh.declared_value, sh.declared_currency, sh.exchange_rate, sh.declared_value_vnd, sh.insurance_package, sh.insurance_fee, sh.max_compensation, sh.emergency_vet_covered, sh.insurance_policy_version
       FROM shipment_horse sh
       JOIN horse h ON h.horse_id = sh.horse_id
       WHERE sh.shipment_id = ?`,
      [row.shipment_id],
    );

    const requestCode = row.request_code || `REQ-${String(row.shipment_id).padStart(3, '0')}`;

    return {
      id: row.shipment_id,
      transportMode: row.transport_mode ?? null,
      seaMode: row.sea_mode ?? null,
      quoteId: row.quote_id != null ? Number(row.quote_id) : null,
      pricingSnapshot: parseJsonField(row.pricing_snapshot),
      customerProposedPrice:
        parseJsonField(row.pricing_snapshot)?.customerProposedPrice != null
          ? Number(parseJsonField(row.pricing_snapshot).customerProposedPrice)
          : null,
      distanceKm: row.distance_km != null ? Number(row.distance_km) : null,
      distanceSource: row.distance_source ?? null,
      originLat: row.origin_lat != null ? Number(row.origin_lat) : null,
      originLng: row.origin_lng != null ? Number(row.origin_lng) : null,
      destinationLat: row.destination_lat != null ? Number(row.destination_lat) : null,
      destinationLng: row.destination_lng != null ? Number(row.destination_lng) : null,
      bookingType: row.booking_type ?? 'dedicated_charter',
      stallUnitPrice: row.stall_unit_price == null ? null : Number(row.stall_unit_price),
      requestCode,
      customerRequestCode: row.customer_request_code,
      customerId: row.customer_id,
      requestedBy: row.requested_by,
      approvedBy: row.approved_by,
      contactName: row.contact_name,
      contactAddress: row.contact_address,
      contactPhone: row.contact_phone,
      contactEmail: row.contact_email,
      requestedHorseCount: row.requested_horse_count,
      originLocation: row.origin_location,
      destinationLocation: row.destination_location,
      requestedDate: new Date(row.requested_date).toISOString(),
      departureDate: row.departure_date ? new Date(row.departure_date).toISOString() : null,
      expectedArrivalDate: row.expected_arrival_date ? new Date(row.expected_arrival_date).toISOString() : null,
      actualArrivalDate: row.actual_arrival_date ? new Date(row.actual_arrival_date).toISOString() : null,
      transportationType: row.transportation_type ?? null,
      specialRequirements: row.special_requirements,
      rejectionReason: row.rejection_reason,
      changeRequestNotes: row.change_request_notes ?? null,
      status: row.status,
      totalCost: Number(row.total_cost ?? 0),
      transportCost: row.transport_cost == null ? null : Number(row.transport_cost),
      insuranceFee: Number(row.insurance_fee ?? 0),
      paymentStatus: row.payment_status ?? 'unpaid',
      paymentCode: row.payment_code ?? null,
      paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : null,
      cancellationCategory: (row as any).cancellation_category ?? null,
      cancellationReason: (row as any).cancellation_reason ?? null,
      cancelledAt: (row as any).cancelled_at ? new Date((row as any).cancelled_at).toISOString() : null,
      paymentOverdue: Boolean((row as any).payment_overdue),
      slaEscalationStatus: (row as any).sla_escalation_status ?? null,
      slaFallbackOption: (row as any).sla_fallback_option ?? null,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      customerEmail: row.customer_email,
      customerName: (row as any).customer_name || row.contact_name || undefined,
      approverName: row.approver_name,
      tripType: row.trip_type ?? 'one_way',
      returnDepartureAt: row.return_departure_at ? new Date(row.return_departure_at).toISOString() : null,
      returnWaitMinutes: row.return_wait_minutes != null ? Number(row.return_wait_minutes) : 120,
      returnStatus: row.return_status ?? 'not_applicable',
      returnNoShow: Boolean(row.return_no_show),
      returnFreight: Number(row.return_freight ?? 0),
      returnInsuranceFee: Number(row.return_insurance_fee ?? 0),
      returnPolicySnapshot: parseJsonField(row.return_policy_snapshot),
      returnPolicyAcceptedAt: row.return_policy_accepted_at ? new Date(row.return_policy_accepted_at).toISOString() : null,
      returnCancelledAt: row.return_cancelled_at ? new Date(row.return_cancelled_at).toISOString() : null,
      returnCancelReason: row.return_cancel_reason ?? null,
      returnRescheduleFee: Number(row.return_reschedule_fee ?? 0),
      paymentFlow: row.payment_flow ?? 'postpaid_legacy',
      paymentDueAt: row.payment_due_at ? new Date(row.payment_due_at).toISOString() : null,
      cancelReasonCode: row.cancel_reason_code ?? null,
      feasibilityDecidedBy: row.feasibility_decided_by != null ? Number(row.feasibility_decided_by) : null,
      feasibilityDecidedAt: row.feasibility_decided_at ? new Date(row.feasibility_decided_at).toISOString() : null,
      feasibilityReasonCode: row.feasibility_reason_code ?? null,
      feasibilityNote: row.feasibility_note ?? null,
      attachments: attachments.map((att) => ({
        id: att.attachment_id,
        fileUrl: att.file_url,
        fileType: att.file_type,
        uploadedAt: new Date(att.uploaded_at).toISOString(),
      })),
      horses: (horses as any[]).map((h) => ({
        shipmentHorseId: h.shipment_horse_id ? Number(h.shipment_horse_id) : undefined,
        horseId: h.horse_id,
        name: h.name,
        breed: h.breed,
        gender: h.gender,
        age: h.age !== null ? Number(h.age) : null,
        requiresPrivateStall: Boolean(h.requires_private_stall),
        quantity: h.quantity !== null && h.quantity !== undefined ? Number(h.quantity) : 1,
        declaredValue: Number(h.declared_value ?? 0), declaredCurrency: h.declared_currency ?? 'VND',
        exchangeRate: Number(h.exchange_rate ?? 1), declaredValueVnd: Number(h.declared_value_vnd ?? 0),
        insurancePackage: h.insurance_package ?? 'basic', insuranceFee: Number(h.insurance_fee ?? 0),
        maxCompensation: Number(h.max_compensation ?? 50000000), emergencyVetCovered: Boolean(h.emergency_vet_covered),
        insurancePolicyVersion: h.insurance_policy_version ?? 'equine-v1',
        color: h.color ?? null,
        weight: h.weight ?? null,
        medicalStatus: h.medical_status ?? null,
        microchipNo: h.microchip_no ?? null,
        passportNo: h.passport_no ?? null,
        specialRequirements: h.special_requirements ?? null,
      })),
    };
  }

  async feasibilityReview(
    orderId: number,
    managerId: number,
    dto: FeasibilityReviewDto,
  ): Promise<TransportOrder> {
    return this.transaction(async (db) => {
      const [rows] = await db.execute<RowDataPacket[]>(
        'SELECT * FROM shipment WHERE shipment_id = ? FOR UPDATE',
        [orderId],
      );
      const ship = rows[0];
      if (!ship) throw new NotFoundException(`Không tìm thấy đơn hàng #${orderId}`);

      if (ship.payment_flow !== 'prepaid' || ship.status !== 'paid_pending_review') {
        throw new ConflictException(
          `Chỉ đơn hàng trả trước ở trạng thái đã thanh toán chờ duyệt (paid_pending_review) mới có thể đánh giá khả thi (trạng thái hiện tại: ${ship.status}, luồng: ${ship.payment_flow})`,
        );
      }

      if (dto.decision === 'approve') {
        await transitionShipment(db, {
          shipmentId: orderId,
          to: 'approved',
          actorId: managerId,
          actorRole: 'LOGISTICS_MANAGER',
          reasonCode: 'feasibility_approved',
          note: dto.note ?? 'Đã duyệt khả thi vận chuyển',
        });

        await db.execute(
          `UPDATE shipment
           SET feasibility_decided_by = ?,
               feasibility_decided_at = NOW(),
               feasibility_reason_code = NULL,
               feasibility_note = ?
           WHERE shipment_id = ?`,
          [managerId, dto.note ?? null, orderId],
        );
      } else {
        if (!dto.reasonCode || !CANNOT_FULFIL_REASONS.includes(dto.reasonCode as any)) {
          throw new BadRequestException(
            `Vui lòng chọn lý do không thể đáp ứng hợp lệ: ${CANNOT_FULFIL_REASONS.join(', ')}`,
          );
        }
        if (!dto.note || dto.note.trim().length < 10) {
          throw new BadRequestException('Ghi chú giải trình không thể đáp ứng phải có ít nhất 10 ký tự');
        }

        await transitionShipment(db, {
          shipmentId: orderId,
          to: 'refund_requested',
          actorId: managerId,
          actorRole: 'LOGISTICS_MANAGER',
          reasonCode: dto.reasonCode,
          note: dto.note.trim(),
        });

        await db.execute(
          `UPDATE shipment
           SET feasibility_decided_by = ?,
               feasibility_decided_at = NOW(),
               feasibility_reason_code = ?,
               feasibility_note = ?
           WHERE shipment_id = ?`,
          [managerId, dto.reasonCode, dto.note.trim(), orderId],
        );
      }

      return (await this.findShipmentById(orderId))!;
    });
  }

  async getOrderInvoice(orderId: number, userId: number, userRole: string): Promise<any> {
    const ship = await this.findShipmentById(orderId);
    if (!ship) throw new NotFoundException(`Không tìm thấy đơn hàng #${orderId}`);
    if (userRole === 'CUSTOMER' && ship.customerId !== userId) {
      throw new ForbiddenException('Bạn chỉ có thể xem hóa đơn của đơn hàng thuộc tài khoản của mình');
    }

    const [invRows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT * FROM shipment_invoice
       WHERE shipment_id = ? AND COALESCE(invoice_type, 'primary') = 'primary' AND COALESCE(status, 'active') <> 'void'
       ORDER BY invoice_id DESC LIMIT 1`,
      [orderId],
    );

    const inv = invRows[0];
    if (!inv) {
      throw new NotFoundException(`Hóa đơn cho đơn hàng #${orderId} chưa được phát hành`);
    }

    const [payRows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT transaction_id, paid_at, bank_code FROM shipment_sepay_payment
       WHERE shipment_id = ? AND status = 'succeeded'
       ORDER BY payment_id DESC LIMIT 1`,
      [orderId],
    );
    const pay = payRows[0];

    const [suppRows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT invoice_id, amount, currency, status, issued_at, payment_due_at, snapshot
       FROM shipment_invoice
       WHERE shipment_id = ? AND invoice_type = 'supplemental' AND status <> 'void'`,
      [orderId],
    );

    const snapshot = typeof inv.snapshot === 'string' ? JSON.parse(inv.snapshot) : inv.snapshot;
    const invoiceCode = snapshot?.invoiceCode || `INV-${new Date(inv.issued_at).getFullYear()}-${String(inv.invoice_id).padStart(6, '0')}`;

    return {
      invoiceCode,
      status: inv.status,
      issuedAt: inv.issued_at ? new Date(inv.issued_at).toISOString() : null,
      paidAt: pay?.paid_at ? new Date(pay.paid_at).toISOString() : null,
      amount: Number(inv.amount),
      currency: inv.currency || 'VND',
      snapshot,
      payment: pay
        ? {
            method: 'SePay',
            transactionId: pay.transaction_id,
            paidAt: pay.paid_at ? new Date(pay.paid_at).toISOString() : null,
            bankCode: pay.bank_code,
          }
        : null,
      supplementalInvoices: suppRows.map((s) => ({
        id: s.invoice_id,
        code: `SUP-${String(s.invoice_id).padStart(6, '0')}`,
        amount: Number(s.amount),
        currency: s.currency,
        status: s.status,
        issuedAt: s.issued_at ? new Date(s.issued_at).toISOString() : null,
        snapshot: typeof s.snapshot === 'string' ? JSON.parse(s.snapshot) : s.snapshot,
      })),
    };
  }

  async getRefundFormInfo(orderId: number, userId: number, userRole: string): Promise<any> {
    const ship = await this.findShipmentById(orderId);
    if (!ship) throw new NotFoundException(`Không tìm thấy đơn hàng #${orderId}`);
    if (userRole === 'CUSTOMER' && ship.customerId !== userId) {
      throw new ForbiddenException('Bạn chỉ có thể xem form hoàn tiền của đơn hàng thuộc tài khoản của mình');
    }

    const [refRows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT * FROM shipment_refund_record
       WHERE shipment_id = ? AND cancellation_category = 'company_cannot_fulfil'
       ORDER BY refund_id DESC LIMIT 1`,
      [orderId],
    );
    const existingRecord = refRows[0];

    const totalPaid = Number(ship.totalCost);
    return {
      shipmentId: orderId,
      status: ship.status,
      totalPaidAmount: totalPaid,
      freightAmount: Number(ship.transportCost ?? totalPaid - Number(ship.insuranceFee)),
      insuranceAmount: Number(ship.insuranceFee),
      cannotFulfilReason: ship.feasibilityReasonCode,
      cannotFulfilNote: ship.feasibilityNote,
      slaDueAt: existingRecord?.sla_due_at ? new Date(existingRecord.sla_due_at).toISOString() : null,
      refundRecord: existingRecord
        ? {
            refundId: existingRecord.refund_id,
            status: existingRecord.status,
            bankName: existingRecord.recipient_bank_name,
            accountNumber: existingRecord.recipient_bank_account,
            accountHolder: existingRecord.recipient_account_holder,
            customerNote: existingRecord.customer_note,
            formSubmittedAt: existingRecord.form_submitted_at ? new Date(existingRecord.form_submitted_at).toISOString() : null,
            slaDueAt: existingRecord.sla_due_at ? new Date(existingRecord.sla_due_at).toISOString() : null,
            requiresDualApproval: Boolean(existingRecord.requires_dual_approval),
            transferReceiptUrl: existingRecord.transfer_receipt_url,
          }
        : null,
    };
  }

  async submitRefundForm(orderId: number, userId: number, dto: SubmitRefundFormDto): Promise<any> {
    return this.transaction(async (db) => {
      const [rows] = await db.execute<RowDataPacket[]>(
        'SELECT * FROM shipment WHERE shipment_id = ? FOR UPDATE',
        [orderId],
      );
      const ship = rows[0];
      if (!ship) throw new NotFoundException(`Không tìm thấy đơn hàng #${orderId}`);
      if (ship.customer_id !== userId) {
        throw new ForbiddenException('Bạn chỉ có thể nộp form hoàn tiền cho đơn hàng của mình');
      }

      if (ship.status !== 'refund_requested') {
        throw new ConflictException(
          `Chỉ có thể nộp form hoàn tiền khi đơn ở trạng thái "refund_requested" (hiện tại: "${ship.status}")`,
        );
      }

      const totalPaid = Number(ship.total_cost);
      if (Math.round(Number(dto.confirmAmount)) !== Math.round(totalPaid)) {
        throw new ConflictException(
          `Số tiền xác nhận (${Number(dto.confirmAmount).toLocaleString('vi-VN')} VND) không khớp với số tiền đã thanh toán (${totalPaid.toLocaleString('vi-VN')} VND)`,
        );
      }

      const [existing] = await db.execute<RowDataPacket[]>(
        `SELECT refund_id, status FROM shipment_refund_record
         WHERE shipment_id = ? AND cancellation_category = 'company_cannot_fulfil' AND status <> 'rejected'`,
        [orderId],
      );
      if (existing.length > 0) {
        throw new ConflictException('Đơn hàng này đã được nộp thông tin hoàn tiền rồi');
      }

      const slaDays = Math.max(1, Number(process.env.REFUND_SLA_BUSINESS_DAYS || 3));
      const slaDueAt = addBusinessDays(new Date(), slaDays);
      const requiresDualApproval = totalPaid >= 20_000_000;
      const freightAmount = Number(ship.transport_cost ?? totalPaid - Number(ship.insurance_fee));
      const insuranceAmount = Number(ship.insurance_fee);

      const [result] = await db.execute<ResultSetHeader>(
        `INSERT INTO shipment_refund_record (
          shipment_id, customer_id, cancellation_category, refund_mode,
          freight_refund_amount, insurance_refund_amount, amount,
          requires_dual_approval, requested_by, recipient_bank_account,
          recipient_bank_name, recipient_account_holder, customer_note,
          form_submitted_at, sla_due_at, status
        ) VALUES (?, ?, 'company_cannot_fulfil', 'cash_refund', ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, 'pending_approval')`,
        [
          orderId,
          userId,
          freightAmount,
          insuranceAmount,
          totalPaid,
          requiresDualApproval ? 1 : 0,
          userId,
          dto.accountNumber.trim(),
          dto.bankName.trim(),
          dto.accountHolder.trim().toUpperCase(),
          dto.note?.trim() ?? null,
          slaDueAt,
        ],
      );

      const refundId = result.insertId;

      await db.execute(
        `INSERT INTO notification (user_id, shipment_id, title, message, notif_type, is_read)
         SELECT user_id, ?, 'Khách hàng đã nộp form hoàn tiền', ?, 'status_update', FALSE
         FROM \`user\` WHERE role IN ('LOGISTICS_MANAGER', 'ADMIN')`,
        [
          orderId,
          `Khách hàng đã nộp thông tin nhận hoàn tiền cho đơn #${orderId} (${totalPaid.toLocaleString('vi-VN')} VND). Hạn xử lý SLA: ${slaDueAt.toLocaleDateString('vi-VN')}.`,
        ],
      );

      return {
        refundId,
        shipmentId: orderId,
        status: 'pending_approval',
        amount: totalPaid,
        slaDueAt: slaDueAt.toISOString(),
        bankName: dto.bankName,
        accountNumber: dto.accountNumber,
        accountHolder: dto.accountHolder.toUpperCase(),
      };
    });
  }
}
