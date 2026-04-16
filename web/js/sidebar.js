const sidebar = {
    CATEGORY_COLORS: {
        '純點': 'var(--cat-pure)',
        '花點': 'var(--cat-flower)',
        '菇點': 'var(--cat-mushroom)',
        '其他': 'var(--cat-other)',
    },

    CATEGORY_ORDER: ['純點', '花點', '菇點', '其他'],

    init() {
        const tabs = document.querySelectorAll('.sidebar-tabs .tab');
        tabs.forEach((tab) => {
            tab.addEventListener('click', () => {
                tabs.forEach((t) => t.classList.remove('active'));
                tab.classList.add('active');
                document.querySelectorAll('.tab-content').forEach((tc) => tc.classList.remove('active'));
                const target = document.getElementById('tab-' + tab.dataset.tab);
                if (target) target.classList.add('active');
                app.onTabChange(tab.dataset.tab);
            });
        });

        const toggle = document.getElementById('sidebar-toggle');
        const sidebarEl = document.getElementById('sidebar');
        const mapEl = document.getElementById('map');

        toggle.addEventListener('click', () => {
            const collapsed = sidebarEl.classList.toggle('collapsed');
            toggle.textContent = collapsed ? '▶' : '◀';
            toggle.title = collapsed ? '展開' : '收合';
            mapEl.style.right = collapsed ? '0' : 'var(--sidebar-width)';
            setTimeout(() => mapModule.map.invalidateSize(), 350);
        });

        document.querySelectorAll('.cat-filter').forEach((cb) => {
            cb.addEventListener('change', () => {
                mapModule.updateFavoriteVisibility();
                this.updateFavoritesList(app.state.favorites);
                const boxes = document.querySelectorAll('.cat-filter');
                const allChecked = [...boxes].every((c) => c.checked);
                document.getElementById('btn-toggle-all-cats').textContent = allChecked ? '全不選' : '全選';
            });
        });

        const showCircles = document.getElementById('chk-show-circles');
        if (showCircles) {
            showCircles.addEventListener('change', () => {
                if (showCircles.checked) {
                    mapModule.showFlowerCircles(app.state.route);
                } else {
                    mapModule.hideFlowerCircles();
                }
            });
        }
    },

    updateTunnelStatus(running) {
        const dot = document.querySelector('#tunnel-status .dot');
        const text = document.getElementById('tunnel-text');
        if (running) {
            dot.className = 'dot green';
            text.textContent = 'Tunnel 運行中';
        } else {
            dot.className = 'dot red';
            text.textContent = 'Tunnel 未啟動';
        }
    },

    toggleAllCategories() {
        const boxes = document.querySelectorAll('.cat-filter');
        const allChecked = [...boxes].every((cb) => cb.checked);
        boxes.forEach((cb) => { cb.checked = !allChecked; });
        document.getElementById('btn-toggle-all-cats').textContent = allChecked ? '全選' : '全不選';
        mapModule.updateFavoriteVisibility();
        this.updateFavoritesList(app.state.favorites);
    },

    getVisibleCategories() {
        const visible = new Set();
        document.querySelectorAll('.cat-filter').forEach((cb) => {
            if (cb.checked) visible.add(cb.dataset.cat);
        });
        return visible;
    },

    updateFavoritesList(favorites) {
        const container = document.getElementById('favorites-list');
        container.innerHTML = '';

        const visibleCats = this.getVisibleCategories();

        const grouped = {};
        this.CATEGORY_ORDER.forEach((cat) => { grouped[cat] = []; });

        for (const [name, fav] of Object.entries(favorites)) {
            const cat = fav.category || '其他';
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push({ name, ...fav });
        }

        for (const cat of this.CATEGORY_ORDER) {
            const items = grouped[cat];
            if (!items || items.length === 0) continue;
            if (!visibleCats.has(cat)) continue;

            const header = document.createElement('div');
            header.className = 'category-header';
            header.innerHTML = `<span class="cat-dot" style="background:${this.CATEGORY_COLORS[cat]}"></span> ${cat} (${items.length})`;
            container.appendChild(header);

            items.forEach((fav) => {
                const lat = parseFloat(fav.lat);
                const lng = parseFloat(fav.lng);
                const el = document.createElement('div');
                el.className = 'list-item clickable';
                el.innerHTML = `
                    <span class="cat-dot" style="background:${this.CATEGORY_COLORS[fav.category || '其他']}"></span>
                    <div class="item-info">
                        <div class="item-name">${this.escapeHtml(fav.name)}</div>
                        <div class="item-sub">${isNaN(lat) ? fav.lat : lat.toFixed(5)}, ${isNaN(lng) ? fav.lng : lng.toFixed(5)}</div>
                    </div>
                    <div class="item-actions">
                        <select class="cat-select" onclick="event.stopPropagation()" onchange="app.changeFavoriteCategory('${this.escapeAttr(fav.name)}', this.value)">
                            ${this.CATEGORY_ORDER.map((c) =>
                                `<option value="${c}" ${c === (fav.category || '其他') ? 'selected' : ''}>${c}</option>`
                            ).join('')}
                        </select>
                        <button class="btn" onclick="event.stopPropagation(); app.deleteFavorite('${this.escapeAttr(fav.name)}')" title="刪除">✕</button>
                    </div>`;
                el.addEventListener('click', () => app.goToFavorite(fav.name));
                container.appendChild(el);
            });
        }
    },

    updateRouteList(items) {
        const container = document.getElementById('route-list');
        const countLabel = document.getElementById('route-count');
        container.innerHTML = '';
        countLabel.textContent = `共 ${items.length} 個路點`;

        items.forEach((item, i) => {
            const lat = parseFloat(item.lat);
            const lng = parseFloat(item.lng);
            const el = document.createElement('div');
            el.className = 'list-item draggable clickable';
            el.draggable = true;
            el.dataset.index = i;

            const dwellText = item.dwell > 0 ? `${item.dwell}s` : '';
            const displayName = item.name || `#${i + 1}`;

            el.innerHTML = `
                <span class="drag-handle" title="拖曳排序">⠿</span>
                <span style="font-weight:600;min-width:20px">${i + 1}</span>
                <div class="item-info">
                    <div class="item-name">${this.escapeHtml(displayName)}</div>
                    <div class="item-sub">${isNaN(lat) ? item.lat : lat.toFixed(5)}, ${isNaN(lng) ? item.lng : lng.toFixed(5)}</div>
                </div>
                ${dwellText ? `<span class="dwell-badge">${dwellText}</span>` : ''}
                <div class="item-actions">
                    <button class="btn" onclick="event.stopPropagation(); app.removeRoutePoint(${i})" title="移除">✕</button>
                </div>`;

            el.addEventListener('click', (e) => {
                if (e.target.closest('.drag-handle') || e.target.closest('.item-actions')) return;
                app.goToRoutePoint(i);
            });

            el.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', i.toString());
                el.classList.add('dragging');
            });

            el.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const dragging = container.querySelector('.dragging');
                if (dragging && dragging !== el) {
                    const rect = el.getBoundingClientRect();
                    const mid = rect.top + rect.height / 2;
                    if (e.clientY < mid) {
                        container.insertBefore(dragging, el);
                    } else {
                        container.insertBefore(dragging, el.nextSibling);
                    }
                }
            });

            el.addEventListener('drop', (e) => {
                e.preventDefault();
                const fromIdx = parseInt(e.dataTransfer.getData('text/plain'));
                const allItems = [...container.querySelectorAll('.list-item')];
                const toIdx = allItems.indexOf(el);
                if (fromIdx !== toIdx && toIdx >= 0) {
                    app.reorderRoute(fromIdx, toIdx);
                }
            });

            el.addEventListener('dragend', () => {
                el.classList.remove('dragging');
            });

            container.appendChild(el);
        });
    },

    updatePatrolStatus(text) {
        document.getElementById('patrol-status').textContent = text;
    },

    setPatrolButtons(state) {
        const startBtn = document.getElementById('btn-patrol-start');
        const pauseBtn = document.getElementById('btn-patrol-pause');
        const stopBtn = document.getElementById('btn-patrol-stop');

        switch (state) {
            case 'idle':
                startBtn.disabled = false;
                pauseBtn.disabled = true;
                stopBtn.disabled = true;
                pauseBtn.textContent = '⏸ 暫停';
                break;
            case 'running':
                startBtn.disabled = true;
                pauseBtn.disabled = false;
                stopBtn.disabled = false;
                pauseBtn.textContent = '⏸ 暫停';
                break;
            case 'paused':
                startBtn.disabled = true;
                pauseBtn.disabled = false;
                stopBtn.disabled = false;
                pauseBtn.textContent = '▶ 繼續';
                break;
        }
    },

    highlightRouteItem(idx) {
        const items = document.querySelectorAll('#route-list .list-item');
        items.forEach((el, i) => {
            el.classList.toggle('highlight', i === idx);
        });
        if (items[idx]) {
            items[idx].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
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
