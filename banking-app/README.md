# BCC-Style Banking Application

A complete, fully functional web-based banking application inspired by Bank CenterCredit (bcc.kz). Built with Node.js, Express, MySQL, and vanilla JavaScript.

## 📋 Features

- ✅ User Authentication (Login/Register)
- ✅ Dashboard with Total Balance Display
- ✅ Multiple Cards/Accounts Management
- ✅ Money Transfers (by Phone, Card Number, Between Own Accounts)
- ✅ Account Top-up
- ✅ Deposit Management with Interest Rates
- ✅ Complete Transaction History
- ✅ Fully Responsive (Desktop & Mobile)
- ✅ BCC-Inspired Green Theme

## 🚀 Quick Start Guide

### Prerequisites

Before running this application, make sure you have installed:

1. **Node.js** (v14 or higher) - [Download here](https://nodejs.org/)
2. **MySQL** (v5.7 or higher) - [Download here](https://dev.mysql.com/downloads/mysql/)

### Installation Steps

#### Step 1: Install Node.js Dependencies

Open PowerShell/Terminal in the project folder and run:

```powershell
npm install
```

This will install all required packages (Express, MySQL2, bcryptjs, etc.)

#### Step 2: Setup MySQL Database

1. Open **MySQL Workbench** or **MySQL Command Line Client**
2. Login with your MySQL credentials
3. Open the `database.sql` file in this project
4. Run the entire SQL script (it will create the database, tables, and demo data)

**OR** you can run it from command line:

```powershell
mysql -u root -p < database.sql
```

**Important:** If your MySQL has a password, you need to edit `server.js` file:
- Open `server.js`
- Find line 23-28 (MySQL connection settings)
- Change `password: ''` to your MySQL password

#### Step 3: Start the Server

Run the following command:

```powershell
npm start
```

You should see:

```
============================================================
🏦  BCC BANKING APPLICATION SERVER
============================================================

✅ Server is running!

📍 Access the application:
   🖥️  On this PC: http://localhost:3000
   📱 On mobile (same WiFi): http://192.168.X.X:3000

🔐 Demo Login:
   Email: demo@bcc.kz
   Password: demo123
============================================================
```

## 📱 How to Access on Mobile

### PC Access:
Simply open your browser and go to: `http://localhost:3000`

### Mobile Access (Same WiFi Network):

1. Make sure your phone and PC are connected to the **same WiFi network**
2. Look at the server startup message - it shows your local IP (e.g., `http://192.168.1.5:3000`)
3. On your phone's browser, type that exact address
4. The banking app will open on your phone!

**To find your IP manually:**

```powershell
ipconfig
```

Look for "IPv4 Address" under your WiFi adapter (usually starts with 192.168.x.x)

## 🔐 Demo Account

- **Email:** demo@bcc.kz
- **Password:** demo123

The demo account comes with:
- 2 cards (Visa & Mastercard) with balance
- 1 savings account
- 1 active deposit
- Sample transaction history

## 📁 Project Structure

```
banking-app/
├── public/                # Frontend files
│   ├── index.html        # Main HTML structure
│   ├── styles.css        # All styling (BCC green theme)
│   └── app.js            # Frontend JavaScript
├── server.js             # Backend Node.js server
├── database.sql          # MySQL database setup
├── package.json          # Node.js dependencies
└── README.md            # This file
```

## 🎨 Manual Editing Guide

### Change Colors/Theme

**File:** `public/styles.css`

1. **Primary Green Color** (Line 288, 323, 432, etc.):
   - Find: `#00B14F`
   - Replace with your color code

2. **Background Color** (Line 9):
   - Find: `background-color: #F5F5F5;`
   - Change to your preferred background

3. **Card Colors** (Lines 540-549):
   - Visa card gradient: `.card-item.visa`
   - Mastercard gradient: `.card-item.mastercard`

### Change Text/Labels

**File:** `public/index.html`

- Line 40-45: Navigation menu text
- Line 88-91: Login form title and labels
- Line 125-185: All page headers and labels

### Change Deposit Interest Rates

**File:** `public/index.html`

- **Line 319-323:** Deposit rate options
  ```html
  <option value="12">12% - на 12 месяцев</option>
  ```
  Change the percentage value and text

**File:** `database.sql`

- **Line 74:** Demo deposit interest rate
  ```sql
  interest_rate DECIMAL(5, 2) NOT NULL,
  ```

### Change Transfer Methods

**File:** `public/index.html`

- **Line 193-197:** Transfer tabs
  Add new tab:
  ```html
  <button class="tab-btn" data-tab="newMethod">New Method</button>
  ```

- Then add corresponding form below Line 240

### Change Server Port

**File:** `server.js`

- **Line 10:** Change `const PORT = 3000;` to any port you want

### Change MySQL Connection Settings

**File:** `server.js`

- **Lines 23-28:** MySQL connection configuration
  ```javascript
  const db = mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '',  // Your MySQL password
      database: 'banking_app'
  });
  ```

## 💾 View Database Logs Manually

### Using MySQL Workbench:

1. Open MySQL Workbench
2. Connect to your database
3. Click on `banking_app` database
4. Click on `transactions` table
5. Right-click → "Select Rows - Limit 1000"
6. You'll see all transaction logs

### Using Command Line:

```sql
mysql -u root -p
USE banking_app;
SELECT * FROM transactions ORDER BY transaction_date DESC;
SELECT * FROM users;
SELECT * FROM accounts;
SELECT * FROM deposits;
```

## 🛠️ Technical Terms Explained

### Frontend (HTML/CSS/JavaScript)
The visual part of the website that users see and interact with:
- **HTML:** Creates the structure (buttons, forms, text)
- **CSS:** Adds styling (colors, layout, animations)
- **JavaScript:** Makes it interactive (clicking buttons, submitting forms)

### Backend (Node.js/Express)
The "brain" running on the server:
- Processes requests from the frontend
- Calculates transfers and balances
- Enforces rules (checking sufficient balance)
- Located in `server.js`

### MySQL Database
A structured storage system (like organized Excel spreadsheets):
- **users table:** Stores user accounts and passwords
- **accounts table:** Stores bank cards and balances
- **transactions table:** Logs every money movement
- **deposits table:** Stores deposit information

### Responsive Design
The app automatically adapts to screen size:
- Desktop: Wide dashboard layout with top navigation
- Mobile: Vertical stacked layout with bottom navigation bar
- Uses CSS Media Queries (Lines 827-965 in styles.css)

### IPv4 Address
Your computer's identification number on your local WiFi:
- Format: 192.168.x.x or 10.0.x.x
- Used to access the app from other devices on same network
- Find it with `ipconfig` command

### API (Application Programming Interface)
The communication channel between frontend and backend:
- Example: `/api/login`, `/api/transfer`, `/api/dashboard`
- Frontend sends requests, backend sends responses
- Located in `server.js` (Lines 73-400+)

### Sessions
Temporary storage that remembers logged-in users:
- When you login, a session is created
- Session expires after 24 hours or when you logout
- Stored in server memory (not in database)

## 🐛 Troubleshooting

### Problem: "Cannot connect to database"
**Solution:** 
- Make sure MySQL is running
- Check MySQL password in `server.js` (line 26)
- Verify database `banking_app` exists

### Problem: "Port 3000 already in use"
**Solution:** 
- Change PORT in `server.js` line 10 to another number (e.g., 3001)
- Or stop the other application using port 3000

### Problem: "Cannot access from mobile"
**Solution:**
- Verify both devices are on the same WiFi
- Check Windows Firewall - allow port 3000
- Use the correct IP address from server startup message

### Problem: "npm install fails"
**Solution:**
- Make sure Node.js is installed: `node --version`
- Try: `npm cache clean --force` then `npm install` again

## 📚 Additional Resources

- [Node.js Documentation](https://nodejs.org/docs/)
- [Express.js Guide](https://expressjs.com/)
- [MySQL Documentation](https://dev.mysql.com/doc/)
- [HTML/CSS/JavaScript Tutorial](https://www.w3schools.com/)

## 📄 License

This is a learning/demo project. Feel free to modify and use as needed.

## 🎓 Learning Notes

### How Money Transfer Works:
1. User submits transfer form (Frontend)
2. JavaScript sends request to `/api/transfer` (Frontend)
3. Server receives request (Backend)
4. Server checks sender's balance (Backend + Database)
5. If sufficient, deduct from sender (Database UPDATE)
6. Add to receiver if internal transfer (Database UPDATE)
7. Log transaction (Database INSERT)
8. Send success response (Backend → Frontend)
9. Frontend updates display (Frontend)

### Security Features:
- Passwords are hashed with bcrypt (not stored as plain text)
- SQL injection protection with parameterized queries
- Session-based authentication
- Server-side validation for all operations

---

**Created by:** Senior Full-Stack Developer
**Date:** 2026
**Version:** 1.0.0