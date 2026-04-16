CATEGORIES = ["純點", "花點", "菇點", "其他"]

_AUTO_RULES = [
    ("菇點", ["菇"]),
    ("純點", ["純點"]),
    ("花點", ["花"]),
]


def auto_categorize(name: str) -> str:
    for cat, keywords in _AUTO_RULES:
        for kw in keywords:
            if kw in name:
                return cat
    return "其他"
