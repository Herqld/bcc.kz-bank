# 🎯 How to Open and Run in IntelliJ IDEA

## Method 1: Open as Existing Project

1. **Open IntelliJ IDEA**
2. Click **"Open"** (not "New Project")
3. Navigate to: `C:\Users\Hp\Desktop\CODE\banking-app`
4. Click **"OK"**
5. IntelliJ will detect it's a Node.js project
6. Wait for indexing to complete (bottom right corner)

---

## Method 2: Drag and Drop

1. Open **File Explorer**
2. Navigate to: `C:\Users\Hp\Desktop\CODE\banking-app`
3. **Drag the folder** into IntelliJ IDEA window
4. IntelliJ will open it as a project

---

## 📦 Install Dependencies in IntelliJ

### Option A: Using IntelliJ Terminal

1. In IntelliJ, click **"Terminal"** tab at the bottom
2. Type:
   ```
   npm install
   ```
3. Press Enter
4. Wait for installation to complete

### Option B: Using package.json

1. Open `package.json` file
2. IntelliJ will show a banner: "Install dependencies"
3. Click **"Run 'npm install'"**

---

## ▶️ Run the Application in IntelliJ

### Method 1: Using Terminal

1. Click **"Terminal"** tab at bottom
2. Type:
   ```
   npm start
   ```
3. Press Enter
4. Server will start
5. You'll see the access URLs

### Method 2: Using Run Configuration

1. Right-click on `server.js`
2. Click **"Run 'server.js'"**
3. Or press **Shift + F10**

### Method 3: Using npm Scripts

1. Open `package.json`
2. Look for the "scripts" section
3. Click the green ▶️ play button next to "start"
4. Server will start in the Run panel

---

## 🌐 Access the Application

Once the server is running, open your browser and go to:

- **PC:** http://localhost:3000
- **Mobile:** http://YOUR-IP:3000 (shown in server startup message)

**Demo Login:**
- Email: demo@bcc.kz
- Password: demo123

---

## 🛑 Stop the Application

### If running in Terminal:
- Click in the terminal
- Press **Ctrl + C**

### If running in Run panel:
- Click the red **Stop** button (⏹️)
- Or press **Ctrl + F2**

---

## 🔧 IntelliJ Useful Features

### View Project Structure:
- Click **"Project"** tab on the left
- Expand folders to see all files

### Edit Files:
- Double-click any file to open
- `server.js` - Backend code
- `public/index.html` - Frontend HTML
- `public/styles.css` - Styling
- `public/app.js` - Frontend JavaScript

### Search in Project:
- Press **Ctrl + Shift + F** (Find in Files)
- Type what you're looking for
- See all occurrences

### Format Code:
- Open any file
- Press **Ctrl + Alt + L**
- Code will be auto-formatted

### Multiple Files Side-by-Side:
- Right-click a file tab
- Choose **"Split Right"** or **"Split Down"**

---

## 📝 Edit Configuration in IntelliJ

### Setup Run/Debug Configuration:

1. Click **"Run"** → **"Edit Configurations..."**
2. Click **"+"** → **"Node.js"**
3. **Name:** BCC Banking App
4. **Node interpreter:** (auto-detected)
5. **Working directory:** `C:\Users\Hp\Desktop\CODE\banking-app`
6. **JavaScript file:** `server.js`
7. Click **"OK"**

Now you can use the green ▶️ button in the toolbar to start!

---

## 🐛 Debug in IntelliJ

1. Set breakpoints: Click in the left gutter next to line numbers
2. Click the **Debug** button (🐞) instead of Run
3. Access the app in browser
4. IntelliJ will pause at breakpoints
5. Inspect variables, step through code

---

## 🗄️ Database Tools in IntelliJ

### Connect to MySQL:

1. Click **"Database"** tab on the right
2. Click **"+"** → **"Data Source"** → **"MySQL"**
3. **Host:** localhost
4. **Port:** 3306
5. **Database:** banking_app
6. **User:** root
7. **Password:** (your MySQL password)
8. Click **"Test Connection"**
9. Click **"OK"**

### View Data:

1. Expand **banking_app** in Database panel
2. Expand **tables**
3. Double-click **transactions** (or any table)
4. See all data in a grid view
5. You can edit data directly!

### Run SQL Queries:

1. Right-click **banking_app**
2. Click **"New"** → **"Query Console"**
3. Type SQL:
   ```sql
   SELECT * FROM transactions ORDER BY transaction_date DESC;
   ```
4. Press **Ctrl + Enter** to run

---

## 📂 Useful IntelliJ Shortcuts

| Action | Shortcut |
|--------|----------|
| Open file | Ctrl + Shift + N |
| Find in files | Ctrl + Shift + F |
| Run | Shift + F10 |
| Debug | Shift + F9 |
| Stop | Ctrl + F2 |
| Terminal | Alt + F12 |
| Format code | Ctrl + Alt + L |
| Search everywhere | Double Shift |
| Go to line | Ctrl + G |
| Comment line | Ctrl + / |

---

## 🎨 Recommended IntelliJ Plugins

1. **Node.js** (usually pre-installed)
2. **Database Tools** (usually pre-installed)
3. **Git** (usually pre-installed)

---

## ⚠️ Common IntelliJ Issues

### "Cannot find module"
**Solution:**
- Right-click `node_modules` folder
- Click **"Mark Directory as"** → **"Excluded"**
- Then click **"Mark Directory as"** → **"Not Excluded"**
- Or run `npm install` again

### "Port already in use"
**Solution:**
- Stop all running servers in IntelliJ
- Check Run panel at bottom
- Stop all active processes

### "Node interpreter not configured"
**Solution:**
- Go to **"File"** → **"Settings"**
- Search for "Node.js"
- Set Node interpreter path (usually auto-detected)

---

## 📚 Next Steps

1. **Explore the code:** Read through `server.js` to understand backend
2. **Modify styling:** Edit `public/styles.css` to change colors
3. **Add features:** Try adding new pages or functionality
4. **Learn more:** Check the main README.md for detailed explanations

---

## ✅ Quick Checklist for IntelliJ

- [ ] Project opened in IntelliJ
- [ ] Dependencies installed (`npm install`)
- [ ] MySQL database setup completed
- [ ] Server password configured in `server.js` (if needed)
- [ ] Server started (`npm start`)
- [ ] Browser opened to http://localhost:3000
- [ ] Successfully logged in

---

**You're all set! Happy coding in IntelliJ IDEA! 🚀**