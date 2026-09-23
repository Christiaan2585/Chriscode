# 🌾 Sandveld Vee Dienste

Welcome to the **Sandveld Vee Dienste** app. This application is designed to manage clients, livestock health, herding programs, and invoicing in one professional dashboard.

## 🚀 First-time setup (development mode)

You don't need to run complex commands in the terminal.

1.  Ensure you have **Python 3.9+** and **Node.js 18+** installed on your Windows machine.
2.  Open the folder: `Documents\KyronAgriCRM`
3.  Double-click the file: **`launch.bat`**

### What happens when you run `launch.bat`?
- It creates a private virtual environment (`venv`) so it doesn't interfere with other Python apps.
- It installs the Python libraries (FastAPI, Pandas, etc.) and the desktop app's Node dependencies - the first time only.
- It starts the desktop app, which automatically starts the backend API for you.

## 📦 Building a standalone installer

Once the app is working well in day-to-day use, double-click **`desktop-app\build_and_package.bat`** to build a proper Windows installer (`.exe`) in `desktop-app\dist\`. This is a one-time (or per-release) step, separate from everyday use via `launch.bat`.

## 🛠️ Using the App
- **Dashboard**: Check for overdue treatments and total revenue.
- **Clients**: Manage contact info, add reminders, and contact clients via WhatsApp/Email.
- **Animals**: Track health history.
- **Herds / Programs**: Manage herd and vaccination programmes.
- **Quotes / Orders / Invoicing**: Import product prices via Excel and generate professional PDF invoices.

## 🔄 Updates
The app shows its version on the Settings page. To update, replace the folder with the latest version and run `launch.bat` again (or reinstall from a freshly built installer).

## 🗂️ Version control
Run **`setup_git.bat`** once to start tracking changes with git, so nothing is ever lost by accident. Your `kyron_agri.db` (real client data) is intentionally excluded from git via `.gitignore` - it's not meant to be versioned that way.

---
**Developed for Sandveld Vee Dienste.**
