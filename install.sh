#!/bin/zsh

echo "=== iOS Geo Helper 安裝腳本 ==="
echo ""

# 取得腳本所在目錄
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="$SCRIPT_DIR/.venv"

# 檢查 Homebrew
if command -v brew &> /dev/null; then
    echo "✅ Homebrew 已安裝"
else
    echo "📦 安裝 Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zshrc
    eval "$(/opt/homebrew/bin/brew shellenv)"
fi

# 檢查 Python
if command -v python3 &> /dev/null; then
    echo "✅ Python 已安裝 ($(python3 --version))"
else
    echo "📦 安裝 Python..."
    brew install python
fi

# 檢查 pipx
if command -v pipx &> /dev/null; then
    echo "✅ pipx 已安裝"
else
    echo "📦 安裝 pipx..."
    brew install pipx
    pipx ensurepath
    source ~/.zshrc
fi

# 檢查 pymobiledevice3
if command -v pymobiledevice3 &> /dev/null; then
    echo "✅ pymobiledevice3 已安裝"
else
    echo "📦 安裝 pymobiledevice3..."
    pipx install pymobiledevice3
fi

# 建立虛擬環境並安裝依賴
echo ""
echo "📦 建立虛擬環境..."
python3 -m venv "$VENV_DIR"
PYTHON_PATH="$VENV_DIR/bin/python3"
echo "📦 使用 Python: $PYTHON_PATH"

echo "📦 安裝 Python 依賴..."
"$PYTHON_PATH" -m pip install --upgrade pip -q
"$PYTHON_PATH" -m pip install -r "$SCRIPT_DIR/requirements.txt"

# 驗證 pywebview
"$PYTHON_PATH" -c "import webview" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "❌ pywebview 安裝失敗"
    exit 1
fi
echo "✅ pywebview 已安裝"

# 取得絕對路徑寫死到 .app
RESOLVED_PYTHON="$(realpath "$PYTHON_PATH")"
RESOLVED_SCRIPT_DIR="$(realpath "$SCRIPT_DIR")"

# 產生 .app 應用程式
APP_DIR="$SCRIPT_DIR/iOS虛擬定位.app/Contents/MacOS"
RES_DIR="$SCRIPT_DIR/iOS虛擬定位.app/Contents/Resources"
mkdir -p "$APP_DIR" "$RES_DIR"

# 複製圖示
if [ -f "$SCRIPT_DIR/AppIcon.icns" ]; then
    cp "$SCRIPT_DIR/AppIcon.icns" "$RES_DIR/AppIcon.icns"
    echo "✅ 已加入應用程式圖示"
else
    echo "⚠️ 未找到 AppIcon.icns，將使用預設圖示"
fi

cat > "$APP_DIR/iOS虛擬定位" <<SCRIPT
#!/bin/zsh
cd "$RESOLVED_SCRIPT_DIR"
"$RESOLVED_PYTHON" main.py
SCRIPT
chmod +x "$APP_DIR/iOS虛擬定位"

cat > "$SCRIPT_DIR/iOS虛擬定位.app/Contents/Info.plist" << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>iOS虛擬定位</string>
    <key>CFBundleName</key>
    <string>iOS Geo Helper</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon</string>
</dict>
</plist>
EOF

echo ""
echo "✅ 安裝完成！"
echo ""
echo "應用程式位於：$SCRIPT_DIR/iOS虛擬定位.app"
echo "虛擬環境位於：$VENV_DIR"
echo ""
echo "使用方式："
echo "  雙擊「iOS虛擬定位.app」"
echo "  或在終端機執行：$PYTHON_PATH main.py"
echo ""
echo "⚠️  首次開啟若被 macOS 阻擋，請到「系統設定 > 隱私權與安全性」允許執行"
