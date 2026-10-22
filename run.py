#!/usr/bin/env python3
"""
Single-command entrypoint to run the RAG Chatbot backend.
Usage:
    python run.py
    python run.py 8000
    python run.py 0.0.0.0:8000
"""

import sys
import subprocess
from pathlib import Path

# Ensure UTF-8 output if supported by terminal
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


def print_help():
    print("""
Usage: python run.py [HOST:PORT | PORT] [DJANGO OPTIONS]

Examples:
    python run.py                   # Runs server at http://127.0.0.1:8000/
    python run.py 8080              # Runs server at http://127.0.0.1:8080/
    python run.py 0.0.0.0:8000      # Exposes server to local network
    python run.py --noreload        # Runs server without auto-reloader
""")


def main():
    root_dir = Path(__file__).resolve().parent
    server_dir = root_dir / "source" / "djangoserver"
    manage_py = server_dir / "manage.py"

    if "--help" in sys.argv or "-h" in sys.argv:
        print_help()
        sys.exit(0)

    if not manage_py.exists():
        print(f"[ERROR] manage.py not found at: {manage_py}", file=sys.stderr)
        sys.exit(1)

    # 1. Verify Django dependency
    try:
        import django  # noqa: F401
    except ImportError:
        print("[ERROR] Django is not installed in the current Python environment.", file=sys.stderr)
        print("Please install requirements first by running:", file=sys.stderr)
        print("    pip install -r requirements.txt", file=sys.stderr)
        sys.exit(1)

    # 2. Check for .env file; if missing, create one from .env.example
    env_file = server_dir / ".env"
    example_env = root_dir / ".env.example"
    if not env_file.exists() and example_env.exists():
        print("[INFO] Creating source/djangoserver/.env from .env.example...")
        env_file.write_text(example_env.read_text(encoding="utf-8"), encoding="utf-8")

    # 3. Determine host:port from command line arguments (if any)
    addr = "127.0.0.1:8000"
    extra_args = []
    if len(sys.argv) > 1:
        arg = sys.argv[1]
        if arg.isdigit():
            addr = f"127.0.0.1:{arg}"
            extra_args = sys.argv[2:]
        elif ":" in arg or arg in ("localhost", "127.0.0.1", "0.0.0.0"):
            addr = arg
            extra_args = sys.argv[2:]
        else:
            extra_args = sys.argv[1:]

    # 4. Run database migrations automatically before starting server
    print("[1/2] Applying database migrations...")
    try:
        subprocess.run(
            [sys.executable, str(manage_py), "migrate", "--noinput"],
            cwd=str(server_dir),
            check=True
        )
    except subprocess.CalledProcessError as e:
        print(f"[ERROR] Database migration failed with exit code {e.returncode}", file=sys.stderr)
        sys.exit(e.returncode)
    except KeyboardInterrupt:
        print("\n[INFO] Cancelled by user.")
        sys.exit(0)

    # 5. Display banner (ASCII-safe for all Windows consoles)
    display_url = f"http://{addr}/" if not addr.startswith("0.0.0.0") else "http://127.0.0.1:8000/"
    print("\n" + "=" * 56)
    print(" [RAG Chatbot] Backend Server Ready")
    print("=" * 56)
    print(f" -> App URL    : {display_url}")
    print(f" -> Admin URL  : {display_url}admin/")
    print(" -> Stop Server: Press Ctrl+C")
    print("=" * 56 + "\n")

    # 6. Launch Django development server
    cmd = [sys.executable, str(manage_py), "runserver", addr] + extra_args
    try:
        subprocess.run(cmd, cwd=str(server_dir))
    except KeyboardInterrupt:
        print("\n[INFO] Backend server stopped.")
        sys.exit(0)


if __name__ == "__main__":
    main()
