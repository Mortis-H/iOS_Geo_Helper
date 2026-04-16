const mapModule = {
    map: null,
    favoriteMarkers: {},
    routeMarkers: [],
    routePolyline: null,
    flowerCircles: [],
    locationMarker: null,
    patrolMarker: null,
    orbitPolyline: null,

    drawVertices: [],
    drawMarkers: [],
    drawOverlay: null,
    drawPreviewLine: null,
    drawCircleCenter: null,
    drawCircleCenterMarker: null,

    CATEGORY_COLORS: {
        '純點': '#4a90d9',
        '花點': '#e74c8b',
        '菇點': '#4caf50',
        '其他': '#9e9e9e',
    },

    init(containerId) {
        this.map = L.map(containerId, {
            center: [25.033, 121.565],
            zoom: 15,
            zoomControl: true,
        });

        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
            maxZoom: 20,
            subdomains: 'abcd',
        }).addTo(this.map);

        this.map.on('click', (e) => {
            this.hideContextMenu();
            const { lat, lng } = e.latlng;

            if (app.state.drawingMode === 'polygon') {
                this._addPolygonVertex(lat, lng);
                return;
            }
            if (app.state.drawingMode === 'circle') {
                this._handleCircleClick(lat, lng);
                return;
            }
            if (app.state.activeTab === 'route') {
                app.addRoutePoint(lat, lng);
                return;
            }
            document.getElementById('input-lat').value = lat.toFixed(6);
            document.getElementById('input-lng').value = lng.toFixed(6);
        });

        this.map.on('dblclick', (e) => {
            if (app.state.drawingMode === 'polygon' && this.drawVertices.length >= 3) {
                e.originalEvent.preventDefault();
                app.finishDraw();
            }
        });

        this.map.on('mousemove', (e) => {
            if (app.state.drawingMode === 'circle' && this.drawCircleCenter) {
                this._previewCircleRadius(e.latlng);
            }
        });

        this.map.on('contextmenu', (e) => {
            e.originalEvent.preventDefault();
            this.showContextMenu(e);
        });

        document.addEventListener('click', () => this.hideContextMenu());
    },

    // ── Drawing: polygon ────────────────────────────────────

    _addPolygonVertex(lat, lng) {
        this.drawVertices.push([lat, lng]);
        const m = L.circleMarker([lat, lng], { radius: 5, color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 1 }).addTo(this.map);
        this.drawMarkers.push(m);
        this._updatePolygonPreview();
        const el = document.getElementById('draw-status');
        if (el) el.textContent = `已標記 ${this.drawVertices.length} 個頂點（雙擊完成）`;
    },

    _updatePolygonPreview() {
        if (this.drawOverlay) this.drawOverlay.remove();
        if (this.drawPreviewLine) this.drawPreviewLine.remove();
        if (this.drawVertices.length >= 2) {
            this.drawPreviewLine = L.polyline(this.drawVertices, { color: '#f59e0b', weight: 2, dashArray: '6 4' }).addTo(this.map);
        }
        if (this.drawVertices.length >= 3) {
            this.drawOverlay = L.polygon(this.drawVertices, { color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.15, weight: 2 }).addTo(this.map);
        }
    },

    getDrawnPolygon() {
        return this.drawVertices.map((v) => ({ lat: v[0], lng: v[1] }));
    },

    // ── Drawing: circle ─────────────────────────────────────

    _handleCircleClick(lat, lng) {
        if (!this.drawCircleCenter) {
            this.drawCircleCenter = [lat, lng];
            this.drawCircleCenterMarker = L.circleMarker([lat, lng], { radius: 6, color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 1 }).addTo(this.map);
            const el = document.getElementById('draw-status');
            if (el) el.textContent = '移動滑鼠調整半徑，再次點擊確認';
        } else {
            const radiusM = this.map.distance(this.drawCircleCenter, [lat, lng]);
            this._setCirclePreview(radiusM);
            app.state.drawCircleRadius = radiusM;
            app.state.drawingMode = null;
            this.map.getContainer().style.cursor = '';
            const el = document.getElementById('draw-status');
            if (el) el.textContent = `圓形區域：半徑 ${Math.round(radiusM)}m，點「生成掃描路徑」`;
        }
    },

    _previewCircleRadius(latlng) {
        if (!this.drawCircleCenter) return;
        const radiusM = this.map.distance(this.drawCircleCenter, [latlng.lat, latlng.lng]);
        this._setCirclePreview(radiusM);
    },

    _setCirclePreview(radiusM) {
        if (this.drawOverlay) this.drawOverlay.remove();
        this.drawOverlay = L.circle(this.drawCircleCenter, {
            radius: radiusM, color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.15, weight: 2,
        }).addTo(this.map);
    },

    getDrawnCircle() {
        if (!this.drawCircleCenter) return null;
        const r = app.state.drawCircleRadius || (this.drawOverlay ? this.drawOverlay.getRadius() : 0);
        return { lat: this.drawCircleCenter[0], lng: this.drawCircleCenter[1], radius: r };
    },

    clearDraw() {
        this.drawVertices = [];
        this.drawMarkers.forEach((m) => m.remove());
        this.drawMarkers = [];
        if (this.drawOverlay) { this.drawOverlay.remove(); this.drawOverlay = null; }
        if (this.drawPreviewLine) { this.drawPreviewLine.remove(); this.drawPreviewLine = null; }
        if (this.drawCircleCenterMarker) { this.drawCircleCenterMarker.remove(); this.drawCircleCenterMarker = null; }
        this.drawCircleCenter = null;
        app.state.drawCircleRadius = null;
        this.map.getContainer().style.cursor = '';
        const el = document.getElementById('draw-status');
        if (el) el.textContent = '';
    },

    setDrawingCursor(on) {
        this.map.getContainer().style.cursor = on ? 'crosshair' : '';
    },

    createFavoriteIcon(category) {
        const color = this.CATEGORY_COLORS[category] || this.CATEGORY_COLORS['其他'];
        return L.divIcon({
            className: 'marker-fav',
            html: `<div class="marker-dot" style="background:${color};box-shadow:0 0 8px ${color}"></div>`,
            iconSize: [12, 12],
            iconAnchor: [6, 6],
            popupAnchor: [0, -8],
        });
    },

    setFavoriteMarkers(favorites) {
        Object.values(this.favoriteMarkers).forEach((m) => m.remove());
        this.favoriteMarkers = {};

        for (const [name, fav] of Object.entries(favorites)) {
            const cat = fav.category || '其他';
            const lat = parseFloat(fav.lat);
            const lng = parseFloat(fav.lng);
            if (isNaN(lat) || isNaN(lng)) continue;
            const marker = L.marker([lat, lng], {
                icon: this.createFavoriteIcon(cat),
            }).addTo(this.map);

            const popupHtml = `
                <div style="font-size:13px;min-width:140px">
                    <strong>${this.escapeHtml(name)}</strong><br>
                    <span style="font-size:11px;color:#888">${cat} · ${lat.toFixed(5)}, ${lng.toFixed(5)}</span><br>
                    <div style="margin-top:6px;display:flex;gap:4px">
                        <button onclick="app.goToFavorite('${this.escapeAttr(name)}')" style="padding:3px 8px;cursor:pointer;border-radius:4px;border:none;background:#5b8def;color:#fff;font-size:11px">Go</button>
                        <button onclick="app.deleteFavorite('${this.escapeAttr(name)}')" style="padding:3px 8px;cursor:pointer;border-radius:4px;border:none;background:#e74c3c;color:#fff;font-size:11px">Delete</button>
                    </div>
                </div>`;
            marker.bindPopup(popupHtml);
            marker._favCategory = cat;
            this.favoriteMarkers[name] = marker;
        }

        this.updateFavoriteVisibility();
    },

    updateFavoriteVisibility() {
        const checks = document.querySelectorAll('.cat-filter');
        const visible = new Set();
        checks.forEach((cb) => {
            if (cb.checked) visible.add(cb.dataset.cat);
        });

        for (const [, marker] of Object.entries(this.favoriteMarkers)) {
            if (visible.has(marker._favCategory)) {
                if (!this.map.hasLayer(marker)) marker.addTo(this.map);
            } else {
                marker.remove();
            }
        }
    },

    createWaypointIcon(num) {
        return L.divIcon({
            className: 'waypoint-marker',
            html: `<div class="waypoint-num">${num}</div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12],
        });
    },

    setRouteWaypoints(items) {
        this.clearRoute();
        if (!items || items.length === 0) return;

        const latlngs = [];

        items.forEach((item, i) => {
            const lat = parseFloat(item.lat);
            const lng = parseFloat(item.lng);
            if (isNaN(lat) || isNaN(lng)) return;
            const marker = L.marker([lat, lng], {
                icon: this.createWaypointIcon(i + 1),
                draggable: true,
            }).addTo(this.map);

            marker.on('dragend', (e) => {
                const pos = e.target.getLatLng();
                app.state.route[i].lat = pos.lat;
                app.state.route[i].lng = pos.lng;
                app.updateRoute();
            });

            marker.bindTooltip(item.name || `#${i + 1}`, { direction: 'top', offset: [0, -14] });
            this.routeMarkers.push(marker);
            latlngs.push([lat, lng]);
        });

        this.routePolyline = L.polyline(latlngs, {
            color: '#5b8def',
            weight: 3,
            opacity: 0.7,
        }).addTo(this.map);

        const showCircles = document.getElementById('chk-show-circles');
        if (showCircles && showCircles.checked) {
            this.showFlowerCircles(items);
        }
    },

    clearRoute() {
        this.routeMarkers.forEach((m) => m.remove());
        this.routeMarkers = [];
        if (this.routePolyline) {
            this.routePolyline.remove();
            this.routePolyline = null;
        }
        this.hideFlowerCircles();
        if (this.orbitPolyline) {
            this.orbitPolyline.remove();
            this.orbitPolyline = null;
        }
    },

    showFlowerCircles(items, radiusM = 40) {
        this.hideFlowerCircles();
        items.forEach((item) => {
            const circle = L.circle([parseFloat(item.lat), parseFloat(item.lng)], {
                radius: radiusM,
                color: '#e74c8b',
                fillColor: '#e74c8b',
                fillOpacity: 0.1,
                weight: 1,
            }).addTo(this.map);
            this.flowerCircles.push(circle);
        });
    },

    hideFlowerCircles() {
        this.flowerCircles.forEach((c) => c.remove());
        this.flowerCircles = [];
    },

    setLocationMarker(lat, lng) {
        if (this.locationMarker) {
            this.locationMarker.setLatLng([lat, lng]);
        } else {
            this.locationMarker = L.marker([lat, lng], {
                icon: L.divIcon({
                    className: 'location-marker',
                    html: '<div class="location-dot"></div>',
                    iconSize: [20, 20],
                    iconAnchor: [10, 10],
                }),
                zIndexOffset: 1000,
            }).addTo(this.map);
        }
    },

    clearLocationMarker() {
        if (this.locationMarker) {
            this.locationMarker.remove();
            this.locationMarker = null;
        }
    },

    setPatrolMarker(lat, lng) {
        if (this.patrolMarker) {
            this.patrolMarker.setLatLng([lat, lng]);
        } else {
            this.patrolMarker = L.marker([lat, lng], {
                icon: L.divIcon({
                    className: 'patrol-marker',
                    html: '<div class="patrol-dot"></div>',
                    iconSize: [22, 22],
                    iconAnchor: [11, 11],
                }),
                zIndexOffset: 2000,
            }).addTo(this.map);
        }
    },

    clearPatrolMarker() {
        if (this.patrolMarker) {
            this.patrolMarker.remove();
            this.patrolMarker = null;
        }
        this.highlightWaypoint(-1);
    },

    highlightWaypoint(idx) {
        this.routeMarkers.forEach((m, i) => {
            const el = m.getElement();
            if (!el) return;
            if (i === idx) {
                el.classList.add('waypoint-active');
            } else {
                el.classList.remove('waypoint-active');
            }
        });
    },

    showContextMenu(e) {
        const menu = document.getElementById('context-menu');
        const point = e.containerPoint;
        const mapRect = this.map.getContainer().getBoundingClientRect();

        menu.style.left = (mapRect.left + point.x) + 'px';
        menu.style.top = (mapRect.top + point.y) + 'px';
        menu.style.display = 'block';

        app.state.contextLatLng = { lat: e.latlng.lat, lng: e.latlng.lng };
    },

    hideContextMenu() {
        document.getElementById('context-menu').style.display = 'none';
    },

    flyTo(lat, lng, zoom) {
        this.map.flyTo([parseFloat(lat), parseFloat(lng)], zoom || this.map.getZoom(), { duration: 0.8 });
    },

    fitBounds(items) {
        if (!items || items.length === 0) return;
        const bounds = L.latLngBounds(items.map((it) => [parseFloat(it.lat), parseFloat(it.lng)]));
        this.map.fitBounds(bounds, { padding: [40, 40] });
    },

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    escapeAttr(str) {
        return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    },
};
