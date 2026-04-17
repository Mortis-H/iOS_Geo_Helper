const app = {
    state: {
        favorites: {},
        route: [],
        patrolRunning: false,
        patrolPaused: false,
        currentLat: null,
        currentLng: null,
        contextLatLng: null,
        activeTab: 'location',
        drawingMode: null,
        drawCircleRadius: null,
    },

    async init() {
        sidebar.init();
        mapModule.init('map');
        await this.loadFavorites();
        this.setStatus('就緒', false);
    },

    onEvent(event, data) {
        switch (event) {
            case 'tunnel:status':
                sidebar.updateTunnelStatus(data.running);
                break;
            case 'location:set': {
                const lat = parseFloat(data.lat);
                const lng = parseFloat(data.lng);
                this.state.currentLat = lat;
                this.state.currentLng = lng;
                mapModule.setLocationMarker(lat, lng);
                document.getElementById('input-lat').value = lat.toFixed(6);
                document.getElementById('input-lng').value = lng.toFixed(6);
                break;
            }
            case 'location:clear':
                this.state.currentLat = null;
                this.state.currentLng = null;
                mapModule.clearLocationMarker();
                break;
            case 'location:name': {
                const el = document.getElementById('location-name');
                if (data.warning) {
                    el.textContent = '⚠️ ' + data.warning;
                    el.style.color = 'var(--warning)';
                } else {
                    el.textContent = data.name || '';
                    el.style.color = 'var(--text-muted)';
                }
                break;
            }
            case 'patrol:tick': {
                const total = this.state.route.length;
                const label = `#${data.idx + 1}/${total}  ${data.name}  停留 ${data.remaining}s`;
                sidebar.updatePatrolStatus(label);
                sidebar.highlightRouteItem(data.idx);
                mapModule.highlightWaypoint(data.idx);
                const tickItem = this.state.route[data.idx];
                if (tickItem) {
                    const tLat = parseFloat(tickItem.lat);
                    const tLng = parseFloat(tickItem.lng);
                    mapModule.setPatrolMarker(tLat, tLng);
                    mapModule.setLocationMarker(tLat, tLng);
                }
                break;
            }
            case 'patrol:travel': {
                const tLat = parseFloat(data.lat);
                const tLng = parseFloat(data.lng);
                const dist = data.remaining_m >= 1000
                    ? `${(data.remaining_m / 1000).toFixed(1)}km`
                    : `${Math.round(data.remaining_m)}m`;
                sidebar.updatePatrolStatus(`🚶 #${data.idx_to + 1} → ${data.name_to}  ${dist}`);
                mapModule.setPatrolMarker(tLat, tLng);
                mapModule.setLocationMarker(tLat, tLng);
                sidebar.highlightRouteItem(data.idx_to);
                mapModule.highlightWaypoint(data.idx_to);
                break;
            }
            case 'patrol:finish':
                this.state.patrolRunning = false;
                this.state.patrolPaused = false;
                sidebar.setPatrolButtons('idle');
                sidebar.updatePatrolStatus('✅ 巡邏完成');
                mapModule.clearPatrolMarker();
                break;
        }
    },

    async setLocation() {
        const lat = parseFloat(document.getElementById('input-lat').value);
        const lng = parseFloat(document.getElementById('input-lng').value);
        if (isNaN(lat) || isNaN(lng)) {
            this.setStatus('請輸入有效的座標', true);
            return;
        }
        await this.setLocationAt(lat, lng);
    },

    async setLocationAt(lat, lng) {
        try {
            const result = await window.pywebview.api.set_location(lat, lng);
            if (result && result.error) {
                this.setStatus(result.error, true);
                return;
            }
            this.state.currentLat = lat;
            this.state.currentLng = lng;
            mapModule.setLocationMarker(lat, lng);
            document.getElementById('input-lat').value = lat.toFixed(6);
            document.getElementById('input-lng').value = lng.toFixed(6);
            this.setStatus(`位置已設定: ${lat.toFixed(6)}, ${lng.toFixed(6)}`, false);
        } catch (e) {
            this.setStatus('設定位置失敗: ' + e.message, true);
        }
    },

    async clearLocation() {
        try {
            await window.pywebview.api.clear_location();
            this.state.currentLat = null;
            this.state.currentLng = null;
            mapModule.clearLocationMarker();
            document.getElementById('location-name').textContent = '';
            this.setStatus('位置已清除', false);
        } catch (e) {
            this.setStatus('清除失敗: ' + e.message, true);
        }
    },

    async parseUrl() {
        const url = document.getElementById('input-url').value.trim();
        if (!url) {
            this.setStatus('請輸入 Google Maps 連結', true);
            return;
        }
        try {
            const result = await window.pywebview.api.parse_google_url(url);
            if (result && result.error) {
                this.setStatus(result.error, true);
                return;
            }
            const lat = parseFloat(result.lat);
            const lng = parseFloat(result.lng);
            document.getElementById('input-lat').value = lat.toFixed(6);
            document.getElementById('input-lng').value = lng.toFixed(6);
            mapModule.flyTo(lat, lng);
            this.setStatus(`解析成功（${result.label}）: ${lat.toFixed(6)}, ${lng.toFixed(6)}`, false);
        } catch (e) {
            this.setStatus('解析連結失敗: ' + e.message, true);
        }
    },

    async parseCoords() {
        const text = document.getElementById('input-coords').value.trim();
        if (!text) {
            this.setStatus('請輸入座標字串', true);
            return;
        }
        try {
            const result = await window.pywebview.api.parse_coords(text);
            if (result && result.error) {
                this.setStatus(result.error, true);
                return;
            }
            const lat = parseFloat(result.lat);
            const lng = parseFloat(result.lng);
            document.getElementById('input-lat').value = lat.toFixed(6);
            document.getElementById('input-lng').value = lng.toFixed(6);
            mapModule.flyTo(lat, lng);
            this.setStatus(`解析成功: ${lat.toFixed(6)}, ${lng.toFixed(6)}`, false);
        } catch (e) {
            this.setStatus('解析座標失敗: ' + e.message, true);
        }
    },

    async startTunnel() {
        try {
            this.setStatus('正在啟動 Tunnel...', false);
            const result = await window.pywebview.api.start_tunnel();
            if (result && result.error) {
                this.setStatus(result.error, true);
                return;
            }
            sidebar.updateTunnelStatus(true);
            this.setStatus('Tunnel 已啟動', false);
        } catch (e) {
            this.setStatus('Tunnel 啟動失敗: ' + e.message, true);
        }
    },

    async stopTunnel() {
        try {
            await window.pywebview.api.stop_tunnel();
            sidebar.updateTunnelStatus(false);
            this.setStatus('Tunnel 已停止', false);
        } catch (e) {
            this.setStatus('Tunnel 停止失敗: ' + e.message, true);
        }
    },

    async loadFavorites() {
        try {
            const favs = await window.pywebview.api.get_favorites();
            this.state.favorites = favs || {};
            sidebar.updateFavoritesList(this.state.favorites);
            mapModule.setFavoriteMarkers(this.state.favorites);
        } catch (e) {
            this.state.favorites = {};
        }
    },

    async goToFavorite(name) {
        const fav = this.state.favorites[name];
        if (!fav) return;
        const lat = parseFloat(fav.lat);
        const lng = parseFloat(fav.lng);
        mapModule.flyTo(lat, lng, 17);
        await this.setLocationAt(lat, lng);
    },

    async deleteFavorite(name) {
        if (!confirm(`確定要刪除「${name}」嗎？`)) return;
        try {
            await window.pywebview.api.delete_favorite(name);
            await this.loadFavorites();
            this.setStatus(`已刪除「${name}」`, false);
        } catch (e) {
            this.setStatus('刪除失敗: ' + e.message, true);
        }
    },

    async addToFavorites(name, lat, lng, category) {
        try {
            await window.pywebview.api.add_favorite(name, lat, lng, category || '其他');
            await this.loadFavorites();
            this.setStatus(`已加入收藏「${name}」`, false);
        } catch (e) {
            this.setStatus('加入收藏失敗: ' + e.message, true);
        }
    },

    async addCurrentToFavorites() {
        const lat = parseFloat(document.getElementById('input-lat').value);
        const lng = parseFloat(document.getElementById('input-lng').value);
        if (isNaN(lat) || isNaN(lng)) {
            this.setStatus('無有效座標可加入收藏', true);
            return;
        }
        const name = prompt('請輸入收藏名稱：');
        if (!name || !name.trim()) return;
        await this.addToFavorites(name.trim(), lat, lng, '其他');
    },

    async autoCategorize() {
        try {
            this.setStatus('正在自動分類...', false);
            const result = await window.pywebview.api.auto_categorize_favorites();
            const moved = (result && result.moved) || 0;
            await this.loadFavorites();
            this.setStatus(`自動分類完成，移動了 ${moved} 筆`, false);
        } catch (e) {
            this.setStatus('自動分類失敗: ' + e.message, true);
        }
    },

    async changeFavoriteCategory(name, newCat) {
        if (!this.state.favorites[name]) return;
        this.state.favorites[name].category = newCat;
        try {
            await window.pywebview.api.update_favorites(this.state.favorites);
            await this.loadFavorites();
        } catch (e) {
            this.setStatus('更新分類失敗: ' + e.message, true);
        }
    },

    async loadRouteFile() {
        try {
            const dlg = await window.pywebview.api.open_file_dialog();
            const path = dlg && dlg.filepath;
            if (!path) return;
            const result = await window.pywebview.api.load_coord_list(path);
            if (result && result.error) {
                this.setStatus(result.error, true);
                return;
            }
            this.state.route = (result && result.items) || [];
            this.updateRoute();
            if (this.state.route.length > 0) {
                mapModule.fitBounds(this.state.route);
            }
            this.setStatus(`已載入 ${this.state.route.length} 個路點`, false);
        } catch (e) {
            this.setStatus('載入失敗: ' + e.message, true);
        }
    },

    async saveRouteFile() {
        if (this.state.route.length === 0) {
            this.setStatus('沒有路點可儲存', true);
            return;
        }
        try {
            const dlg = await window.pywebview.api.save_file_dialog();
            const path = dlg && dlg.filepath;
            if (!path) return;
            const result = await window.pywebview.api.save_coord_list(path, this.state.route);
            if (result && result.error) {
                this.setStatus(result.error, true);
                return;
            }
            this.setStatus('路線已儲存', false);
        } catch (e) {
            this.setStatus('儲存失敗: ' + e.message, true);
        }
    },

    editRouteText() {
        const lines = this.state.route.map((item) => {
            if (item.name) {
                return `${item.name} ${item.lat},${item.lng}`;
            }
            return `${item.lat},${item.lng}`;
        });
        document.getElementById('modal-textarea').value = lines.join('\n');
        document.getElementById('modal-default-dwell').value =
            document.getElementById('input-default-dwell').value || '60';
        document.getElementById('modal-overlay').style.display = 'flex';
    },

    async applyTextEdit() {
        const text = document.getElementById('modal-textarea').value;
        const defaultDwell = parseInt(document.getElementById('modal-default-dwell').value) || 3;
        try {
            const result = await window.pywebview.api.parse_coord_text(text, defaultDwell);
            if (result && result.error) {
                this.setStatus(result.error, true);
                return;
            }
            this.state.route = (result && result.items) || [];
            this.updateRoute();
            this.closeModal();
            if (this.state.route.length > 0) {
                mapModule.fitBounds(this.state.route);
            }
            this.setStatus(`已套用 ${this.state.route.length} 個路點`, false);
        } catch (e) {
            this.setStatus('解析文字失敗: ' + e.message, true);
        }
    },

    async pasteToTextarea() {
        try {
            const text = await navigator.clipboard.readText();
            const ta = document.getElementById('modal-textarea');
            const start = ta.selectionStart;
            const end = ta.selectionEnd;
            ta.value = ta.value.substring(0, start) + text + ta.value.substring(end);
            ta.selectionStart = ta.selectionEnd = start + text.length;
            ta.focus();
        } catch {
            this.setStatus('無法讀取剪貼簿（請用 Cmd+V）', true);
        }
    },

    closeModal() {
        document.getElementById('modal-overlay').style.display = 'none';
    },

    clearRoute() {
        this.state.route = [];
        mapModule.clearRoute();
        sidebar.updateRouteList([]);
        this.setStatus('路線已清除', false);
    },

    addRoutePoint(lat, lng, name) {
        const dwell = parseInt(document.getElementById('input-default-dwell').value) || 3;
        this.state.route.push({
            name: name || '',
            lat: lat,
            lng: lng,
            dwell: dwell,
        });
        this.updateRoute();
        this.setStatus(`已加入路點 #${this.state.route.length}`, false);
    },

    removeRoutePoint(idx) {
        this.state.route.splice(idx, 1);
        this.updateRoute();
    },

    async goToRoutePoint(idx) {
        const item = this.state.route[idx];
        if (!item) return;
        mapModule.flyTo(item.lat, item.lng, 17);
        await this.setLocationAt(item.lat, item.lng);
    },

    reorderRoute(fromIdx, toIdx) {
        const [moved] = this.state.route.splice(fromIdx, 1);
        this.state.route.splice(toIdx, 0, moved);
        this.updateRoute();
    },

    updateRoute() {
        mapModule.setRouteWaypoints(this.state.route);
        sidebar.updateRouteList(this.state.route);
    },

    async planRoute() {
        if (this.state.route.length < 2) {
            this.setStatus('至少需要 2 個路點才能規劃', true);
            return;
        }
        const speed = parseFloat(document.getElementById('input-plan-speed').value) || 20;
        try {
            this.setStatus('正在規劃路線...', false);
            const result = await window.pywebview.api.plan_route(this.state.route, speed);
            if (result && result.error) {
                this.setStatus(result.error, true);
                return;
            }
            this.state.route = (result && result.items) || this.state.route;
            this.updateRoute();
            const covered = result.covered ? result.covered.length : '?';
            const dist = result.total_dist ? Math.round(result.total_dist) : '?';
            let msg = `路線規劃完成：覆蓋 ${covered}/${this.state.route.length} 花點，距離 ${dist}m`;
            if (result.warnings && result.warnings.length > 0) {
                msg += '\n' + result.warnings.join('\n');
            }
            this.setStatus(msg, false);
        } catch (e) {
            this.setStatus('規劃失敗: ' + e.message, true);
        }
    },

    async orbitRoute() {
        if (this.state.route.length < 2) {
            this.setStatus('至少需要 2 個路點', true);
            return;
        }
        const speed = parseFloat(document.getElementById('input-plan-speed').value) || 20;
        try {
            this.setStatus('正在產生繞圈路線...', false);
            const result = await window.pywebview.api.orbit_route(this.state.route);
            if (result && result.error) {
                let msg = result.error;
                if (result.warnings && result.warnings.length > 0) msg += '\n' + result.warnings.join('\n');
                this.setStatus(msg, true);
                return;
            }
            this.state.route = (result && result.items) || this.state.route;
            this.updateRoute();
            const dist = result.total_dist ? Math.round(result.total_dist) : '?';
            const radius = result.radius_used ? result.radius_used.toFixed(1) : '?';
            this.setStatus(`繞圈路線完成：${this.state.route.length} 個路點，安全半徑 ${radius}m，距離 ${dist}m`, false);
        } catch (e) {
            this.setStatus('產生繞圈失敗: ' + e.message, true);
        }
    },

    async fruitRoute() {
        if (this.state.route.length < 1) {
            this.setStatus('至少需要 1 個路點', true);
            return;
        }
        const speed = parseFloat(document.getElementById('input-plan-speed').value) || 20;
        try {
            this.setStatus('正在產生採果路線...', false);
            const result = await window.pywebview.api.fruit_route(this.state.route);
            if (result && result.error) {
                this.setStatus(result.error, true);
                return;
            }
            this.state.route = (result && result.items) || this.state.route;
            this.updateRoute();
            const dist = result.total_dist ? Math.round(result.total_dist) : '?';
            this.setStatus(`採果路線完成：${this.state.route.length} 個路點，距離 ${dist}m`, false);
        } catch (e) {
            this.setStatus('產生採果路線失敗: ' + e.message, true);
        }
    },

    async startPatrol() {
        if (this.state.route.length < 2) {
            this.setStatus('至少需要 2 個路點才能巡邏', true);
            return;
        }
        const speed = parseFloat(document.getElementById('input-patrol-speed').value) || 20;
        const mode = document.querySelector('input[name="patrol-mode"]:checked').value;
        try {
            this.state.patrolRunning = true;
            this.state.patrolPaused = false;
            sidebar.setPatrolButtons('running');
            sidebar.updatePatrolStatus('巡邏啟動中...');
            const result = await window.pywebview.api.start_patrol(this.state.route, 0, speed, mode);
            if (result && result.error) {
                this.setStatus(result.error, true);
                this.state.patrolRunning = false;
                sidebar.setPatrolButtons('idle');
                return;
            }
        } catch (e) {
            this.setStatus('啟動巡邏失敗: ' + e.message, true);
            this.state.patrolRunning = false;
            sidebar.setPatrolButtons('idle');
        }
    },

    async togglePausePatrol() {
        try {
            if (this.state.patrolPaused) {
                await window.pywebview.api.resume_patrol();
                this.state.patrolPaused = false;
                sidebar.setPatrolButtons('running');
                sidebar.updatePatrolStatus('巡邏繼續中...');
            } else {
                await window.pywebview.api.pause_patrol();
                this.state.patrolPaused = true;
                sidebar.setPatrolButtons('paused');
                sidebar.updatePatrolStatus('巡邏已暫停');
            }
        } catch (e) {
            this.setStatus('操作失敗: ' + e.message, true);
        }
    },

    async stopPatrol() {
        try {
            await window.pywebview.api.stop_patrol();
            this.state.patrolRunning = false;
            this.state.patrolPaused = false;
            sidebar.setPatrolButtons('idle');
            sidebar.updatePatrolStatus('巡邏已停止');
            mapModule.clearPatrolMarker();
        } catch (e) {
            this.setStatus('停止巡邏失敗: ' + e.message, true);
        }
    },

    contextSetLocation() {
        const ll = this.state.contextLatLng;
        if (!ll) return;
        mapModule.hideContextMenu();
        this.setLocationAt(ll.lat, ll.lng);
    },

    contextAddToRoute() {
        const ll = this.state.contextLatLng;
        if (!ll) return;
        mapModule.hideContextMenu();
        this.addRoutePoint(ll.lat, ll.lng);
    },

    contextAddToFavorites() {
        const ll = this.state.contextLatLng;
        if (!ll) return;
        mapModule.hideContextMenu();
        const name = prompt('請輸入收藏名稱：');
        if (!name || !name.trim()) return;
        this.addToFavorites(name.trim(), ll.lat, ll.lng, '其他');
    },

    onTabChange(tab) {
        this.state.activeTab = tab;
        if (tab !== 'route' && this.state.drawingMode) {
            this.state.drawingMode = null;
            mapModule.setDrawingCursor(false);
        }
    },

    startDrawPolygon() {
        mapModule.clearDraw();
        this.state.drawingMode = 'polygon';
        mapModule.setDrawingCursor(true);
        document.getElementById('draw-status').textContent = '在地圖上點擊標記多邊形頂點（雙擊完成）';
    },

    startDrawCircle() {
        mapModule.clearDraw();
        this.state.drawingMode = 'circle';
        this.state.drawCircleRadius = null;
        mapModule.setDrawingCursor(true);
        document.getElementById('draw-status').textContent = '在地圖上點擊設定圓心';
    },

    finishDraw() {
        if (this.state.drawingMode === 'polygon') {
            this.state.drawingMode = null;
            mapModule.setDrawingCursor(false);
            const verts = mapModule.getDrawnPolygon();
            if (verts.length < 3) {
                this.setStatus('多邊形需至少 3 個頂點', true);
                return;
            }
            document.getElementById('draw-status').textContent =
                `多邊形 ${verts.length} 個頂點，點「生成掃描路徑」`;
        }
    },

    clearDraw() {
        this.state.drawingMode = null;
        this.state.drawCircleRadius = null;
        mapModule.clearDraw();
    },

    async generateSweepPath() {
        const spacing = parseFloat(document.getElementById('input-sweep-spacing').value) || 40;
        const angle = parseFloat(document.getElementById('input-sweep-angle').value) || 0;

        const polygon = mapModule.getDrawnPolygon();
        const circle = mapModule.getDrawnCircle();

        if (polygon.length >= 3) {
            try {
                this.setStatus('正在生成多邊形掃描路徑...', false);
                const result = await window.pywebview.api.sweep_polygon(polygon, spacing, angle);
                if (result.warnings && result.warnings.length > 0) {
                    this.setStatus(result.warnings.join('\n'), true);
                    if (!result.items || result.items.length === 0) return;
                }
                this.state.route = result.items || [];
                this.updateRoute();
                if (this.state.route.length > 0) mapModule.fitBounds(this.state.route);
                const dist = result.total_dist ? Math.round(result.total_dist) : 0;
                this.setStatus(`掃描路徑完成：${this.state.route.length} 個路點，距離 ${dist}m`, false);
            } catch (e) {
                this.setStatus('生成掃描路徑失敗: ' + e.message, true);
            }
        } else if (circle && circle.radius > 0) {
            try {
                this.setStatus('正在生成圓形掃描路徑...', false);
                const result = await window.pywebview.api.sweep_circle(
                    circle.lat, circle.lng, circle.radius, spacing
                );
                if (result.warnings && result.warnings.length > 0) {
                    this.setStatus(result.warnings.join('\n'), true);
                    if (!result.items || result.items.length === 0) return;
                }
                this.state.route = result.items || [];
                this.updateRoute();
                if (this.state.route.length > 0) mapModule.fitBounds(this.state.route);
                const dist = result.total_dist ? Math.round(result.total_dist) : 0;
                this.setStatus(`螺旋路徑完成：${this.state.route.length} 個路點，距離 ${dist}m`, false);
            } catch (e) {
                this.setStatus('生成螺旋路徑失敗: ' + e.message, true);
            }
        } else {
            this.setStatus('請先畫出區域（多邊形或圓形）', true);
        }
    },

    setStatus(text, isError) {
        const el = document.getElementById('status-area');
        el.textContent = text;
        el.className = 'status-msg' + (isError ? ' error' : text ? ' success' : '');
    },
};

window.addEventListener('pywebviewready', () => app.init());
