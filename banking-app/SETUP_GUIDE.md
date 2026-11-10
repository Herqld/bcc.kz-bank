# 🚀 Complete Setup Guide - BCC Banking Application

## ⚠️ IMPORTANT: Read This First!

This guide will walk you through EVERY step needed to run this banking application. Follow the steps in order.

---

## 📦 Step 1: Install Required Software

You need to install TWO programs before running the application:

### A) Install Node.js

1. Go to: https://nodejs.org/
2. Download the **LTS version** (recommended for most users)
3. Run the installer
4. Click "Next" through all steps (keep default settings)
5. Restart your computer after installation
6. Verify installation:
   - Open PowerShell
   - Type: `node --version`
   - You should see something like: `v18.17.0`

### B) Install MySQL

1. Go to: https://dev.mysql.com/downloads/mysql/
2. Download **MySQL Community Server**
3. Run the installer
4. Choose "Developer Default" setup
5. **IMPORTANT:** Remember the password you set for "root" user!
6. Complete the installation
7. Verify installation:
   - Open MySQL Workbench (installed with MySQL)
   - Try to connect with your root password

---

## 🔧 Step 2: Setup the Database

### Option A: Using MySQL Workbench (Easier)

1. Open **MySQL Workbench**
2. Click on your local connection
3. Enter your root password
4. Click "File" → "Open SQL Script"
5. Navigate to this project folder
6. Select `database.sql`
7. Click the lightning bolt icon ⚡ to execute
8. Wait for "Database setup completed successfully!" message

### Option B: Using Command Line

1. Open PowerShell
2. Navigate to project folder:
   ```powershell
   cd C:\Users\Hp\Desktop\CODE\banking-app
   ```
3. Run:
   ```powershell
   mysql -u root -p < database.sql
   ```
4. Enter your MySQL password when prompted

---

## 🔑 Step 3: Configure Server (If you have MySQL password)

If you set a password for MySQL root user, you MUST edit the server file:

1. Open `server.js` in any text editor (Notepad, VS Code, IntelliJ IDEA)
2. Find lines 23-28 (look for "MySQL Database Connection")
3. Change this line:
   ```javascript
   password: '',  // Change this to your MySQL password
   ```
   To:
   ```javascript
   password: 'YOUR_MYSQL_PASSWORD',
   ```
4. Save the file

---

## 📥 Step 4: Install Node.js Dependencies

1. Open PowerShell
2. Navigate to project folder:
   ```powershell
   cd C:\Users\Hp\Desktop\CODE\banking-app
   ```
3. Run:
   ```powershell
   npm install
   ```
4. Wait for installation to complete (might take 1-2 minutes)
5. You should see "added X packages" message

---

## ▶️ Step 5: Start the Application

1. In PowerShell (same folder), run:
   ```powershell
   npm start
   ```

2. You should see:
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

3. **Keep this PowerShell window open!** Closing it will stop the server.

---

## 🌐 Step 6: Open in Browser

### On Your PC:

1. Open any web browser (Chrome, Edge, Firefox)
2. Go to: `http://localhost:3000`
3. You should see the BCC Banking login page
4. Login with:
   - **Email:** demo@bcc.kz
   - **Password:** demo123

### On Your Mobile Phone (Same WiFi):

1. Look at the server startup message in PowerShell
2. Find the line that says: `📱 On mobile (same WiFi): http://192.168.X.X:3000`
3. Copy that EXACT address
4. On your phone, open browser
5. Type that address
6. The banking app will open!

**Example:** If server shows `http://192.168.1.105:3000`, type exactly that in your phone's browser.

---

## 🎉 Step 7: Use the Application

### Login:
- **Demo Email:** demo@bcc.kz
- **Demo Password:** demo123

OR create a new account by clicking "Зарегистрироваться" (Register)

### Available Features:

1. **Dashboard (Главная):** View total balance and all your cards
2. **Transfers (Переводы):** Send money by phone, card, or between your accounts
3. **Top-up (Пополнение):** Add money to your accounts
4. **Deposits (Депозиты):** Open savings deposits with interest
5. **History (История):** View all your transactions

---

