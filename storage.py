import os
import json
from datetime import datetime

from config import FAVORITES_FILE, HISTORY_DIR


def save_to_history(lat, lng):
    os.makedirs(HISTORY_DIR, exist_ok=True)
    today = datetime.now().strftime("%Y%m%d")
    history_file = os.path.join(HISTORY_DIR, f"{today}.json")
    if os.path.exists(history_file):
        with open(history_file, "r", encoding="utf-8") as f:
            records = json.load(f)
    else:
        records = []
    records.append({
        "lat": lat,
        "lng": lng,
        "time": datetime.now().strftime("%H:%M:%S"),
    })
    with open(history_file, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)


def load_favorites():
    if os.path.exists(FAVORITES_FILE):
        with open(FAVORITES_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_favorites(favorites):
    with open(FAVORITES_FILE, "w", encoding="utf-8") as f:
        json.dump(favorites, f, ensure_ascii=False, indent=2)


def parse_coord_list_file(filepath):
    """從 JSON 檔案讀取座標清單，回傳 list of {name, lat, lng, dwell}，失敗則拋出例外。"""
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)
    items = []
    if isinstance(data, list):
        for item in data:
            if "lat" in item and "lng" in item:
                name = item.get("name", f"{item['lat']}, {item['lng']}")
                items.append({
                    "name": name,
                    "lat": str(item["lat"]),
                    "lng": str(item["lng"]),
                    "dwell": int(item.get("dwell", 60)),
                })
    elif isinstance(data, dict):
        for name, coords in data.items():
            if "lat" in coords and "lng" in coords:
                items.append({
                    "name": name,
                    "lat": str(coords["lat"]),
                    "lng": str(coords["lng"]),
                    "dwell": int(coords.get("dwell", 60)),
                })
    return items
