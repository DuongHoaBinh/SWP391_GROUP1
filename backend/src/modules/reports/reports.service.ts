import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { createPool, Pool } from 'mysql2/promise';
import {
  OperatingCostCategory,
  OperatingCostCategorySummary,
  OperatingCostItem,
  PerformanceReportResponse,
} from './reports.types';
import { CreateOperatingCostDto } from './dto/create-operating-cost.dto';
import { UpdateExcusedDelayDto } from './dto/update-excused-delay.dto';
import { MYSQL_POOL } from '../../common/database/database.module';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import {
  computeExecutiveFinancialMetrics,
  computeOtdMetrics,
  isExcusedDelayWindowOpen,
} from './reports-calculator';

const COST_CATEGORY_LABELS: Record<OperatingCostCategory, string> = {
  [OperatingCostCategory.FUEL]: 'Nhiên liệu vận tải',
  [OperatingCostCategory.TOLL_BORDER]: 'Phí cầu đường & cửa khẩu',
  [OperatingCostCategory.AIRLINE_FREIGHT]: 'Cước hàng không (Cargo)',
  [OperatingCostCategory.QUARANTINE_FEE]: 'Phí kiểm dịch & thú y',
  [OperatingCostCategory.STAFF_ALLOWANCE]: 'Công tác phí tài xế & áp tải',
  [OperatingCostCategory.INCIDENT_ABSORBED]: 'Chi phí khắc phục sự cố hấp thụ',
  [OperatingCostCategory.DISBURSEMENT_ABSORBED_ON_COMPANY_FAULT]: 'Phí cơ quan công ty chịu do lỗi vận hành',
};

