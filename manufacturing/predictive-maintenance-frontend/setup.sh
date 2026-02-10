#!/bin/bash

# Predictive Maintenance Frontend Setup Script
echo "🚀 Setting up Predictive Maintenance Frontend"
echo "============================================"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 16+ first."
    echo "   Download from: https://nodejs.org/"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 16 ]; then
    echo "❌ Node.js version 16+ is required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js version: $(node -v)"

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "✅ Dependencies installed successfully"

# Check if backend is running
echo ""
echo "🔍 Checking backend connection..."
if curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo "✅ Backend server is running at http://localhost:8000"
else
    echo "⚠️  Backend server not detected at http://localhost:8000"
    echo "   Make sure to start the backend first:"
    echo "   cd ../predictive_maintenance"
    echo "   python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload"
fi

echo ""
echo "🎉 Setup complete!"
echo ""
echo "To start the frontend:"
echo "  npm run dev"
echo ""
echo "The application will be available at:"
echo "  http://localhost:3000"
echo ""
echo "API documentation:"
echo "  http://localhost:3000/docs"
echo ""
echo "Make sure both frontend (port 3000) and backend (port 8000) are running!"