## 🛑 How to Stop the Server

When you're done:

1. Go to the PowerShell window
2. Press `Ctrl + C`
3. Type `Y` if asked to terminate
4. Server is now stopped

To start again: Run `npm start`

---

## 🔥 Troubleshooting Common Problems

### Problem: "npm is not recognized"
**Solution:** Node.js is not installed or not in PATH
- Install Node.js from nodejs.org
- Restart your computer
- Try again

### Problem: "Cannot connect to database"
**Solution:** 
- Make sure MySQL is running (open MySQL Workbench to check)
- Check if you entered the correct password in `server.js`
- Make sure you ran `database.sql`

### Problem: "Port 3000 is already in use"
**Solution:** Another program is using port 3000
- Open `server.js`
- Change line 10: `const PORT = 3000;` to `const PORT = 3001;`
- Save and restart server
- Access at `http://localhost:3001`

### Problem: "Cannot access from mobile"
**Solution:**
- Make sure phone and PC are on SAME WiFi network
- Check Windows Firewall:
  - Open "Windows Defender Firewall"
  - Click "Allow an app through firewall"
  - Click "Change settings"
  - Find Node.js and check both Private and Public
- Try turning off Windows Firewall temporarily to test

### Problem: "Module not found error"
**Solution:**
- Delete `node_modules` folder
- Run `npm install` again

### Problem: "Database already exists error"
**Solution:**
- This is okay! The database was already created
- You can proceed to use the application

---

## 📖 Understanding the Application Structure

```
banking-app/
│
├── server.js              ← Backend: Handles requests, database operations
│
├── database.sql           ← Database: Creates tables and demo data
│
├── public/
│   ├── index.html        ← Frontend: Page structure
│   ├── styles.css        ← Frontend: Styling and colors
│   └── app.js            ← Frontend: User interactions
│
└── package.json          ← Node.js: Lists required packages
```

### How It Works:

1. **User opens browser** → Requests `index.html`
2. **Browser loads HTML/CSS/JS** → Shows the interface
3. **User clicks "Login"** → JavaScript sends request to server
4. **Server checks database** → Validates username/password
5. **Server responds** → "Success" or "Error"
6. **JavaScript updates page** → Shows dashboard or error message

All data is stored in MySQL database tables:
- `users` - User accounts
- `accounts` - Bank accounts/cards
- `deposits` - Deposit accounts
- `transactions` - Every money movement

---

## 🎨 Customization Examples

### Change the Green Color:

1. Open `public/styles.css`
2. Press `Ctrl + H` (Find and Replace)
3. Find: `#00B14F`
4. Replace with your color (e.g., `#FF5733` for orange)
5. Click "Replace All"
6. Save file
7. Refresh browser

### Change Bank Name:

1. Open `public/index.html`
2. Find: `BCC Bank` (appears multiple times)
3. Replace with your bank name
4. Save file
5. Refresh browser

### Add More Deposit Options:

1. Open `public/index.html`
2. Find lines 319-323 (deposit rates)
3. Add new option:
   ```html
   <option value="20">20% - на 36 месяцев</option>
   ```
4. Save and refresh

---

## 📞 Need Help?

If you're stuck:

1. Read the error message carefully
2. Check the Troubleshooting section above
3. Make sure you followed ALL steps in order
4. Verify Node.js and MySQL are installed: `node --version` and check MySQL Workbench

---

## ✅ Quick Checklist

Before asking for help, verify:

- [ ] Node.js is installed (`node --version` works)
- [ ] MySQL is installed and running
- [ ] Database was created (ran `database.sql`)
- [ ] If MySQL has password, you updated `server.js`
- [ ] Ran `npm install` successfully
- [ ] Server is running (`npm start`)
- [ ] Accessing correct URL in browser

---

## 🎓 Learning Resources

- **Node.js Tutorial:** https://nodejs.org/en/docs/guides/getting-started-guide/
- **MySQL Tutorial:** https://www.mysqltutorial.org/
- **JavaScript Basics:** https://javascript.info/
- **HTML/CSS Guide:** https://www.w3schools.com/

---

**Good luck! 🚀 You now have a fully functional banking application!**