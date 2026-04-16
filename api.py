import json
import os
import threading
import time

import webview

import location
import tunnel
import storage
import patrol as patrol_module
import route_planner
from favorites_manager import CATEGORIES, auto_categorize
from config import SCRIPT_DIR, HISTORY_DIR


class Api:
    def __init__(self):
        self._window = None
        self._favorites = {}
        self._patrol_controller = None
        self._tunnel_polling = False

    def set_window(self, window):
        self._window = window
        self._favorites = storage.load_favorites()
        location.init(
            on_set=self._on_location_set,
            on_name=self._on_location_name,
        )
        self._tunnel_polling = True
        t = threading.Thread(target=self._poll_tunnel, daemon=True)
        t.start()

    def _on_location_set(self, lat_str, lng_str):
        self._push("location:set", {"lat": lat_str, "lng": lng_str})

    def _on_location_name(self, name=None, warning=None):
        self._push("location:name", {"name": name, "warning": warning})

    def _poll_tunnel(self):
        prev = None
        while self._tunnel_polling:
            running = tunnel.is_running()
            if running != prev:
                self._push("tunnel:status", {"running": running})
                prev = running
            time.sleep(2)

    def _push(self, event, data):
        if not self._window:
            return
        try:
            payload = json.dumps(data, ensure_ascii=False)
            self._window.evaluate_js(
                f'window.app && window.app.onEvent("{event}", {payload})'
            )
        except Exception:
            pass

    # ── Location ──────────────────────────────────────────────

    def set_location(self, lat, lng):
        return location.set_location(str(lat), str(lng))

    def clear_location(self):
        result = location.clear_location()
        self._push("location:clear", {})
        return result

    def parse_google_url(self, url):
        parsed = location.parse_google_url(url)
        if parsed:
            return {"lat": parsed[0], "lng": parsed[1], "label": parsed[2]}
        return {"error": "無法解析 Google Maps 網址"}

    def parse_coords(self, text):
        parsed = location.parse_coords(text)
        if parsed:
            return {"lat": parsed[0], "lng": parsed[1]}
        return {"error": "無法解析座標"}

    # ── Tunnel ────────────────────────────────────────────────

    def start_tunnel(self):
        msg = tunnel.start_tunnel()
        return {"message": msg}

    def stop_tunnel(self):
        msg = tunnel.stop_tunnel()
        return {"message": msg}

    # ── Favorites ─────────────────────────────────────────────

    def get_favorites(self):
        return self._favorites

    def add_favorite(self, name, lat, lng, category="其他"):
        self._favorites[name] = {
            "lat": str(lat),
            "lng": str(lng),
            "category": category,
        }
        storage.save_favorites(self._favorites)
        return {"ok": True}

    def delete_favorite(self, name):
        if name in self._favorites:
            del self._favorites[name]
            storage.save_favorites(self._favorites)
            return {"ok": True}
        return {"error": f"找不到收藏：{name}"}

    def update_favorites(self, data):
        self._favorites.clear()
        self._favorites.update(data)
        storage.save_favorites(self._favorites)
        return {"ok": True}

    def auto_categorize_favorites(self):
        moved = 0
        for name, info in self._favorites.items():
            cat = info.get("category", "")
            if not cat or cat == "其他":
                detected = auto_categorize(name)
                if detected != cat:
                    info["category"] = detected
                    moved += 1
        storage.save_favorites(self._favorites)
        return {"moved": moved, "favorites": self._favorites}

    # ── Route / File ──────────────────────────────────────────

    def open_file_dialog(self):
        try:
            initial_dir = HISTORY_DIR if os.path.isdir(HISTORY_DIR) else SCRIPT_DIR
            result = self._window.create_file_dialog(
                webview.OPEN_DIALOG,
                directory=initial_dir,
                file_types=("JSON 檔案 (*.json)",),
            )
            if result and len(result) > 0:
                return {"filepath": result[0]}
            return {"filepath": None}
        except Exception:
            return {"filepath": None}

    def save_file_dialog(self):
        try:
            initial_dir = HISTORY_DIR if os.path.isdir(HISTORY_DIR) else SCRIPT_DIR
            result = self._window.create_file_dialog(
                webview.SAVE_DIALOG,
                directory=initial_dir,
                file_types=("JSON 檔案 (*.json)",),
            )
            if result:
                filepath = result if isinstance(result, str) else result[0]
                return {"filepath": filepath}
            return {"filepath": None}
        except Exception:
            return {"filepath": None}

    def load_coord_list(self, filepath):
        try:
            items = storage.parse_coord_list_file(filepath)
            return {"items": items}
        except Exception as e:
            return {"error": str(e)}

    def save_coord_list(self, filepath, items):
        try:
            with open(filepath, "w", encoding="utf-8") as f:
                json.dump(items, f, ensure_ascii=False, indent=2)
            return {"ok": True}
        except Exception as e:
            return {"error": str(e)}

    def parse_coord_text(self, text, default_dwell=60):
        items = storage.parse_coord_text(text, default_dwell=default_dwell)
        return {"items": items}

    def plan_route(self, items, speed_kmh=20.0):
        flowers = []
        for it in items:
            try:
                flowers.append((float(it["lat"]), float(it["lng"])))
            except (ValueError, KeyError):
                continue

        result = route_planner.plan_route(flowers, speed_kmh=speed_kmh)
        route = result["route"]
        route_points = [{"lat": pt[0], "lng": pt[1]} for pt in route]

        mapped_route = route[:-1] if len(route) > 1 else route
        lookup = {}
        for it in items:
            key = (float(it["lat"]), float(it["lng"]))
            lookup[key] = it
        reordered = [lookup[pt] for pt in mapped_route if pt in lookup]

        return {
            "items": reordered,
            "covered": result["covered"],
            "total_dist": result["total_dist"],
            "valid": result["valid"],
            "warnings": result["warnings"],
            "route_points": route_points,
        }

    def orbit_route(self, items):
        flowers = []
        for it in items:
            try:
                flowers.append((float(it["lat"]), float(it["lng"])))
            except (ValueError, KeyError):
                continue

        if not flowers:
            return {"error": "無有效座標", "warnings": []}

        result = route_planner.orbit_route(flowers)
        waypoints = result["waypoints"]

        if not waypoints:
            return {"error": "無法產生外圈路線", "warnings": result["warnings"]}

        new_items = []
        for k, wp in enumerate(waypoints):
            new_items.append({
                "name": f"WP{k+1:02d}",
                "lat": f"{wp[0]:.8f}",
                "lng": f"{wp[1]:.8f}",
                "dwell": 0,
            })

        n = len(waypoints)
        total_dist = sum(
            route_planner.haversine(waypoints[i], waypoints[(i + 1) % n])
            for i in range(n)
        )

        return {
            "items": new_items,
            "radius_used": result["radius_used"],
            "total_dist": total_dist,
            "warnings": result["warnings"],
        }

    def fruit_route(self, items):
        flowers = []
        for it in items:
            try:
                flowers.append((float(it["lat"]), float(it["lng"])))
            except (ValueError, KeyError):
                continue

        result = route_planner.fruit_route(flowers)
        route = result["route"]

        lookup = {}
        for it in items:
            key = (float(it["lat"]), float(it["lng"]))
            lookup[key] = it
        reordered = [lookup[pt] for pt in route if pt in lookup]

        return {
            "items": reordered,
            "total_dist": result["total_dist"],
        }

    # ── Area Sweep ─────────────────────────────────────────────

    def sweep_polygon(self, vertices, spacing_m=40.0, angle_deg=0.0):
        pts = []
        for v in vertices:
            try:
                pts.append((float(v["lat"]), float(v["lng"])))
            except (ValueError, KeyError, TypeError):
                try:
                    pts.append((float(v[0]), float(v[1])))
                except Exception:
                    continue
        result = route_planner.sweep_polygon(pts, spacing_m=spacing_m, angle_deg=angle_deg)
        wps = result["waypoints"]
        items = []
        for k, wp in enumerate(wps):
            items.append({
                "name": f"SW{k + 1:03d}",
                "lat": f"{wp[0]:.8f}",
                "lng": f"{wp[1]:.8f}",
                "dwell": 0,
            })
        return {
            "items": items,
            "total_dist": result["total_dist"],
            "warnings": result["warnings"],
        }

    def sweep_circle(self, center_lat, center_lng, radius_m, spacing_m=40.0):
        center = (float(center_lat), float(center_lng))
        result = route_planner.sweep_circle(center, radius_m=float(radius_m), spacing_m=spacing_m)
        wps = result["waypoints"]
        items = []
        for k, wp in enumerate(wps):
            items.append({
                "name": f"SP{k + 1:03d}",
                "lat": f"{wp[0]:.8f}",
                "lng": f"{wp[1]:.8f}",
                "dwell": 0,
            })
        return {
            "items": items,
            "total_dist": result["total_dist"],
            "warnings": result["warnings"],
        }

    # ── Patrol ────────────────────────────────────────────────

    def start_patrol(self, items, start_idx=0, speed_kmh=20.0, mode="loop"):
        if self._patrol_controller and self._patrol_controller.is_running:
            return {"error": "巡邏已在執行中"}

        def location_fn(lat, lng, save_history=False, fetch_name=False):
            location.set_location(lat, lng, save_history=save_history, fetch_name=fetch_name)

        pc = patrol_module.PatrolController(location_fn=location_fn)
        pc.on_tick = lambda idx, name, remaining: self._push(
            "patrol:tick", {"idx": idx, "name": name, "remaining": remaining}
        )
        pc.on_travel = lambda idx_to, name_to, remaining_m, lat, lng: self._push(
            "patrol:travel", {
                "idx_to": idx_to,
                "name_to": name_to,
                "remaining_m": remaining_m,
                "lat": lat,
                "lng": lng,
            }
        )
        pc.on_finish = lambda: self._push("patrol:finish", {})
        self._patrol_controller = pc
        pc.start(items, start_idx=start_idx, speed_kmh=speed_kmh, mode=mode)
        return {"ok": True}

    def pause_patrol(self):
        if self._patrol_controller:
            self._patrol_controller.pause()
        return {"ok": True}

    def resume_patrol(self):
        if self._patrol_controller:
            self._patrol_controller.resume()
        return {"ok": True}

    def stop_patrol(self):
        if self._patrol_controller:
            self._patrol_controller.stop()
        return {"ok": True}

    # ── Cleanup ───────────────────────────────────────────────

    def cleanup(self):
        self._tunnel_polling = False
        location.stop_keepalive()
        if self._patrol_controller and self._patrol_controller.is_running:
            self._patrol_controller.stop()
