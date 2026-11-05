-- Real bank receipts are separate from historical sandbox attempts and trip state.
CREATE TABLE IF NOT EXISTS shipment_sepay_payment (
  payment_id INT AUTO_INCREMENT PRIMARY KEY,
  shipment_id INT NOT NULL,
  customer_id INT NOT NULL,
  payment_code VARCHAR(32) NOT NULL,
  amount BIGINT NOT NULL,
  bank_code VARCHAR(30) NOT NULL,
  account_number VARCHAR(34) NOT NULL,
  account_name VARCHAR(150) NOT NULL,
  status ENUM('pending','review','succeeded') NOT NULL DEFAULT 'pending',
  transaction_id BIGINT UNSIGNED NULL,
  paid_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_sepay_shipment (shipment_id),
  UNIQUE KEY uq_sepay_code (payment_code),
  UNIQUE KEY uq_sepay_paid_transaction (transaction_id),
  CONSTRAINT fk_sepay_shipment FOREIGN KEY (shipment_id) REFERENCES shipment(shipment_id),
  CONSTRAINT fk_sepay_customer FOREIGN KEY (customer_id) REFERENCES `user`(user_id),
  CHECK (amount > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sepay_webhook_receipt (
  transaction_id BIGINT UNSIGNED PRIMARY KEY,
  payment_id INT NULL,
  identity_hash CHAR(64) NOT NULL,
  outcome VARCHAR(30) NOT NULL,
  payload JSON NOT NULL,
  received_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_sepay_receipt_payment (payment_id, received_at),
  CONSTRAINT fk_sepay_receipt_payment FOREIGN KEY (payment_id) REFERENCES shipment_sepay_payment(payment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
