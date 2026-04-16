const mapModule = {
    map: null,
    favoriteMarkers: {},
    routeMarkers: [],
    routePolyline: null,
    flowerCircles: [],
    locationMarker: null,
    patrolMarker: null,
    orbitPolyline: null,

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
            document.getElementById('input-lat').value = lat.toFixed(6);
            document.getElementById('input-lng').value = lng.toFixed(6);
        });

        this.map.on('contextmenu', (e) => {
            e.originalEvent.preventDefault();
            this.showContextMenu(e);
        });

        document.addEventListener('click', () => this.hideContextMenu());
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
            const marker = L.marker([fav.lat, fav.lng], {
                icon: this.createFavoriteIcon(cat),
            }).addTo(this.map);

            const popupHtml = `
                <div style="font-size:13px;min-width:140px">
                    <strong>${this.escapeHtml(name)}</strong><br>
                    <span style="font-size:11px;color:#888">${cat} · ${fav.lat.toFixed(5)}, ${fav.lng.toFixed(5)}</span><br>
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
            const marker = L.marker([item.lat, item.lng], {
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
            latlngs.push([item.lat, item.lng]);
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
            const circle = L.circle([item.lat, item.lng], {
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
        this.map.flyTo([lat, lng], zoom || this.map.getZoom(), { duration: 0.8 });
    },

    fitBounds(items) {
        if (!items || items.length === 0) return;
        const bounds = L.latLngBounds(items.map((it) => [it.lat, it.lng]));
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
