# iOS Geo Helper

macOS 上透過 `pymobiledevice3` 模擬 iPhone GPS 定位的桌面工具，以互動式地圖為操作核心。

## 系統需求

- macOS（Apple Silicon / Intel）
- iPhone 透過 USB 連接
- iOS 17+ 需開啟開發者模式，並啟動 Tunnel（`sudo pymobiledevice3 remote tunneld`）
- Python 3 + pywebview + pymobiledevice3（由 `install.sh` 自動安裝）

## 專案結構

```
iOS_Geo_Helper/
├── main.py                  # pywebview 入口點
├── api.py                   # Api class：前後端橋接層
├── web/                     # 前端資源
│   ├── index.html           #   單頁應用主結構
│   ├── style.css            #   深色主題樣式
│   └── js/
│       ├── app.js           #   應用控制器：狀態管理、API 呼叫、事件分發
│       ├── map.js           #   Leaflet 地圖：Marker、Polyline、Circle、右鍵選單
│       └── sidebar.js       #   側邊欄：Tab 切換、清單管理、拖曳排序
├── location.py              # 定位核心：set/clear、keep-alive、座標解析、Nominatim 反查
├── tunnel.py                # tunneld 生命週期：start/stop/is_running（macOS osascript）
├── storage.py               # 持久化：favorites.json、history、JSON 清單、座標文字解析
├── patrol.py                # PatrolController：背景執行緒巡邏、暫停/繼續/停止、線性插值
├── route_planner.py         # 路線演算法：plan_route（種花）、orbit_route（外圈）、fruit_route（種果）
├── favorites_manager.py     # 分類邏輯：CATEGORIES、auto_categorize()
├── config.py                # 路徑常數：SCRIPT_DIR、PYMOBILEDEVICE3
├── version.py               # __version__ = "3.0"
├── requirements.txt         # pywebview>=5.0
├── favorites.json           # 預設收藏地點
├── install.sh               # 安裝腳本
├── build.sh                 # PyInstaller 打包
├── loc.sh                   # zsh CLI 捷徑
└── .gitignore
```

## 架構

