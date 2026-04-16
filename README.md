# iOS Geo Helper

macOS 上透過 `pymobiledevice3` 模擬 iPhone GPS 定位的桌面工具（Tkinter GUI）。

## 系統需求

- macOS（Apple Silicon / Intel）
- iPhone 透過 USB 連接
- iOS 17+ 需開啟開發者模式，並啟動 Tunnel（`sudo pymobiledevice3 remote tunneld`）
- Python 3 + Tkinter + pymobiledevice3（由 `install.sh` 自動安裝）

## 專案結構

```
iOS_Geo_Helper/
├── app.py              # GUI 主視窗，組裝所有模組，Tkinter mainloop
├── config.py           # 路徑常數：SCRIPT_DIR、FAVORITES_FILE、HISTORY_DIR、PYMOBILEDEVICE3
├── version.py          # __version__ = "3.0"
├── location.py         # 定位核心：set/clear、keep-alive、座標解析、Nominatim 反查
├── tunnel.py           # tunneld 生命週期：start/stop/check（macOS osascript + pgrep）
├── storage.py          # 持久化：favorites.json 讀寫、每日 history/YYYYMMDD.json、JSON 清單解析
├── patrol.py           # PatrolController：背景執行緒巡邏、暫停/繼續/停止、線性插值移動
├── route_planner.py    # 路線演算法：plan_route（種花）、orbit_route（外圈）、fruit_route（種果）
├── list_editor.py      # ListEditorWindow：多行座標輸入、解析、路線規劃 UI、套用到主視窗
├── favorites_manager.py # FavoritesManagerWindow：收藏分類管理（純點/花點/菇點/其他）、排序
├── loc.sh              # zsh CLI 捷徑：loc set/go/clear/list/tunnel（不依賴 Python GUI）
├── install.sh          # 安裝腳本：Homebrew、Python、Tkinter、pipx、pymobiledevice3、產生 .app
├── build.sh            # PyInstaller 打包成 iOS虛擬定位.app
├── favorites.json      # 預設收藏地點（name → {lat, lng}）
└── .gitignore
```

## 架構與資料流

```
┌──────────────────────────────────────────────────────────────┐
│  app.py (Tkinter GUI)                                        │
│  ┌──────────┐  ┌──────────────┐  ┌─────────────────────────┐│
│  │ 座標輸入  │  │ 收藏選單      │  │ 座標清單面板            ││
│  │ URL/字串  │  │ 匯入/刪除/分類│  │ 載入/編輯/巡邏控制      ││
│  └─────┬────┘  └──┬─────┬─────┘  └───────┬─────────────────┘│
└────────┼──────────┼─────┼────────────────┼───────────────────┘
         │          │     │                │
         ▼          ▼     ▼                ▼
   location.py  storage  favorites_    ┌──────────────┐
   ├ set_location   .py  manager.py    │ patrol.py    │
   ├ clear_location      ├ auto_       │ PatrolController
   ├ parse_google_url      categorize  │  └ _travel_between()
   ├ parse_coords        └ Favorites   └──────┬───────┘
   ├ keep-alive (10s)      ManagerWindow      │
   └ Nominatim 反查                     list_editor.py
         │                              ├ _parse_lines()
         ▼                              ├ _plan_route() ──→ route_planner.plan_route()
   pymobiledevice3 CLI                  ├ _orbit_route() ─→ route_planner.orbit_route()
   (subprocess)                         └ _fruit_route() ─→ route_planner.fruit_route()

   tunnel.py
   ├ start_tunnel()   → osascript 開 Terminal 執行 sudo tunneld
   ├ stop_tunnel()    → osascript pkill
   └ check_tunnel_status() → pgrep 每 2 秒輪詢
```

## 模組詳細說明

### `app.py` — 主程式

- 直接在模組層級建構 Tkinter widgets（無 `if __name__ == "__main__"` guard）
- 透過 `tunnel.setup()` / `location.setup()` 注入 UI widgets 給各模組
- 管理 `coord_list_items: list`（主視窗與 `ListEditorWindow` 共用同一物件）
- 關閉時詢問是否停止 Tunnel

### `location.py` — 定位核心

**關鍵函式：**

| 函式 | 簽名 | 說明 |
|------|------|------|
| `set_location_direct` | `(lat: str, lng: str, save_history=True, _fetch_name=True)` | 子程序執行 `pymobiledevice3 developer dvt simulate-location set -- <lat> <lng>`，啟動 keep-alive，可選寫歷史與反查地名 |
| `clear_location` | `()` | 執行 `simulate-location clear`，停止 keep-alive |
| `parse_google_url` | `(url: str) → (lat, lng, label) \| None` | 正則解析 `!3d...!4d...` 或 `@lat,lng` |
| `parse_coords` | `(text: str) → (lat, lng) \| None` | 解析 `lat,lng` 或 `lat lng` |
| `stop_keepalive` | `()` | 停止 keep-alive 定時器 |

