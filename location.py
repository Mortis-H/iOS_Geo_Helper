import subprocess
import re
import json
import threading
import urllib.request
import urllib.parse

from config import PYMOBILEDEVICE3
from storage import save_to_history

_on_set = None
_on_name = None

_keepalive_lat = ""
_keepalive_lng = ""
_keepalive_timer = None
_KEEPALIVE_SEC = 10


def init(on_set=None, on_name=None):
    global _on_set, _on_name
    _on_set = on_set
    _on_name = on_name


def _keepalive_tick():
    global _keepalive_timer
    if not _keepalive_lat or not _keepalive_lng:
        return
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
    _keepalive_timer = threading.Timer(_KEEPALIVE_SEC, _keepalive_tick)
    _keepalive_timer.daemon = True
    _keepalive_timer.start()


def _start_keepalive(lat: str, lng: str):
    global _keepalive_lat, _keepalive_lng, _keepalive_timer
    _keepalive_lat = lat
    _keepalive_lng = lng
    if _keepalive_timer is not None:
        _keepalive_timer.cancel()
    _keepalive_timer = threading.Timer(_KEEPALIVE_SEC, _keepalive_tick)
    _keepalive_timer.daemon = True
    _keepalive_timer.start()


def stop_keepalive():
    global _keepalive_lat, _keepalive_lng, _keepalive_timer
    _keepalive_lat = ""
    _keepalive_lng = ""
    if _keepalive_timer is not None:
        _keepalive_timer.cancel()
        _keepalive_timer = None


def set_location(lat: str, lng: str, save_history=True, fetch_name=True):
    try:
        lat_f = float(lat)
        lng_f = float(lng)
    except ValueError:
        return {"error": "經緯度格式錯誤"}

    if not (-90 <= lat_f <= 90):
        return {"error": "緯度範圍錯誤（需介於 -90 ~ 90）"}
    if not (-180 <= lng_f <= 180):
        return {"error": "經度範圍錯誤（需介於 -180 ~ 180）"}

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
    _start_keepalive(lat, lng)

    if save_history:
        save_to_history(lat, lng)

    if _on_set:
        try:
            _on_set(lat, lng)
        except Exception:
            pass

    if fetch_name:
        threading.Thread(target=lambda: _do_reverse_geocode(lat, lng), daemon=True).start()

    return {"ok": True, "lat": lat, "lng": lng}


def clear_location():
    stop_keepalive()
    try:
        result = subprocess.run(
            [PYMOBILEDEVICE3, "developer", "dvt", "simulate-location", "clear"],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode == 0:
            return {"ok": True}
        return {"error": result.stderr[:80]}
    except Exception as e:
        return {"error": str(e)}


def parse_google_url(url: str):
    m = re.search(r'!3d([-\d.]+)!4d([-\d.]+)', url)
    if m:
        return m.group(1), m.group(2), "地點座標"
    m = re.search(r'@([-\d.]+),([-\d.]+)', url)
    if m:
        return m.group(1), m.group(2), "地圖中心座標"
    return None


def parse_coords(text: str):
    m = re.match(r'^([-\d.]+)[,\s]+([-\d.]+)$', text.strip())
    if m:
        return m.group(1), m.group(2)
    return None


def reverse_geocode(lat, lng):
    try:
        url = (
            f"https://nominatim.openstreetmap.org/reverse"
            f"?lat={urllib.parse.quote(str(lat))}&lon={urllib.parse.quote(str(lng))}"
            f"&format=json&accept-language=zh-TW"
        )
        req = urllib.request.Request(url, headers={"User-Agent": "iOS-LocationScript/1.0"})
        with urllib.request.urlopen(req, timeout=6) as resp:
            data = json.loads(resp.read())
        if "error" in data:
            return None
        return data.get("display_name")
    except Exception:
        return None


def _do_reverse_geocode(lat, lng):
    name = reverse_geocode(lat, lng)
    if _on_name:
        try:
            if name:
                _on_name(name=name, warning=None)
            else:
                _on_name(name=None, warning="座標查無地點（可能為海洋或荒地）")
        except Exception:
            pass
