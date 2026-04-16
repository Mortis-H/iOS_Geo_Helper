import os
import sys
import webview

from version import __version__
from api import Api


def _base_dir():
    if getattr(sys, 'frozen', False):
        return sys._MEIPASS
    return os.path.dirname(os.path.abspath(__file__))


def main():
    api = Api()
    url = os.path.join(_base_dir(), "web", "index.html")

    window = webview.create_window(
        f"iOS Geo Helper v{__version__}",
        url=url,
        js_api=api,
        width=1200,
        height=750,
        min_size=(900, 600),
    )
    api.set_window(window)
    webview.start()
    api.cleanup()


if __name__ == "__main__":
    main()