@Injectable()
export class ReportsService implements OnModuleInit, OnModuleDestroy {
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
    if (this.pool && !this.injectedPool) await this.pool.end();
  }

  private async tableExists(tableName: string): Promise<boolean> {
    const [rows] = await this.pool.execute<any[]>(
      `SELECT COUNT(*) AS cnt
       FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [tableName],
    );
    return Number(rows[0]?.cnt || 0) > 0;
  }

  async getPerformanceReport(): Promise<PerformanceReportResponse> {
    // 1. Active & completed quoted revenues + horse count
    const [quotedRows] = await this.pool.execute<any[]>(
      `SELECT COUNT(*) AS total_active,
              SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_trips,
              COALESCE(SUM(COALESCE(transport_cost, total_cost)), 0) AS quoted_transport_revenue,
              COALESCE(SUM(insurance_fee), 0) AS quoted_insurance_revenue,
              COALESCE(SUM(total_cost), 0) AS quoted_active_revenue
       FROM shipment
       WHERE status IN ('ready_to_depart', 'in_transit', 'completed')`,
    );
    const completedTrips = Number(quotedRows[0]?.completed_trips || 0);
    const quotedTransportRevenue = Number(quotedRows[0]?.quoted_transport_revenue || 0);
    const quotedInsuranceRevenue = Number(quotedRows[0]?.quoted_insurance_revenue || 0);

    // 2. SePay realized cash receipts (all & cancelled_operational)
    const [sepayRows] = await this.pool.execute<any[]>(
      `SELECT COALESCE(SUM(p.amount), 0) AS sepay_total,
              COALESCE(SUM(CASE WHEN s.status = 'cancelled_operational' THEN p.amount ELSE 0 END), 0) AS cancelled_sepay
       FROM shipment_sepay_payment p
       JOIN shipment s ON s.shipment_id = p.shipment_id
       WHERE p.status = 'succeeded'`,
    );
    const sepaySucceededTotal = Number(sepayRows[0]?.sepay_total || 0);
    const cancelledSepaySucceeded = Number(sepayRows[0]?.cancelled_sepay || 0);

    // 3. Refunds, credits & disbursements (Wave 2 tables checked dynamically if present)
    let refundTransferred = 0;
    let creditLiabilityBalance = 0;
    if (await this.tableExists('shipment_refund_record')) {
      const [refundRows] = await this.pool.execute<any[]>(
        `SELECT COALESCE(SUM(CASE WHEN status = 'transferred' THEN amount ELSE 0 END), 0) AS refund_transferred,
                COALESCE(SUM(CASE WHEN status = 'converted_to_credit' AND (credit_expires_at IS NULL OR credit_expires_at > NOW()) THEN amount ELSE 0 END), 0) AS credit_balance
         FROM shipment_refund_record`,
      );
      refundTransferred = Number(refundRows[0]?.refund_transferred || 0);
      creditLiabilityBalance = Number(refundRows[0]?.credit_balance || 0);
    }

    let disbursementOffset = 0;
    if (await this.tableExists('shipment_disbursement')) {
      const [disbRows] = await this.pool.execute<any[]>(
        `SELECT COALESCE(SUM(d.amount), 0) AS disb_total
         FROM shipment_disbursement d
         JOIN shipment s ON s.shipment_id = d.shipment_id
         WHERE s.status = 'cancelled_operational' AND d.settled_status = 'deducted_from_refund'`,
      );
      disbursementOffset = Number(disbRows[0]?.disb_total || 0);
    }

    // 4. Real operating costs from shipment_operating_cost
    const [costRows] = await this.pool.execute<any[]>(
      `SELECT cost_category, COALESCE(SUM(amount), 0) AS total_amount, COUNT(*) AS entry_count
       FROM shipment_operating_cost
       GROUP BY cost_category
       ORDER BY total_amount DESC`,
    );
    const operatingCost = costRows.reduce((sum: number, r: any) => sum + Number(r.total_amount || 0), 0);
    const costBreakdown: OperatingCostCategorySummary[] = costRows.map((r: any) => {
      const cat = String(r.cost_category) as OperatingCostCategory;
      return {
        category: cat,
        label: COST_CATEGORY_LABELS[cat] || cat,
        amount: Math.round(Number(r.total_amount || 0)),
        count: Number(r.entry_count || 0),
      };
    });

    const financials = computeExecutiveFinancialMetrics({
      quotedTransportRevenue,
      quotedInsuranceRevenue,
      sepaySucceededTotal,
      cancelledSepaySucceeded,
      refundTransferred,
      creditLiabilityBalance,
      disbursementOffset,
      operatingCost,
    });
    const grossRevenue = financials.totalRecognizedRevenue;

    // 5. Total horses & shipments
    const [horseRows] = await this.pool.execute<any[]>(
      `SELECT COALESCE(SUM(COALESCE(sh.quantity, 1)), 0) AS total_horses
       FROM shipment_horse sh
       JOIN shipment s ON sh.shipment_id = s.shipment_id
       WHERE s.status IN ('completed', 'in_transit', 'ready_to_depart')`,
    );
    const totalHorses = Number(horseRows[0]?.total_horses || 0);

    const [totalShipmentsRows] = await this.pool.execute<any[]>(
      'SELECT COUNT(*) AS total_count FROM shipment',
    );
    const totalShipments = Number(totalShipmentsRows[0]?.total_count || 0);

    // 6. Real OTD & excused_delay from completed shipments + route planned/actual arrivals
    const [completedOtdRows] = await this.pool.execute<any[]>(
      `SELECT s.shipment_id, s.transport_mode, s.transportation_type,
              s.origin_location, s.destination_location,
              s.excused_delay,
              COALESCE(s.expected_arrival_date, (
                SELECT MAX(rl.planned_arrival)
                FROM route r
                JOIN route_leg rl ON rl.route_id = r.route_id
                WHERE r.shipment_id = s.shipment_id
              )) AS planned_arrival,
              COALESCE(s.actual_arrival_date, (
                SELECT MAX(rl.actual_arrival)
                FROM route r
                JOIN route_leg rl ON rl.route_id = r.route_id
                WHERE r.shipment_id = s.shipment_id
              )) AS actual_arrival
       FROM shipment s
       WHERE s.status = 'completed'`,
    );
    const otdSummary = computeOtdMetrics(
      completedOtdRows.map((r: any) => ({
        shipmentId: Number(r.shipment_id),
        transportMode: r.transport_mode,
        transportationType: r.transportation_type,
        plannedArrival: r.planned_arrival,
        actualArrival: r.actual_arrival,
        excusedDelay: r.excused_delay,
      })),
    );

    // 7. Real Quarantine First-Pass Rate from transport_document & document_approval
    const [docRows] = await this.pool.execute<any[]>(
      `SELECT d.document_id, d.status, d.superseded_by_document_id,
              EXISTS (
                SELECT 1 FROM transport_document prev
                WHERE prev.superseded_by_document_id = d.document_id
                  AND prev.status IN ('rejected', 'expired')
              ) AS replaced_rejected_ancestor,
              EXISTS (
                SELECT 1 FROM document_approval da
                WHERE da.document_id = d.document_id
                  AND da.status = 'rejected'
              ) AS has_authority_rejection
       FROM transport_document d
       WHERE COALESCE(d.is_archived, 0) = 0`,
    );
    const quarantineTotalEvaluated = docRows.length;
    const quarantineFirstPassCount = docRows.filter(
      (d: any) =>
        String(d.status).toLowerCase() === 'approved' &&
        !Number(d.replaced_rejected_ancestor || 0) &&
        !Number(d.has_authority_rejection || 0),
    ).length;
    const quarantinePassRate =
      quarantineTotalEvaluated > 0
        ? Math.round((quarantineFirstPassCount / quarantineTotalEvaluated) * 1000) / 10
        : 0;

    // 8. Status distribution
    const [statusRows] = await this.pool.execute<any[]>(
      'SELECT status, COUNT(*) AS count FROM shipment GROUP BY status',
    );
    const statusMap: Record<string, { label: string; color: string }> = {
      completed: { label: 'Đã hoàn thành', color: '#16a34a' },
      in_transit: { label: 'Đang di chuyển', color: '#2563eb' },
      ready_to_depart: { label: 'Sẵn sàng xuất phát', color: '#0d9488' },
      confirmed: { label: 'Đã xác nhận (Chờ thanh toán)', color: '#0284c7' },
      planning: { label: 'Đang lập lộ trình', color: '#8b5cf6' },
      approved: { label: 'Đã duyệt yêu cầu', color: '#f59e0b' },
      requested: { label: 'Chờ xử lý', color: '#64748b' },
      change_requested: { label: 'Cần bổ sung', color: '#ea580c' },
      rejected: { label: 'Bị từ chối', color: '#ef4444' },
      cancelled: { label: 'Khách đã hủy', color: '#94a3b8' },
      cancelled_operational: { label: 'Hủy vận hành', color: '#dc2626' },
    };

    const statusBreakdown = statusRows.map((r: any) => {
      const st = String(r.status || '').toLowerCase();
      const meta = statusMap[st] || { label: st, color: '#64748b' };
      const count = Number(r.count || 0);
      const percentage = totalShipments > 0 ? Math.round((count / totalShipments) * 100) : 0;
      return { status: st, label: meta.label, count, percentage, color: meta.color };
    });

    const activeShipments = statusRows
      .filter((r: any) =>
        ['in_transit', 'ready_to_depart', 'confirmed', 'planning', 'approved'].includes(String(r.status).toLowerCase()),
      )
      .reduce((acc: number, r: any) => acc + Number(r.count || 0), 0);

    // 9. Corridor breakdown
    const [corridorRows] = await this.pool.execute<any[]>(
      `SELECT origin_location, destination_location, COUNT(*) AS trips,
              COALESCE(SUM(total_cost), 0) AS revenue,
              SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_count
       FROM shipment
       GROUP BY origin_location, destination_location
       ORDER BY trips DESC
       LIMIT 6`,
    );
    const maxTrips = corridorRows.length > 0 ? Math.max(...corridorRows.map((c: any) => Number(c.trips || 1))) : 1;
    const corridorBreakdown = corridorRows.map((c: any) => {
      const trips = Number(c.trips || 0);
      const rev = Number(c.revenue || 0);
      return {
        corridor: `${c.origin_location} → ${c.destination_location}`,
        trips,
        revenue: rev,
        revenueFormatted: rev > 0 ? `${rev.toLocaleString('vi-VN')} ₫` : '0 ₫',
        percentage: Math.min(100, Math.round((trips / maxTrips) * 100)),
        completedTrips: Number(c.completed_count || 0),
      };
    });

    // 10. Recent 15 shipments with OTD & operating cost summary
    const [recentRows] = await this.pool.execute<any[]>(
      `SELECT s.shipment_id,
              CONCAT('REQ-', LPAD(s.shipment_id, 3, '0')) AS request_code,
              COALESCE(u.full_name, s.contact_name, 'Khách hàng') AS customer_name,
              s.origin_location,
              s.destination_location,
              s.status,
              s.total_cost,
              s.created_at,
              s.excused_delay,
              s.excused_delay_reason,
              COALESCE(s.expected_arrival_date, (
                SELECT MAX(rl.planned_arrival)
                FROM route r
                JOIN route_leg rl ON rl.route_id = r.route_id
                WHERE r.shipment_id = s.shipment_id
              )) AS expected_arrival_date,
              COALESCE(s.actual_arrival_date, (
                SELECT MAX(rl.actual_arrival)
                FROM route r
                JOIN route_leg rl ON rl.route_id = r.route_id
                WHERE r.shipment_id = s.shipment_id
              )) AS actual_arrival_date,
              (SELECT COALESCE(SUM(COALESCE(sh.quantity, 1)), 0) FROM shipment_horse sh WHERE sh.shipment_id = s.shipment_id) AS horse_count,
              (SELECT COALESCE(SUM(soc.amount), 0) FROM shipment_operating_cost soc WHERE soc.shipment_id = s.shipment_id) AS operating_cost_total
       FROM shipment s
       LEFT JOIN \`user\` u ON s.customer_id = u.user_id
       ORDER BY s.shipment_id DESC
       LIMIT 15`,
    );

    const recentShipments = recentRows.map((r: any) => {
      const sid = Number(r.shipment_id);
      const st = String(r.status || '').toLowerCase();
      const meta = statusMap[st] || { label: st, color: '#64748b' };
      const cost = Number(r.total_cost || 0);
      const otdEval = otdSummary.perShipment.get(sid);
      return {
        shipmentId: sid,
        requestCode: r.request_code,
        customerName: r.customer_name,
        origin: r.origin_location,
        destination: r.destination_location,
        status: st,
        statusLabel: meta.label,
        totalCost: cost,
        totalCostFormatted: cost > 0 ? `${cost.toLocaleString('vi-VN')} ₫` : '0 ₫',
        currency: 'VND',
        horseCount: Math.max(1, Number(r.horse_count || 1)),
        createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
        expectedArrivalDate: r.expected_arrival_date ? new Date(r.expected_arrival_date).toISOString() : null,
        actualArrivalDate: r.actual_arrival_date ? new Date(r.actual_arrival_date).toISOString() : null,
        delayMinutes: otdEval?.delayMinutes ?? null,
        toleranceMinutes: otdEval?.toleranceMinutes ?? null,
        isOnTime: otdEval?.isOnTime ?? null,
        excusedDelay: Boolean(r.excused_delay),
        excusedDelayReason: r.excused_delay_reason ?? null,
        excusedDelayLocked: st === 'completed' ? (otdEval?.excusedDelayLocked ?? !isExcusedDelayWindowOpen(r.actual_arrival_date)) : true,
        operatingCostTotal: Math.round(Number(r.operating_cost_total || 0)),
      };
    });

    return {
      metrics: {
        grossRevenue,
        grossRevenueFormatted: `${grossRevenue.toLocaleString('vi-VN')} ₫`,
        onTimeDeliveryRate: otdSummary.adjustedOnTimeDeliveryRate,
        grossOnTimeDeliveryRate: otdSummary.grossOnTimeDeliveryRate,
        adjustedOnTimeDeliveryRate: otdSummary.adjustedOnTimeDeliveryRate,
        otdSampleSize: otdSummary.otdSampleSize,
        onTimeTripsCount: otdSummary.onTimeCount,
        lateTripsCount: otdSummary.lateCount,
        excusedDelayCount: otdSummary.excusedDelayCount,
        completedTrips,
        totalHorsesTransported: totalHorses,
        quarantinePassRate,
        quarantineFirstPassCount,
        quarantineTotalEvaluated,
        activeShipments,
        totalShipments,
        quotedActiveRevenue: financials.quotedActiveRevenue,
        quotedTransportRevenue: financials.quotedTransportRevenue,
        quotedInsuranceRevenue: financials.quotedInsuranceRevenue,
        retainedCancellationRevenue: financials.retainedCancellationRevenue,
        creditLiabilityBalance: financials.creditLiabilityBalance,
        netRealizedCashRevenue: financials.netRealizedCashRevenue,
        operatingCost: financials.operatingCost,
        grossProfit: financials.grossProfit,
        grossProfitMargin: financials.grossProfitMargin,
      },
      statusBreakdown,
      corridorBreakdown,
      costBreakdown,
      recentShipments,
    };
  }

  async getOperatingCosts(shipmentId: number): Promise<OperatingCostItem[]> {
    const [orders] = await this.pool.execute<any[]>(
      'SELECT shipment_id FROM shipment WHERE shipment_id = ? LIMIT 1',
      [shipmentId],
    );
    if (!orders[0]) {
      throw new NotFoundException(`Đơn vận chuyển #${shipmentId} không tồn tại`);
    }

    const [rows] = await this.pool.execute<any[]>(
      `SELECT soc.*, u.full_name AS recorded_by_name
       FROM shipment_operating_cost soc
       LEFT JOIN \`user\` u ON u.user_id = soc.recorded_by
       WHERE soc.shipment_id = ?
       ORDER BY soc.cost_id DESC`,
      [shipmentId],
    );

    return rows.map((r: any) => ({
      id: Number(r.cost_id),
      shipmentId: Number(r.shipment_id),
      routeLegId: r.route_leg_id ? Number(r.route_leg_id) : null,
      category: r.cost_category as OperatingCostCategory,
      amount: Math.round(Number(r.amount || 0)),
      receiptUrl: r.receipt_url ?? null,
      notes: r.notes ?? null,
      recordedBy: Number(r.recorded_by),
      recordedByName: r.recorded_by_name ?? null,
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
    }));
  }

  async addOperatingCost(
    user: AuthenticatedUser,
    shipmentId: number,
    dto: CreateOperatingCostDto,
  ): Promise<OperatingCostItem> {
    const [orders] = await this.pool.execute<any[]>(
      'SELECT shipment_id FROM shipment WHERE shipment_id = ? LIMIT 1',
      [shipmentId],
    );
    if (!orders[0]) {
      throw new NotFoundException(`Đơn vận chuyển #${shipmentId} không tồn tại`);
    }

    const roundedAmount = Math.round(Number(dto.amount));
    if (!Number.isSafeInteger(roundedAmount) || roundedAmount <= 0) {
      throw new BadRequestException('Số tiền chi phí vận hành phải là số nguyên dương');
    }

    const [result] = await this.pool.execute<any>(
      `INSERT INTO shipment_operating_cost (
        shipment_id, route_leg_id, cost_category, amount, receipt_url, notes, recorded_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        shipmentId,
        dto.routeLegId ?? null,
        dto.costCategory,
        roundedAmount,
        dto.receiptUrl?.trim() || null,
        dto.notes?.trim() || null,
        Number(user.id),
      ],
    );
    const costId = Number(result.insertId);
    const list = await this.getOperatingCosts(shipmentId);
    return list.find((c) => c.id === costId)!;
  }

  async deleteOperatingCost(costId: number): Promise<{ success: boolean }> {
    const [result] = await this.pool.execute<any>(
      'DELETE FROM shipment_operating_cost WHERE cost_id = ?',
      [costId],
    );
    if (Number(result.affectedRows || 0) === 0) {
      throw new NotFoundException(`Khoản chi phí #${costId} không tồn tại`);
    }
    return { success: true };
  }

  async updateExcusedDelay(
    user: AuthenticatedUser,
    shipmentId: number,
    dto: UpdateExcusedDelayDto,
  ): Promise<{ shipmentId: number; excusedDelay: boolean; excusedDelayReason: string | null; excusedDelayConfirmedAt: string | null }> {
    const [rows] = await this.pool.execute<any[]>(
      `SELECT s.shipment_id, s.status, s.actual_arrival_date,
              (SELECT MAX(rl.actual_arrival)
               FROM route r JOIN route_leg rl ON rl.route_id = r.route_id
               WHERE r.shipment_id = s.shipment_id) AS leg_actual_arrival
       FROM shipment s
       WHERE s.shipment_id = ?
       LIMIT 1`,
      [shipmentId],
    );
    const shipment = rows[0];
    if (!shipment) {
      throw new NotFoundException(`Đơn vận chuyển #${shipmentId} không tồn tại`);
    }

    if (shipment.status !== 'completed') {
      throw new ConflictException(
        `Chỉ đơn vận chuyển đã hoàn thành (completed) mới có thể xác nhận miễn trừ OTD (hiện tại: ${shipment.status})`,
      );
    }

    const effectiveArrival = shipment.actual_arrival_date || shipment.leg_actual_arrival;
    if (!isExcusedDelayWindowOpen(effectiveArrival)) {
      throw new ConflictException(
        'Đã quá 48 giờ kể từ thời điểm đến thực tế (actual_arrival_date); chỉ số OTD đã khóa sổ bất biến theo DEC-02.',
      );
    }

    if (dto.excusedDelay && (!dto.reason || dto.reason.trim().length === 0)) {
      throw new BadRequestException('Bắt buộc nhập lý do khách quan khi xác nhận miễn trừ trễ hạn (excused_delay)');
    }

    const confirmedAt = new Date();
    const reasonText = dto.excusedDelay ? dto.reason!.trim() : null;
    await this.pool.execute(
      `UPDATE shipment
       SET excused_delay = ?,
           excused_delay_reason = ?,
           excused_delay_confirmed_by = ?,
           excused_delay_confirmed_at = ?
       WHERE shipment_id = ?`,
      [
        dto.excusedDelay ? 1 : 0,
        reasonText,
        Number(user.id),
        dto.excusedDelay ? confirmedAt : null,
        shipmentId,
      ],
    );

    return {
      shipmentId,
      excusedDelay: dto.excusedDelay,
      excusedDelayReason: reasonText,
      excusedDelayConfirmedAt: dto.excusedDelay ? confirmedAt.toISOString() : null,
    };
  }
}
