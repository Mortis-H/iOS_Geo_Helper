import tkinter as tk
from tkinter import messagebox

import storage

CATEGORIES = ["純點", "花點", "菇點", "其他"]

_AUTO_RULES = [
    ("菇點", ["菇"]),
    ("純點", ["純點"]),
    ("花點", ["花"]),
]


def auto_categorize(name: str) -> str:
    """依名稱關鍵字推測分類，優先序：菇 > 純點 > 花 > 其他。"""
    for cat, keywords in _AUTO_RULES:
        for kw in keywords:
            if kw in name:
                return cat
    return "其他"


class FavoritesManagerWindow:
    """四欄分類管理視窗：純點 / 花點 / 菇點 / 其他，支援手動搬移與排序。"""

    def __init__(self, parent, favorites: dict, on_save):
        self._favorites = favorites
        self._on_save = on_save
        self._cat_items: dict[str, list[tuple[str, dict]]] = {c: [] for c in CATEGORIES}
        self._dirty = False

        self._load_into_categories()

        self.win = tk.Toplevel(parent)
        self.win.title("收藏分類管理")
        self.win.geometry("1000x520")
        self.win.resizable(True, True)
        self.win.protocol("WM_DELETE_WINDOW", self._on_close)

        self._listboxes: dict[str, tk.Listbox] = {}
        self._count_labels: dict[str, tk.Label] = {}
        self._build_ui()
        self._refresh_all()

    # ── 資料載入 ──────────────────────────────────────────────

    def _load_into_categories(self):
        for cat in CATEGORIES:
            self._cat_items[cat] = []
        for name, data in self._favorites.items():
            cat = data.get("category") or auto_categorize(name)
            if cat not in self._cat_items:
                cat = "其他"
            self._cat_items[cat].append((name, dict(data)))

    # ── UI 建構 ───────────────────────────────────────────────

    def _build_ui(self):
        top = tk.Frame(self.win, padx=12, pady=8)
        top.pack(fill=tk.X)
        tk.Button(top, text="🔄 自動分類（未分類項目）",
                  command=self._auto_categorize_others).pack(side=tk.LEFT)
        tk.Button(top, text="💾 儲存並關閉",
                  command=self._save_and_close).pack(side=tk.RIGHT)
        tk.Button(top, text="💾 儲存",
                  command=self._save).pack(side=tk.RIGHT, padx=4)

        mid = tk.Frame(self.win, padx=12)
        mid.pack(fill=tk.BOTH, expand=True)

        for i, cat in enumerate(CATEGORIES):
            col = tk.LabelFrame(mid, text=cat, padx=6, pady=6)
            col.pack(side=tk.LEFT, fill=tk.BOTH, expand=True,
                     padx=(0 if i == 0 else 4, 0))

            count_lbl = tk.Label(col, text="0 筆", fg="gray", font=("", 9))
            count_lbl.pack(anchor="w")
            self._count_labels[cat] = count_lbl

            lb_frame = tk.Frame(col)
            lb_frame.pack(fill=tk.BOTH, expand=True)
            sb = tk.Scrollbar(lb_frame)
            sb.pack(side=tk.RIGHT, fill=tk.Y)
            lb = tk.Listbox(lb_frame, yscrollcommand=sb.set,
                            selectmode=tk.EXTENDED, font=("", 10))
            lb.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
            sb.config(command=lb.yview)
            lb.bind("<<ListboxSelect>>", lambda _e, c=cat: self._on_select(c))
            self._listboxes[cat] = lb

            btn_row = tk.Frame(col)
            btn_row.pack(fill=tk.X, pady=(4, 0))
            tk.Button(btn_row, text="▲", width=3,
                      command=lambda c=cat: self._move_up(c)).pack(side=tk.LEFT, padx=2)
            tk.Button(btn_row, text="▼", width=3,
                      command=lambda c=cat: self._move_down(c)).pack(side=tk.LEFT, padx=2)

        bot = tk.Frame(self.win, padx=12, pady=8)
        bot.pack(fill=tk.X)
        tk.Label(bot, text="移動選取項目到：").pack(side=tk.LEFT)
        self._target_var = tk.StringVar(value=CATEGORIES[0])
        tk.OptionMenu(bot, self._target_var, *CATEGORIES).pack(side=tk.LEFT, padx=4)
        tk.Button(bot, text="→ 移動",
                  command=self._move_selected).pack(side=tk.LEFT, padx=4)

    # ── 刷新 ─────────────────────────────────────────────────

    def _refresh_all(self):
        for cat in CATEGORIES:
            lb = self._listboxes[cat]
            lb.delete(0, tk.END)
            for name, _ in self._cat_items[cat]:
                lb.insert(tk.END, name)
            self._count_labels[cat].config(
                text=f"{len(self._cat_items[cat])} 筆")

    # ── 選取互斥 ──────────────────────────────────────────────

    def _on_select(self, selected_cat: str):
        for cat in CATEGORIES:
            if cat != selected_cat:
                self._listboxes[cat].selection_clear(0, tk.END)

    # ── 排序（上移 / 下移）────────────────────────────────────

    def _move_up(self, cat: str):
        lb = self._listboxes[cat]
        sel = list(lb.curselection())
        if not sel or sel[0] == 0:
            return
        items = self._cat_items[cat]
        for i in sel:
            items[i - 1], items[i] = items[i], items[i - 1]
        self._dirty = True
        self._refresh_all()
        for i in sel:
            lb.selection_set(i - 1)
        lb.see(sel[0] - 1)

    def _move_down(self, cat: str):
        lb = self._listboxes[cat]
        sel = list(lb.curselection())
        if not sel or sel[-1] >= len(self._cat_items[cat]) - 1:
            return
        items = self._cat_items[cat]
        for i in reversed(sel):
            items[i + 1], items[i] = items[i], items[i + 1]
        self._dirty = True
        self._refresh_all()
        for i in sel:
            lb.selection_set(i + 1)
        lb.see(sel[-1] + 1)

    # ── 搬移分類 ──────────────────────────────────────────────

    def _move_selected(self):
        src_cat = None
        indices: list[int] = []
        for cat in CATEGORIES:
            sel = list(self._listboxes[cat].curselection())
            if sel:
                src_cat = cat
                indices = sel
                break
        if not src_cat:
            messagebox.showinfo("提示", "請先在任一分類中選取項目")
            return
        target = self._target_var.get()
        if target == src_cat:
            return
        moved = [self._cat_items[src_cat][i] for i in indices]
        for i in sorted(indices, reverse=True):
            self._cat_items[src_cat].pop(i)
        self._cat_items[target].extend(moved)
        self._dirty = True
        self._refresh_all()

    # ── 自動分類 ──────────────────────────────────────────────

    def _auto_categorize_others(self):
        others = self._cat_items["其他"][:]
        remaining = []
        moved = 0
        for name, data in others:
            detected = auto_categorize(name)
            if detected != "其他":
                self._cat_items[detected].append((name, data))
                moved += 1
            else:
                remaining.append((name, data))
        self._cat_items["其他"] = remaining
        if moved:
            self._dirty = True
        self._refresh_all()
        messagebox.showinfo("自動分類", f"已從「其他」移動 {moved} 筆到對應分類")

    # ── 儲存 ──────────────────────────────────────────────────

    def _save(self):
        new_fav: dict[str, dict] = {}
        for cat in CATEGORIES:
            for name, data in self._cat_items[cat]:
                new_fav[name] = {"lat": data["lat"], "lng": data["lng"], "category": cat}
        self._favorites.clear()
        self._favorites.update(new_fav)
        storage.save_favorites(self._favorites)
        self._dirty = False
        self._on_save()

    def _save_and_close(self):
        self._save()
        self.win.destroy()

    def _on_close(self):
        if self._dirty:
            result = messagebox.askyesnocancel("關閉", "是否儲存變更？")
            if result is None:
                return
            if result:
                self._save()
        self.win.destroy()
