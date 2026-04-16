import subprocess


def is_running() -> bool:
    result = subprocess.run(
        ["pgrep", "-f", "pymobiledevice3 remote tunneld"],
        capture_output=True, text=True,
    )
    return bool(result.stdout.strip())


def start_tunnel() -> str:
    if is_running():
        return "⚠️ tunneld 已在執行中，無需重複啟動"
    script = '''
    tell application "Terminal"
        activate
        do script "sudo pymobiledevice3 remote tunneld"
    end tell
    '''
    subprocess.run(["osascript", "-e", script], capture_output=True, text=True)
    return "✅ 已開啟 Terminal 執行 tunneld"


def stop_tunnel() -> str:
    if not is_running():
        return "⚠️ 找不到運行中的 tunneld"
    script = 'do shell script "pkill -9 -f \'pymobiledevice3 remote tunneld\'" with administrator privileges'
    subprocess.run(["osascript", "-e", script], capture_output=True, text=True)
    if not is_running():
        return "✅ 已停止 tunneld"
    return "❌ 停止失敗（可能已取消授權）"
