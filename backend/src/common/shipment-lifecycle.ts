import { Global, Injectable, Module } from '@nestjs/common';

/** Await post-commit readiness checks without circular imports between business modules. */
@Injectable()
export class ShipmentLifecycle {
  private readiness?: (shipmentId: number) => Promise<unknown>;

  onChange(handler: (shipmentId: number) => Promise<unknown>) {
    this.readiness = handler;
  }

  async changed(shipmentId: number) {
    await this.readiness?.(shipmentId);
  }
}

@Global()
@Module({ providers: [ShipmentLifecycle], exports: [ShipmentLifecycle] })
export class ShipmentLifecycleModule {}
