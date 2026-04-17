import subprocess
import time

from config import PYMOBILEDEVICE3


def is_running() -> bool:
    result = subprocess.run(
        ["pgrep", "-f", "pymobiledevice3 remote tunneld"],
        capture_output=True, text=True,
    )
    return bool(result.stdout.strip())


def start_tunnel() -> str:
    if is_running():
        return "⚠️ tunneld 已在執行中，無需重複啟動"
    script = (
        f'do shell script '
        f'"{PYMOBILEDEVICE3} remote tunneld '
        f'> /tmp/tunneld.log 2>&1 &" '
        f'with administrator privileges'
    )
    result = subprocess.run(["osascript", "-e", script], capture_output=True, text=True)
    if result.returncode != 0:
        return "❌ 啟動失敗（已取消授權或路徑錯誤）"
    time.sleep(1)
    if is_running():
        return "✅ tunneld 已在背景啟動"
    return "⚠️ 已授權但 tunneld 未偵測到，請確認 pymobiledevice3 路徑"


def stop_tunnel() -> str:
    if not is_running():
        return "⚠️ 找不到運行中的 tunneld"
    script = 'do shell script "pkill -9 -f \'pymobiledevice3 remote tunneld\'" with administrator privileges'
    result = subprocess.run(["osascript", "-e", script], capture_output=True, text=True)
    if result.returncode != 0:
        return "❌ 停止失敗（已取消授權）"
    if not is_running():
        return "✅ 已停止 tunneld"
    return "❌ 停止失敗"
