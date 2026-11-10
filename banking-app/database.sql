-- Complete Database Setup for Banking Application
-- Run this script in MySQL to create the database and tables

-- Create Database
CREATE DATABASE IF NOT EXISTS banking_app;
USE banking_app;

-- Users Table (stores user account information)
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    phone VARCHAR(20) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Accounts Table (stores bank accounts/cards for each user)
CREATE TABLE IF NOT EXISTS accounts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    account_type ENUM('checking', 'savings', 'card') DEFAULT 'checking',
    account_number VARCHAR(20) UNIQUE NOT NULL,
    card_number VARCHAR(19),
    card_type ENUM('visa', 'mastercard') DEFAULT 'visa',
    balance DECIMAL(15, 2) DEFAULT 0.00,
    currency VARCHAR(3) DEFAULT 'KZT',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Deposits Table (stores deposit accounts with interest)
CREATE TABLE IF NOT EXISTS deposits (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    deposit_name VARCHAR(100) NOT NULL,
    principal_amount DECIMAL(15, 2) NOT NULL,
    interest_rate DECIMAL(5, 2) NOT NULL,
    accumulated_interest DECIMAL(15, 2) DEFAULT 0.00,
    term_months INT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status ENUM('active', 'closed', 'matured') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Transactions Table (logs all money movements)
CREATE TABLE IF NOT EXISTS transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    transaction_type ENUM('transfer_out', 'transfer_in', 'top_up', 'deposit_open', 'deposit_close') NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'KZT',
    from_account VARCHAR(50),
    to_account VARCHAR(50),
    description TEXT,
    status ENUM('pending', 'completed', 'failed') DEFAULT 'completed',
    transaction_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Insert Demo User (password: demo123)
INSERT INTO users (full_name, email, phone, password) VALUES
('Demo User', 'demo@bcc.kz', '+77001234567', '$2a$10$X8qJ5vZ3QxK9Y.VqGN5yVuYXH4lJ3RjKvZ4sX9uY2N8B7tL6mW5we');

-- Get the demo user ID
SET @demo_user_id = LAST_INSERT_ID();

-- Insert Demo Accounts
INSERT INTO accounts (user_id, account_type, account_number, card_number, card_type, balance, currency) VALUES
(@demo_user_id, 'card', 'KZ86125KZT1234567890', '4400 1234 5678 9012', 'visa', 500000.00, 'KZT'),
(@demo_user_id, 'card', 'KZ86125KZT0987654321', '5500 9876 5432 1098', 'mastercard', 250000.00, 'KZT'),
(@demo_user_id, 'savings', 'KZ86125KZT5555555555', NULL, NULL, 1000000.00, 'KZT');

-- Insert Demo Deposit
INSERT INTO deposits (user_id, deposit_name, principal_amount, interest_rate, accumulated_interest, term_months, start_date, end_date, status) VALUES
(@demo_user_id, 'Накопительный депозит 12%', 500000.00, 12.00, 15000.00, 12, '2026-01-01', '2027-01-01', 'active');

-- Insert Demo Transactions
INSERT INTO transactions (user_id, transaction_type, amount, currency, from_account, to_account, description, status) VALUES
(@demo_user_id, 'top_up', 100000.00, 'KZT', 'External Source', '4400 1234 5678 9012', 'Пополнение через Kaspi', 'completed'),
(@demo_user_id, 'transfer_out', 25000.00, 'KZT', '4400 1234 5678 9012', '+77001112233', 'Перевод по номеру телефона', 'completed'),
(@demo_user_id, 'transfer_in', 50000.00, 'KZT', '+77009998877', '5500 9876 5432 1098', 'Перевод от друга', 'completed'),
(@demo_user_id, 'deposit_open', 500000.00, 'KZT', '4400 1234 5678 9012', 'Deposit Account', 'Открытие депозита', 'completed');

-- Create indexes for better performance
CREATE INDEX idx_user_email ON users(email);
CREATE INDEX idx_user_phone ON users(phone);
CREATE INDEX idx_account_user ON accounts(user_id);
CREATE INDEX idx_account_number ON accounts(account_number);
CREATE INDEX idx_card_number ON accounts(card_number);
CREATE INDEX idx_transaction_user ON transactions(user_id);
CREATE INDEX idx_transaction_date ON transactions(transaction_date);
CREATE INDEX idx_deposit_user ON deposits(user_id);

-- Display success message
SELECT 'Database setup completed successfully!' AS message;
SELECT 'Demo login - Email: demo@bcc.kz, Password: demo123' AS demo_credentials;