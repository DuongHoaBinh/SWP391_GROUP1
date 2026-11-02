-- Migration 014: Thanh toán chuyển khoản QR tự động (SePay Test mode + VietQR + Invoice + Audit History)
USE horse_transport_system;

CREATE TABLE IF NOT EXISTS payment_config (
  config_id INT PRIMARY KEY DEFAULT 1,
  bank_code VARCHAR(50) NOT NULL DEFAULT 'MBBank',
  bank_account_no VARCHAR(50) NOT NULL DEFAULT '0000123456789',
  bank_account_name VARCHAR(150) NOT NULL DEFAULT 'CONG TY VAN CHUYEN NGUA EQUITRANSIT',
  payment_code_prefix VARCHAR(20) NOT NULL DEFAULT 'EQT',
  expire_hours INT NOT NULL DEFAULT 48,
  updated_by INT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT IGNORE INTO payment_config (config_id, bank_code, bank_account_no, bank_account_name, payment_code_prefix, expire_hours)
VALUES (1, 'MBBank', '0000123456789', 'CONG TY VAN CHUYEN NGUA EQUITRANSIT', 'EQT', 48);

CREATE TABLE IF NOT EXISTS shipment_payment (
  payment_id INT AUTO_INCREMENT PRIMARY KEY,
  shipment_id INT NOT NULL UNIQUE,
  customer_id INT NOT NULL,
  payment_code VARCHAR(50) NOT NULL UNIQUE,
  amount BIGINT UNSIGNED NOT NULL,
  status ENUM('PENDING','AWAITING_CONFIRMATION','PAID','NEEDS_REVIEW','EXPIRED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  expires_at DATETIME NOT NULL,
  paid_at DATETIME NULL,
  confirmed_by VARCHAR(60) NULL,
  sepay_transaction_id VARCHAR(64) NULL UNIQUE,
  reference_code VARCHAR(100) NULL,
  gateway VARCHAR(100) NULL,
  paid_amount BIGINT UNSIGNED NULL,
  raw_webhook_payload JSON NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_shipment_payment_shipment FOREIGN KEY (shipment_id) REFERENCES shipment(shipment_id),
  CONSTRAINT fk_shipment_payment_customer FOREIGN KEY (customer_id) REFERENCES `user`(user_id),
  INDEX idx_shipment_payment_status (status),
  INDEX idx_shipment_payment_code (payment_code)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS shipment_payment_history (
  history_id INT AUTO_INCREMENT PRIMARY KEY,
  payment_id INT NOT NULL,
  shipment_id INT NOT NULL,
  old_status VARCHAR(40) NULL,
  new_status VARCHAR(40) NOT NULL,
  actor VARCHAR(60) NOT NULL,
  notes VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_payment_history_payment FOREIGN KEY (payment_id) REFERENCES shipment_payment(payment_id) ON DELETE CASCADE,
  INDEX idx_payment_history_shipment (shipment_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS shipment_invoice (
  invoice_id INT AUTO_INCREMENT PRIMARY KEY,
  invoice_number VARCHAR(50) NOT NULL UNIQUE,
  payment_id INT NOT NULL UNIQUE,
  shipment_id INT NOT NULL UNIQUE,
  order_code VARCHAR(30) NOT NULL,
  payer_name VARCHAR(150) NOT NULL,
  payer_email VARCHAR(150) NULL,
  paid_at DATETIME NOT NULL,
  amount BIGINT UNSIGNED NOT NULL,
  transfer_content VARCHAR(150) NOT NULL,
  bank_code VARCHAR(50) NOT NULL,
  bank_account_no VARCHAR(50) NOT NULL,
  bank_account_name VARCHAR(150) NOT NULL,
  confirmed_by VARCHAR(60) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_invoice_payment FOREIGN KEY (payment_id) REFERENCES shipment_payment(payment_id) ON DELETE CASCADE,
  CONSTRAINT fk_invoice_shipment FOREIGN KEY (shipment_id) REFERENCES shipment(shipment_id)
) ENGINE=InnoDB;

