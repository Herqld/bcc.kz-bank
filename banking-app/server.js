// Banking Application - Backend Server
const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Session configuration
app.use(session({
    secret: 'bcc-banking-secret-key-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// MySQL Database Connection
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '', // Change this to your MySQL password
    database: 'banking_app'
});

db.connect((err) => {
    if (err) {
        console.error('❌ Database connection failed:', err);
        console.log('\n⚠️  Please make sure:');
        console.log('   1. MySQL is running');
        console.log('   2. Database "banking_app" exists');
        console.log('   3. Run the database.sql file first\n');
        process.exit(1);
    }
    console.log('✅ Connected to MySQL Database');
});

// Middleware to check authentication
function isAuthenticated(req, res, next) {
    if (req.session.userId) {
        next();
    } else {
        res.status(401).json({ success: false, message: 'Not authenticated' });
    }
}

// ==================== ROUTES ====================

// Serve main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Register new user
app.post('/api/register', async (req, res) => {
    const { fullName, email, phone, password } = req.body;

    // Validate input
    if (!fullName || !email || !phone || !password) {
        return res.json({ success: false, message: 'Все поля обязательны' });
    }

    // Check if user already exists
    db.query('SELECT * FROM users WHERE email = ? OR phone = ?', [email, phone], async (err, results) => {
        if (err) {
            return res.json({ success: false, message: 'Ошибка сервера' });
        }

        if (results.length > 0) {
            return res.json({ success: false, message: 'Пользователь с таким email или телефоном уже существует' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user
        db.query(
            'INSERT INTO users (full_name, email, phone, password) VALUES (?, ?, ?, ?)',
            [fullName, email, phone, hashedPassword],
            (err, result) => {
                if (err) {
                    return res.json({ success: false, message: 'Ошибка при создании пользователя' });
                }

                const userId = result.insertId;

                // Create default account for new user
                const accountNumber = 'KZ' + Math.floor(Math.random() * 10000000000000000);
                const cardNumber = '4400 ' + Math.floor(1000 + Math.random() * 9000) + ' ' +
                                 Math.floor(1000 + Math.random() * 9000) + ' ' +
                                 Math.floor(1000 + Math.random() * 9000);

                db.query(
                    'INSERT INTO accounts (user_id, account_type, account_number, card_number, card_type, balance) VALUES (?, ?, ?, ?, ?, ?)',
                    [userId, 'card', accountNumber, cardNumber, 'visa', 0],
                    (err) => {
                        if (err) {
                            return res.json({ success: false, message: 'Ошибка при создании счета' });
                        }

                        res.json({ success: true, message: 'Регистрация успешна! Теперь войдите в систему.' });
                    }
                );
            }
        );
    });
});

// Login
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.json({ success: false, message: 'Email и пароль обязательны' });
    }

    db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
        if (err) {
            return res.json({ success: false, message: 'Ошибка сервера' });
        }

        if (results.length === 0) {
            return res.json({ success: false, message: 'Неверный email или пароль' });
        }

        const user = results[0];
        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            return res.json({ success: false, message: 'Неверный email или пароль' });
        }

        // Set session
        req.session.userId = user.id;
        req.session.userName = user.full_name;

        res.json({ success: true, message: 'Вход выполнен успешно', user: { id: user.id, name: user.full_name } });
    });
});

// Logout
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true, message: 'Выход выполнен' });
});

// Check authentication status
app.get('/api/check-auth', (req, res) => {
    if (req.session.userId) {
        res.json({ authenticated: true, userId: req.session.userId, userName: req.session.userName });
    } else {
        res.json({ authenticated: false });
    }
});

// Get user dashboard data
app.get('/api/dashboard', isAuthenticated, (req, res) => {
    const userId = req.session.userId;

    // Get total balance from all accounts
    db.query(
        'SELECT SUM(balance) as total_balance FROM accounts WHERE user_id = ? AND is_active = TRUE',
        [userId],
        (err, balanceResults) => {
            if (err) {
                return res.json({ success: false, message: 'Ошибка загрузки данных' });
            }

            // Get all accounts/cards
            db.query(
                'SELECT * FROM accounts WHERE user_id = ? AND is_active = TRUE ORDER BY created_at DESC',
                [userId],
                (err, accountsResults) => {
                    if (err) {
                        return res.json({ success: false, message: 'Ошибка загрузки счетов' });
                    }

                    res.json({
                        success: true,
                        totalBalance: balanceResults[0].total_balance || 0,
                        accounts: accountsResults
                    });
                }
            );
        }
    );
});