**行為細節：**
- keep-alive 每 `_KEEPALIVE_MS`（10,000ms）重送同一座標，防止 iOS 跳回真實位置
- `set_location_direct` 在 daemon thread 內執行 subprocess，UI 更新一律 `root.after(0, ...)`
- 巡邏呼叫時傳 `save_history=False, _fetch_name=False`，避免大量寫入與 API 呼叫
- Nominatim 反查使用 `zh-TW` 語言，User-Agent 為 `iOS-LocationScript/1.0`

### `tunnel.py` — Tunnel 管理

- `start_tunnel()`：osascript 在 Terminal.app 開新視窗執行 `sudo pymobiledevice3 remote tunneld`
- `stop_tunnel()`：osascript 以管理員權限 `pkill -9` 停止
- `check_tunnel_status()`：`pgrep -f "pymobiledevice3 remote tunneld"` 每 2 秒輪詢，更新 UI 燈號
- 全為 macOS 專用（osascript、pgrep、pkill）

### `storage.py` — 持久化

| 函式 | 說明 |
|------|------|
| `load_favorites()` → dict | 讀取 `favorites.json`，回傳 `{name: {lat, lng}}` |
| `save_favorites(favorites)` | 寫入 `favorites.json` |
| `save_to_history(lat, lng)` | 附加到 `history/YYYYMMDD.json`（陣列格式，含時間戳） |
| `parse_coord_list_file(filepath)` → list | 解析 JSON 檔案為 `[{name, lat, lng, dwell}]` |

### `patrol.py` — 巡邏控制器

**`PatrolController` 類別：**

```
PatrolController(location_fn)
├── start(items, start_idx=0, speed_kmh=0.0, mode='loop')
├── pause()
├── resume()
├── stop()
├── is_running: bool
├── on_tick(idx, name, remaining_secs)    # 回呼：停留倒數
├── on_travel(idx_to, name_to, remaining_m) # 回呼：移動中
└── on_finish()                            # 回呼：巡邏結束
```

**巡邏模式：**
- `loop`：A→B→C→A→B→C… 無限循環
- `pingpong`：A→B→C→B→A→B→C… 來回，端點停留一次
- `once`：A→B→C 走完即停止

**移動邏輯：**
- `speed_kmh = 0`：瞬間跳點
- `speed_kmh > 0`：`_travel_between()` 以 Haversine 計算距離，每 5 秒線性插值更新一次位置
- 距離 < 5m 時直接跳到終點
- `location_fn` 由外部注入（即 `location.set_location_direct`），傳 `save_history=False, _fetch_name=False`

### `route_planner.py` — 路線規劃演算法

**常數：**

| 常數 | 值 | 用途 |
|------|----|------|
| `FLOWER_RADIUS_M` | 40.0 | 花點有效半徑（公尺） |
| `WALK_SPEED_MPS` | 1.4 | 預設步行速度（m/s ≈ 5 km/h） |
| `TIME_LIMIT_SEC` | 300 | 5 分鐘時間上限 |
| `MAX_WALK_DIST_M` | 420.0 | 步行可達最大距離 |

**三種路線：**

| 函式 | 模式 | 路徑類型 | 演算法 |
|------|------|---------|--------|
| `plan_route(flowers, speed_kmh)` | 種花 | 封閉循環（回起點） | 每起點：greedy nearest-neighbor → 2-opt 改良，取 `score = covered*1000 - dist` 最高 |
| `orbit_route(flowers, radius_m, arc_steps)` | 外圈 | 封閉循環（凸包外圍） | 凸包 → 各頂點圓弧 → 安全半徑 `√(R² - (max_edge/2)²)` |
| `fruit_route(flowers)` | 種果 | 開放單向（不回起點） | 每起點：greedy → 2-opt open，取總距離最短 |

**工具函式：** `haversine`、`to_meters`/`from_meters`（經緯度↔平面公尺）、`_convex_hull_ccw`（Andrew's monotone chain）、`segments_intersect`、`route_has_crossing`、`flowers_covered`

### `list_editor.py` — 清單編輯器視窗

**`ListEditorWindow` 類別：**

建構參數：
- `parent`：Tk root
- `location_fn`：`set_location_direct` 的參照
- `coord_list_items`：與主視窗共用的同一 list 物件
- `on_apply()`：套用後更新主視窗 Listbox
- `on_status(text)`：更新主視窗狀態列

**座標解析格式（`_parse_lines`）：**
```
25.033,121.565            → name 自動為 "25.033, 121.565"
25.040 121.570            → name 自動為 "25.040, 121.570"
台北車站 25.047924 121.517081  → name = "台北車站"
# 這是註解                 → 忽略
```

### `favorites_manager.py` — 收藏分類管理

**分類常數：** `CATEGORIES = ["純點", "花點", "菇點", "其他"]`

