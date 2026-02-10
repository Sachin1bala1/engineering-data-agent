@echo off
REM Predictive Maintenance Frontend Setup Script
echo 🚀 Setting up Predictive Maintenance Frontend
echo ============================================

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js is not installed. Please install Node.js 16+ first.
    echo    Download from: https://nodejs.org/
    pause
    exit /b 1
)

REM Check Node.js version
for /f "tokens=1 delims=v." %%i in ('node --version') do set NODE_MAJOR=%%i
if %NODE_MAJOR% lss 16 (
    echo ❌ Node.js version 16+ is required. Current version:
    node --version
    pause
    exit /b 1
)

echo ✅ Node.js version:
node --version

echo.
echo 📦 Installing dependencies...
call npm install

if %errorlevel% neq 0 (
    echo ❌ Failed to install dependencies
    pause
    exit /b 1
)

echo ✅ Dependencies installed successfully

echo.
echo 🔍 Checking backend connection...
curl -s http://localhost:8000/health >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Backend server is running at http://localhost:8000
) else (
    echo ⚠️  Backend server not detected at http://localhost:8000
    echo    Make sure to start the backend first:
    echo    cd ..\predictive_maintenance
    echo    python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
)

echo.
echo 🎉 Setup complete!
echo.
echo To start the frontend:
echo   npm run dev
echo.
echo The application will be available at:
echo   http://localhost:3000
echo.
echo API documentation:
echo   http://localhost:3000/docs
echo.
echo Make sure both frontend (port 3000) and backend (port 8000) are running!
echo.
pause