// Get transaction history
app.get('/api/transactions', isAuthenticated, (req, res) => {
    const userId = req.session.userId;

    db.query(
        'SELECT * FROM transactions WHERE user_id = ? ORDER BY transaction_date DESC LIMIT 50',
        [userId],
        (err, results) => {
            if (err) {
                return res.json({ success: false, message: 'Ошибка загрузки истории' });
            }

            res.json({ success: true, transactions: results });
        }
    );
});

// Transfer money
app.post('/api/transfer', isAuthenticated, (req, res) => {
    const userId = req.session.userId;
    const { fromAccount, toAccount, amount, transferType, description } = req.body;

    if (!fromAccount || !toAccount || !amount || amount <= 0) {
        return res.json({ success: false, message: 'Некорректные данные перевода' });
    }

    // Start transaction
    db.beginTransaction((err) => {
        if (err) {
            return res.json({ success: false, message: 'Ошибка транзакции' });
        }

        // Check sender's balance
        db.query(
            'SELECT * FROM accounts WHERE account_number = ? AND user_id = ?',
            [fromAccount, userId],
            (err, senderResults) => {
                if (err || senderResults.length === 0) {
                    return db.rollback(() => {
                        res.json({ success: false, message: 'Счет отправителя не найден' });
                    });
                }

                const senderAccount = senderResults[0];

                if (senderAccount.balance < parseFloat(amount)) {
                    return db.rollback(() => {
                        res.json({ success: false, message: 'Недостаточно средств на счете' });
                    });
                }

                // Deduct from sender
                db.query(
                    'UPDATE accounts SET balance = balance - ? WHERE account_number = ?',
                    [amount, fromAccount],
                    (err) => {
                        if (err) {
                            return db.rollback(() => {
                                res.json({ success: false, message: 'Ошибка списания средств' });
                            });
                        }

                        // If transferring to own account or external
                        if (transferType === 'own') {
                            db.query(
                                'UPDATE accounts SET balance = balance + ? WHERE account_number = ? AND user_id = ?',
                                [amount, toAccount, userId],
                                (err) => {
                                    if (err) {
                                        return db.rollback(() => {
                                            res.json({ success: false, message: 'Ошибка зачисления средств' });
                                        });
                                    }

                                    // Log transaction
                                    logTransaction();
                                }
                            );
                        } else {
                            // External transfer (phone/card) - just log it
                            logTransaction();
                        }

                        function logTransaction() {
                            db.query(
                                'INSERT INTO transactions (user_id, transaction_type, amount, from_account, to_account, description) VALUES (?, ?, ?, ?, ?, ?)',
                                [userId, 'transfer_out', amount, fromAccount, toAccount, description || 'Перевод средств'],
                                (err) => {
                                    if (err) {
                                        return db.rollback(() => {
                                            res.json({ success: false, message: 'Ошибка записи транзакции' });
                                        });
                                    }

                                    db.commit((err) => {
                                        if (err) {
                                            return db.rollback(() => {
                                                res.json({ success: false, message: 'Ошибка завершения транзакции' });
                                            });
                                        }

                                        res.json({ success: true, message: 'Перевод выполнен успешно!' });
                                    });
                                }
                            );
                        }
                    }
                );
            }
        );
    });
});

// Top-up account
app.post('/api/topup', isAuthenticated, (req, res) => {
    const userId = req.session.userId;
    const { accountNumber, amount } = req.body;

    if (!accountNumber || !amount || amount <= 0) {
        return res.json({ success: false, message: 'Некорректные данные' });
    }

    db.beginTransaction((err) => {
        if (err) {
            return res.json({ success: false, message: 'Ошибка транзакции' });
        }

        // Add money to account
        db.query(
            'UPDATE accounts SET balance = balance + ? WHERE account_number = ? AND user_id = ?',
            [amount, accountNumber, userId],
            (err, result) => {
                if (err || result.affectedRows === 0) {
                    return db.rollback(() => {
                        res.json({ success: false, message: 'Ошибка пополнения счета' });
                    });
                }

                // Log transaction
                db.query(
                    'INSERT INTO transactions (user_id, transaction_type, amount, to_account, description) VALUES (?, ?, ?, ?, ?)',
                    [userId, 'top_up', amount, accountNumber, 'Пополнение счета'],
                    (err) => {
                        if (err) {
                            return db.rollback(() => {
                                res.json({ success: false, message: 'Ошибка записи транзакции' });
                            });
                        }

                        db.commit((err) => {
                            if (err) {
                                return db.rollback(() => {
                                    res.json({ success: false, message: 'Ошибка завершения операции' });
                                });
                            }

                            res.json({ success: true, message: 'Счет успешно пополнен!' });
                        });
                    }
                );
            }
        );
    });
});