```
┌─ pywebview 視窗 ──────────────────────────────────────────────┐
│  ┌─ HTML/JS 前端 ───────────────────────────────────────────┐ │
│  │  Leaflet 地圖（全螢幕）+ 可收合側邊欄                      │ │
│  │  ├─ 點擊地圖 → 填入座標 / 加入路線 / 加入收藏             │ │
│  │  ├─ 拖曳路線 Marker → 即時更新路徑                        │ │
│  │  ├─ 花圈 Circle overlay → 視覺化覆蓋範圍                  │ │
│  │  └─ 巡邏 Marker 動畫 → 即時顯示模擬位置                   │ │
│  └──────────────┬──────────────────────────────────────────┘ │
│                 │  JS: window.pywebview.api.method()          │
│                 │  PY: window.evaluate_js('app.onEvent(...)')  │
│  ┌──────────────▼──────────────────────────────────────────┐ │
│  │  Python 後端                                             │ │
│  │  api.py → location.py / tunnel.py / patrol.py            │ │
│  │           storage.py / route_planner.py                   │ │
│  └──────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

## 通訊設計

### JS → Python（使用者操作）

前端透過 `await window.pywebview.api.method(args)` 呼叫後端，每個方法回傳 JSON-serializable dict。

| 類別 | 方法 |
|------|------|
| 定位 | `set_location(lat, lng)`, `clear_location()`, `parse_google_url(url)`, `parse_coords(text)` |
| Tunnel | `start_tunnel()`, `stop_tunnel()` |
| 收藏 | `get_favorites()`, `add_favorite(name, lat, lng, category)`, `delete_favorite(name)`, `update_favorites(data)`, `auto_categorize_favorites()` |
| 路線 | `open_file_dialog()`, `save_file_dialog()`, `load_coord_list(filepath)`, `save_coord_list(filepath, items)`, `parse_coord_text(text, default_dwell)`, `plan_route(items, speed_kmh)`, `orbit_route(items)`, `fruit_route(items)` |
| 巡邏 | `start_patrol(items, start_idx, speed_kmh, mode)`, `pause_patrol()`, `resume_patrol()`, `stop_patrol()` |

### Python → JS（即時推送）

後端透過 `window.evaluate_js('app.onEvent(event, data)')` 推送事件：

| 事件 | 資料 | 來源 |
|------|------|------|
| `tunnel:status` | `{running}` | 輪詢執行緒（每 2 秒） |
| `location:set` | `{lat, lng}` | set_location 成功後 |
| `location:name` | `{name, warning}` | Nominatim 反查結果 |
| `patrol:tick` | `{idx, name, remaining}` | 巡邏停留倒數 |
| `patrol:travel` | `{idx_to, name_to, remaining_m, lat, lng}` | 巡邏移動插值 |
| `patrol:finish` | `{}` | 巡邏結束 |

## 模組說明

### `api.py` — 前後端橋接

`Api` 類別，所有 public method 透過 pywebview 的 `js_api` 暴露給前端。負責：
- 初始化 location 回呼、啟動 tunnel 輪詢執行緒
- 封裝所有後端模組的呼叫，統一回傳 dict 格式
- 透過 `_push()` 推送即時事件到前端

### `location.py` — 定位核心

- `init(on_set, on_name)`：註冊回呼函式（取代 Tkinter widget 注入）
- `set_location(lat, lng, save_history, fetch_name)`：驗證 → subprocess → keepalive → 回呼
- keep-alive 使用 `threading.Timer` 每 10 秒重送定位
- `reverse_geocode(lat, lng)`：Nominatim 同步查詢（呼叫方需在執行緒內呼叫）

### `tunnel.py` — Tunnel 管理

三個純函式：`is_running()`, `start_tunnel()`, `stop_tunnel()`。無狀態、無 UI 依賴。

### `patrol.py` — 巡邏控制器

`PatrolController` 類別，透過 `location_fn` 注入定位函式（解耦）。
- 三種模式：loop / pingpong / once
- `on_travel` 回呼包含 `(idx_to, name_to, remaining_m, lat, lng)` 供地圖動畫

### `route_planner.py` — 路線演算法

| 函式 | 模式 | 演算法 |
|------|------|--------|
| `plan_route(flowers, speed_kmh)` | 種花（封閉循環） | greedy nearest-neighbor → 2-opt |
| `orbit_route(flowers)` | 外圈（凸包繞行） | 凸包 → 頂點圓弧 → 安全半徑 |
| `fruit_route(flowers)` | 種果（開放單向） | greedy → 2-opt open |

### `storage.py` — 持久化

| 函式 | 說明 |
|------|------|
| `load_favorites()` / `save_favorites()` | favorites.json 讀寫 |
| `save_to_history(lat, lng)` | 每日 history/YYYYMMDD.json |
| `parse_coord_list_file(filepath)` | 解析 JSON 座標清單 |
| `parse_coord_text(text, default_dwell)` | 解析多行座標文字 |

### `favorites_manager.py` — 分類邏輯

- `CATEGORIES = ["純點", "花點", "菇點", "其他"]`
- `auto_categorize(name)`：依關鍵字推測分類（菇 → 菇點、純點 → 純點、花 → 花點）

## 前端設計

### 地圖互動

- **左鍵點擊**：填入座標到輸入欄
- **右鍵點擊**：顯示選單 → 設定位置 / 加入路線 / 加入收藏
- **收藏 Marker**：依分類著色（純點藍、花點粉、菇點綠、其他灰），點擊顯示 popup
- **路線 Marker**：編號圓圈，可拖曳重定位，自動更新 polyline
- **花圈 Circle**：40m 半徑半透明圓，視覺化覆蓋範圍
- **巡邏 Marker**：橘色脈衝動畫，即時顯示模擬移動位置

### 側邊欄（四個 Tab）

| Tab | 功能 |
|-----|------|
| 定位 | Tunnel 狀態/控制、Google URL 解析、座標輸入、設定/清除位置 |
| 收藏 | 分類篩選 toggle、收藏清單（含分類下拉）、新增/刪除/自動分類 |
| 路線 | 載入/儲存 JSON、文字編輯 modal、拖曳排序清單、路線規劃（種花/外圈/種果） |
| 巡邏 | 速度設定、模式選擇（循環/來回/單次）、開始/暫停/停止、狀態顯示 |

## 資料格式

### favorites.json

```json
{
  "地點名稱": { "lat": "25.033", "lng": "121.565", "category": "純點" }
}
```

### 座標清單 JSON

```json
[
  { "name": "地點A", "lat": "25.0", "lng": "121.5", "dwell": 60 }
]
```

### 座標文字格式（清單編輯器）

```
25.033,121.565
25.040 121.570
台北車站 25.047924 121.517081
# 這是註解
```

## 進入點

| 方式 | 指令 |
|------|------|
| GUI 主程式 | `python3 main.py` |
| CLI 捷徑 | `./loc.sh set <lat> <lng>` / `go <alias>` / `clear` / `tunnel` |
| 路線規劃器 | `python3 route_planner.py` |
| macOS App | 雙擊 `iOS虛擬定位.app`（install.sh 或 build.sh 產生） |

## 依賴

- **pywebview** >=5.0：桌面視窗框架（WebKit 後端）
- **pymobiledevice3**：iOS 裝置通訊 CLI
- **Leaflet.js** 1.9.4：地圖渲染（CDN 載入）
- macOS 系統工具：`osascript`、`pgrep`、`pkill`、`sudo`

## 執行緒模型

- **主執行緒**：pywebview 事件迴圈
- **API 呼叫**：pywebview 在獨立執行緒處理 JS→Python 呼叫
- **定位 subprocess**：daemon thread 執行 pymobiledevice3
- **keep-alive**：`threading.Timer` 每 10 秒重複
- **Tunnel 輪詢**：daemon thread 每 2 秒檢查
- **巡邏**：`PatrolController._run_loop` 在 daemon thread，透過 `evaluate_js` 推送事件
- **Nominatim 反查**：daemon thread，結果透過 `evaluate_js` 推送
