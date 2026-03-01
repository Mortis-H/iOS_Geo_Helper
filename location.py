import subprocess
import re
import json
import threading
import urllib.request
import urllib.parse

from config import PYMOBILEDEVICE3
from storage import save_to_history

_root = None
_status = None
_lat_entry = None
_lng_entry = None
_location_name_label = None

_keepalive_lat: str = ""
_keepalive_lng: str = ""
_keepalive_id = None
_KEEPALIVE_MS = 10_000  # 每 10 秒重送一次定位指令


def setup(root, status, lat_entry, lng_entry, location_name_label):
    global _root, _status, _lat_entry, _lng_entry, _location_name_label
    _root = root
    _status = status
    _lat_entry = lat_entry
    _lng_entry = lng_entry
    _location_name_label = location_name_label


# ── Keep-Alive ────────────────────────────────────────────────────────────────

def _keepalive_tick():
    global _keepalive_id
    if not _keepalive_lat or not _keepalive_lng:
        return

    def run():
        try:
            proc = subprocess.Popen(
                [PYMOBILEDEVICE3, "developer", "dvt", "simulate-location", "set", "--",
                 _keepalive_lat, _keepalive_lng],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()
        except Exception:
            pass

    threading.Thread(target=run, daemon=True).start()
    _keepalive_id = _root.after(_KEEPALIVE_MS, _keepalive_tick)


def _start_keepalive(lat: str, lng: str):
    global _keepalive_lat, _keepalive_lng, _keepalive_id
    _keepalive_lat = lat
    _keepalive_lng = lng
    if _keepalive_id is not None:
        _root.after_cancel(_keepalive_id)
    _keepalive_id = _root.after(_KEEPALIVE_MS, _keepalive_tick)


def stop_keepalive():
    global _keepalive_lat, _keepalive_lng, _keepalive_id
    _keepalive_lat = ""
    _keepalive_lng = ""
    if _keepalive_id is not None:
        _root.after_cancel(_keepalive_id)
        _keepalive_id = None


# ── 座標解析（純函數）────────────────────────────────────────────────────────

def parse_google_url(url: str):
    """解析 Google Maps URL，回傳 (lat, lng, label) 或 None。"""
    m = re.search(r'!3d([-\d.]+)!4d([-\d.]+)', url)
    if m:
        return m.group(1), m.group(2), "地點座標"
    m = re.search(r'@([-\d.]+),([-\d.]+)', url)
    if m:
        return m.group(1), m.group(2), "地圖中心座標"
    return None


def parse_coords(text: str):
    """解析 'lat,lng' 或 'lat lng' 字串，回傳 (lat, lng) 或 None。"""
    m = re.match(r'^([-\d.]+)[,\s]+([-\d.]+)$', text.strip())
    if m:
        return m.group(1), m.group(2)
    return None


# ── 定位核心 ─────────────────────────────────────────────────────────────────

def set_location_direct(lat: str, lng: str, save_history: bool = True, _fetch_name: bool = True):
    """直接以參數設定位置，可從任意執行緒安全呼叫。"""
    try:
        lat_f = float(lat)
        lng_f = float(lng)
    except ValueError:
        _root.after(0, lambda: _status.config(text="❌ 經緯度格式錯誤"))
        return

    if not (-90 <= lat_f <= 90):
        _root.after(0, lambda: _status.config(text="❌ 緯度範圍錯誤（需介於 -90 ~ 90）"))
        return
    if not (-180 <= lng_f <= 180):
        _root.after(0, lambda: _status.config(text="❌ 經度範圍錯誤（需介於 -180 ~ 180）"))
        return

    def run_set():
        try:
            proc = subprocess.Popen(
                [PYMOBILEDEVICE3, "developer", "dvt", "simulate-location", "set", "--", lat, lng],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()
        except Exception:
            pass

    threading.Thread(target=run_set, daemon=True).start()
    if save_history:
        save_to_history(lat, lng)

    def update_ui():
        _lat_entry.delete(0, "end")
        _lat_entry.insert(0, lat)
        _lng_entry.delete(0, "end")
        _lng_entry.insert(0, lng)
        _status.config(text=f"✅ 已設定：{lat}, {lng}")
        _location_name_label.config(text="")
        _start_keepalive(lat, lng)

    _root.after(0, update_ui)

    def fetch_name():
        try:
            url = (
                f"https://nominatim.openstreetmap.org/reverse"
                f"?lat={urllib.parse.quote(lat)}&lon={urllib.parse.quote(lng)}"
                f"&format=json&accept-language=zh-TW"
            )
            req = urllib.request.Request(url, headers={"User-Agent": "iOS-LocationScript/1.0"})
            with urllib.request.urlopen(req, timeout=6) as resp:
                data = json.loads(resp.read())
            if "error" in data:
                _root.after(0, lambda: _location_name_label.config(
                    text="⚠️ 座標查無地點（可能為海洋或荒地）", fg="orange"))
                return
            name = data.get("display_name", "")
            if name:
                _root.after(0, lambda: _location_name_label.config(text=name, fg="gray"))
        except Exception:
            pass

    if _fetch_name:
        threading.Thread(target=fetch_name, daemon=True).start()


def clear_location():
    stop_keepalive()
    result = subprocess.run(
        [PYMOBILEDEVICE3, "developer", "dvt", "simulate-location", "clear"],
        capture_output=True, text=True,
    )
    if result.returncode == 0:
        _status.config(text="✅ 已清除")
    else:
        _status.config(text=f"❌ {result.stderr[:50]}")