// Get deposits
app.get('/api/deposits', isAuthenticated, (req, res) => {
    const userId = req.session.userId;

    db.query(
        'SELECT * FROM deposits WHERE user_id = ? ORDER BY created_at DESC',
        [userId],
        (err, results) => {
            if (err) {
                return res.json({ success: false, message: 'Ошибка загрузки депозитов' });
            }

            res.json({ success: true, deposits: results });
        }
    );
});

// Open new deposit
app.post('/api/deposits/open', isAuthenticated, (req, res) => {
    const userId = req.session.userId;
    const { depositName, amount, interestRate, termMonths, fromAccount } = req.body;

    if (!depositName || !amount || !interestRate || !termMonths || !fromAccount || amount <= 0) {
        return res.json({ success: false, message: 'Некорректные данные депозита' });
    }

    db.beginTransaction((err) => {
        if (err) {
            return res.json({ success: false, message: 'Ошибка транзакции' });
        }

        // Check balance
        db.query(
            'SELECT balance FROM accounts WHERE account_number = ? AND user_id = ?',
            [fromAccount, userId],
            (err, results) => {
                if (err || results.length === 0) {
                    return db.rollback(() => {
                        res.json({ success: false, message: 'Счет не найден' });
                    });
                }

                if (results[0].balance < parseFloat(amount)) {
                    return db.rollback(() => {
                        res.json({ success: false, message: 'Недостаточно средств' });
                    });
                }

                // Deduct from account
                db.query(
                    'UPDATE accounts SET balance = balance - ? WHERE account_number = ?',
                    [amount, fromAccount],
                    (err) => {
                        if (err) {
                            return db.rollback(() => {
                                res.json({ success: false, message: 'Ошибка списания средств' });
                            });
                        }

                        // Calculate dates
                        const startDate = new Date();
                        const endDate = new Date();
                        endDate.setMonth(endDate.getMonth() + parseInt(termMonths));

                        // Create deposit
                        db.query(
                            'INSERT INTO deposits (user_id, deposit_name, principal_amount, interest_rate, term_months, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?, ?)',
                            [userId, depositName, amount, interestRate, termMonths, startDate, endDate],
                            (err) => {
                                if (err) {
                                    return db.rollback(() => {
                                        res.json({ success: false, message: 'Ошибка создания депозита' });
                                    });
                                }

                                // Log transaction
                                db.query(
                                    'INSERT INTO transactions (user_id, transaction_type, amount, from_account, description) VALUES (?, ?, ?, ?, ?)',
                                    [userId, 'deposit_open', amount, fromAccount, `Открытие депозита: ${depositName}`],
                                    (err) => {
                                        if (err) {
                                            return db.rollback(() => {
                                                res.json({ success: false, message: 'Ошибка записи транзакции' });
                                            });
                                        }

                                        db.commit((err) => {
                                            if (err) {
                                                return db.rollback(() => {
                                                    res.json({ success: false, message: 'Ошибка завершения операции' });
                                                });
                                            }

                                            res.json({ success: true, message: 'Депозит успешно открыт!' });
                                        });
                                    }
                                );
                            }
                        );
                    }
                );
            }
        );
    });
});

// Get network IP address
function getNetworkIP() {
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();

    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            // Skip internal and non-IPv4 addresses
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return 'localhost';
}

// Start server
app.listen(PORT, '0.0.0.0', () => {
    const localIP = getNetworkIP();
    console.log('\n' + '='.repeat(60));
    console.log('🏦  BCC BANKING APPLICATION SERVER');
    console.log('='.repeat(60));
    console.log(`\n✅ Server is running!\n`);
    console.log('📍 Access the application:');
    console.log(`   🖥️  On this PC: http://localhost:${PORT}`);
    console.log(`   📱 On mobile (same WiFi): http://${localIP}:${PORT}\n`);
    console.log('🔐 Demo Login:');
    console.log('   Email: demo@bcc.kz');
    console.log('   Password: demo123\n');
    console.log('='.repeat(60) + '\n');
});