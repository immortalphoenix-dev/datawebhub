@echo off
REM Pre-commit hook for Windows - Run lint and type checks before committing
REM Copy this to .git\hooks\pre-commit (rename pre-commit to pre-commit with no extension on Windows)

setlocal enabledelayedexpansion

echo.
echo 🔍 Running pre-commit checks...
echo.

REM Check if npm is available
where npm >nul 2>nul
if errorlevel 1 (
    echo ❌ npm not found. Please install Node.js
    exit /b 1
)

REM Run TypeScript type check
echo 📝 Type checking...
call npm run check
if errorlevel 1 (
    echo ❌ TypeScript check failed
    exit /b 1
)

echo.
echo ✓ All pre-commit checks passed
exit /b 0
