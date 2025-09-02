@echo off
echo ===============================================
echo  VisiGate Pro - Windows 11 Deployment Setup
echo ===============================================
echo.
echo This script configures native TEC B-EV4 thermal printing
echo for Windows 11 deployment with real printer integration.
echo.

REM Set Windows printing environment variable
echo Setting Windows printing environment...
set WINDOWS_PRINTING=true
setx WINDOWS_PRINTING true

echo.
echo ===============================================
echo  Printer Detection
echo ===============================================

REM Check for TEC B-EV4 printer
echo Checking for TEC B-EV4 Desktop Printer...
powershell.exe -Command "Get-Printer -Name 'TEC B-EV4 Desktop Printer' -ErrorAction SilentlyContinue | Select-Object Name, PrinterStatus, DriverName"

if %ERRORLEVEL% EQU 0 (
    echo ✅ TEC B-EV4 Desktop Printer found and ready!
) else (
    echo ⚠️  TEC B-EV4 Desktop Printer not found
    echo    Please ensure the printer is:
    echo    1. Connected via USB or network
    echo    2. Installed with proper Windows drivers
    echo    3. Named exactly 'TEC B-EV4 Desktop Printer' in Windows
    echo.
)

echo.
echo ===============================================
echo  Testing Native Thermal Printing
echo ===============================================

REM Test thermal printing capability
echo Testing Windows thermal printing commands...
echo This is a test print > temp_test.txt
echo Attempting to send test file to printer...

copy temp_test.txt "\\localhost\TEC B-EV4 Desktop Printer" 2>nul
if %ERRORLEVEL% EQU 0 (
    echo ✅ Direct printer copy successful
) else (
    echo ❌ Direct printer copy failed - trying print command...
    print /D:"TEC B-EV4 Desktop Printer" temp_test.txt 2>nul
    if %ERRORLEVEL% EQU 0 (
        echo ✅ Windows print command successful
    ) else (
        echo ❌ Both printing methods failed
        echo    Please check printer installation and permissions
    )
)

REM Clean up test file
del temp_test.txt 2>nul

echo.
echo ===============================================
echo  Deployment Instructions
echo ===============================================
echo.
echo To deploy VisiGate Pro on Windows 11:
echo.
echo 1. Install Node.js 20+ from nodejs.org
echo 2. Run: npm install
echo 3. Set environment: set WINDOWS_PRINTING=true
echo 4. Start server: npm run dev
echo.
echo The TEC B-EV4 thermal printer will now receive
echo raw ESC/P commands for optimal printing performance!
echo.
echo ===============================================
pause