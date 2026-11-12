-- Official invoices are issued only after Flow 3 confirmation. Historical payments are preserved.
CREATE TABLE IF NOT EXISTS shipment_invoice (
  invoice_id INT AUTO_INCREMENT PRIMARY KEY,
  shipment_id INT NOT NULL,
  route_id INT NOT NULL,
  customer_id INT NOT NULL,
  amount BIGINT NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'VND',
  snapshot JSON NOT NULL,
  issued_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_invoice_route (route_id),
  INDEX idx_invoice_shipment (shipment_id, issued_at),
  CONSTRAINT fk_invoice_shipment FOREIGN KEY (shipment_id) REFERENCES shipment(shipment_id),
  CONSTRAINT fk_invoice_route FOREIGN KEY (route_id) REFERENCES route(route_id),
  CONSTRAINT fk_invoice_customer FOREIGN KEY (customer_id) REFERENCES `user`(user_id),
  CHECK (amount > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
