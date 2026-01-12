import os
import subprocess
import sys


def main() -> None:
    here = os.path.dirname(os.path.abspath(__file__))
    req = os.path.join(here, "requirements.txt")
    if not os.path.exists(req):
        print("AUN: requirements.txt not found; nothing to install.")
        return

    # Use the currently running Python (ComfyUI's interpreter).
    cmd = [sys.executable, "-m", "pip", "install", "-r", req]
    print("AUN: installing dependencies ->", " ".join(cmd))
    subprocess.check_call(cmd)


if __name__ == "__main__":
    main()
