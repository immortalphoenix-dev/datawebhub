@echo off
REM Build validation script for Windows - Verify build succeeds and artifacts are valid

setlocal enabledelayedexpansion

echo.
echo 🏗️  Building application...
echo.

REM Clean previous builds
if exist "dist" (
    rmdir /s /q dist
)

REM Run the build
call npm run build
if errorlevel 1 (
    echo ❌ Build failed
    exit /b 1
)

REM Verify build artifacts exist
if not exist "dist\public" (
    echo ❌ Client build failed - dist/public directory not found
    exit /b 1
)

if not exist "dist\index.js" (
    echo ❌ Server build failed - dist/index.js not found
    exit /b 1
)

REM Check that key files exist in client build
if not exist "dist\public\index.html" (
    echo ❌ Client index.html not found
    exit /b 1
)

REM Check that CSS was generated
dir /s "dist\public\assets\*.css" >nul 2>&1
if errorlevel 1 (
    echo ⚠️  No CSS files found in build
    exit /b 1
)

REM Check that JS bundles were generated
dir /s "dist\public\assets\*.js" >nul 2>&1
if errorlevel 1 (
    echo ❌ No JS bundles found in client build
    exit /b 1
)

echo.
echo 📊 Build Summary:
echo   ✓ Client bundle compiled
echo   ✓ Server bundle compiled
echo   ✓ All assets generated

echo.
echo ✓ Build validation passed
exit /b 0