**`auto_categorize(name: str) → str`**
依名稱關鍵字自動推測分類，優先序：含「菇」→ 菇點、含「純點」→ 純點、含「花」→ 花點、其餘 → 其他。

**`FavoritesManagerWindow` 類別：**

建構參數：
- `parent`：Tk root
- `favorites: dict`：與 `app.py` 共用的同一 dict 物件（直接修改）
- `on_save()`：儲存後回呼（觸發 `update_favorites_menu()`）

GUI 佈局（4 欄並列）：
```
[🔄 自動分類（未分類項目）]              [💾 儲存] [💾 儲存並關閉]
┌──────────┬──────────┬──────────┬──────────┐
│  純點     │  花點     │  菇點     │  其他     │
│ Listbox  │ Listbox  │ Listbox  │ Listbox  │
│ [▲] [▼]  │ [▲] [▼]  │ [▲] [▼]  │ [▲] [▼]  │
└──────────┴──────────┴──────────┴──────────┘
移動選取項目到：[分類 ▼] [→ 移動]
```

功能：
- 四欄各有 Listbox（EXTENDED 多選）、▲▼ 排序按鈕
- 跨欄搬移：選取項目 → 選擇目標分類 → 點「移動」
- 自動分類：僅處理「其他」欄中的項目，依名稱關鍵字搬到對應分類
- 選取互斥：點擊任一欄時自動清除其他欄的選取
- 未儲存警告：關閉視窗時若有未存變更會詢問是否儲存
- 儲存時將 `category` 欄位寫入每個 favorite，並依分類順序重建 dict

### `config.py` — 路徑與環境偵測

- `_FROZEN`：偵測 PyInstaller 凍結環境
- 凍結版：`SCRIPT_DIR = ~/Library/Application Support/iOS虛擬定位/`
- 腳本版：`SCRIPT_DIR = 專案目錄`
- `PYMOBILEDEVICE3`：依序搜尋 `~/.local/bin`、`/opt/homebrew/bin`、`/usr/local/bin`、系統 PATH

## 資料格式

### favorites.json（收藏地點）

```json
{
  "地點名稱": { "lat": "25.033", "lng": "121.565", "category": "純點" }
}
```
- `category` 欄位可選，值為 `"純點"` / `"花點"` / `"菇點"` / `"其他"`
- 缺省時由 `auto_categorize()` 依名稱關鍵字推測，或歸入「其他」
- 分類管理器儲存後會自動加入 `category` 欄位

### 座標清單 JSON（兩種格式皆可載入）

物件格式（同 favorites）：
```json
{ "地點A": { "lat": "25.0", "lng": "121.5" } }
```

陣列格式（支援 dwell）：
```json
[
  { "name": "地點A", "lat": "25.0", "lng": "121.5", "dwell": 60 },
  { "lat": "25.1", "lng": "121.6" }
]
```
- `name` 缺省時自動以 `"lat, lng"` 顯示
- `dwell` 缺省時預設 60 秒

### history/YYYYMMDD.json（每日歷史）

```json
[
  { "lat": "25.033", "lng": "121.565", "time": "14:30:05" }
]
```

## 進入點

| 方式 | 指令 | 說明 |
|------|------|------|
| GUI 主程式 | `python3 app.py` | Tkinter 視窗，完整功能 |
| CLI 捷徑 | `./loc.sh set <lat> <lng>` | 直接呼叫 pymobiledevice3 |
| CLI 捷徑 | `./loc.sh go <alias>` | 前往預設地點（taipei101 等） |
| CLI 捷徑 | `./loc.sh clear` | 清除模擬位置 |
| CLI 捷徑 | `./loc.sh tunnel` | 啟動 tunneld |
| 路線規劃器 | `python3 route_planner.py` | 互動式花點輸入與路線計算 |
| macOS App | 雙擊 `iOS虛擬定位.app` | install.sh 或 build.sh 產生 |

## 依賴

**外部工具：**
- `pymobiledevice3`：核心 CLI，負責 `simulate-location set/clear` 與 `remote tunneld`
- macOS 系統工具：`osascript`、`pgrep`、`pkill`、`sudo`（Tunnel 管理用）

**Python 標準庫：** `tkinter`、`subprocess`、`json`、`os`、`sys`、`re`、`threading`、`urllib`、`datetime`、`math`、`itertools`、`typing`、`shutil`

**網路 API：** Nominatim（OpenStreetMap 反向地理編碼），僅手動設定座標時呼叫

## 執行緒模型

- **主執行緒**：Tkinter mainloop
- **定位 subprocess**：每次 `set_location_direct` 開 daemon thread 執行 `pymobiledevice3` 子程序
- **keep-alive**：`root.after()` 定時器（主執行緒），但實際 subprocess 在 daemon thread
- **巡邏**：`PatrolController._run_loop` 在獨立 daemon thread，回呼透過 `root.after(0, ...)` 返回主執行緒
- **Nominatim 反查**：daemon thread，結果透過 `root.after(0, ...)` 更新 UI
