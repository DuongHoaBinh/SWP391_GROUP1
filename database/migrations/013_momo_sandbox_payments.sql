-- Sandbox records are deliberately separate from shipment execution and real settlement.
CREATE TABLE IF NOT EXISTS shipment_sandbox_payment (
  payment_id INT AUTO_INCREMENT PRIMARY KEY,
  shipment_id INT NOT NULL,
  customer_id INT NOT NULL,
  partner_code VARCHAR(50) NOT NULL,
  order_id VARCHAR(100) NOT NULL UNIQUE,
  request_id VARCHAR(100) NOT NULL UNIQUE,
  order_info VARCHAR(255) NOT NULL,
  amount BIGINT NOT NULL,
  status ENUM('creating','pending','succeeded','failed','unknown') NOT NULL DEFAULT 'creating',
  pay_url TEXT NULL,
  qr_content TEXT NULL,
  result_code INT NULL,
  result_message VARCHAR(1000) NULL,
  trans_id VARCHAR(30) NULL,
  last_checked_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_sandbox_payment_shipment (shipment_id, payment_id),
  CONSTRAINT fk_sandbox_payment_shipment FOREIGN KEY (shipment_id) REFERENCES shipment(shipment_id),
  CONSTRAINT fk_sandbox_payment_customer FOREIGN KEY (customer_id) REFERENCES `user`(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS shipment_sandbox_payment_event (
  event_id INT AUTO_INCREMENT PRIMARY KEY,
  payment_id INT NOT NULL,
  event_key VARCHAR(100) NOT NULL,
  source ENUM('create','query','ipn') NOT NULL,
  new_status ENUM('creating','pending','succeeded','failed','unknown') NOT NULL,
  result_code INT NULL,
  result_message VARCHAR(1000) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_sandbox_payment_event (payment_id, event_key),
  CONSTRAINT fk_sandbox_payment_event FOREIGN KEY (payment_id) REFERENCES shipment_sandbox_payment(payment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
