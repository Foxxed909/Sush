#!/usr/bin/env python3
"""Quick system health check — CPU, RAM, disk."""
import platform, sys

try:
    import psutil
    cpu = psutil.cpu_percent(interval=0.5)
    ram = psutil.virtual_memory()
    disk = psutil.disk_usage('/')
    print(f"OS      : {platform.system()} {platform.release()}")
    print(f"CPU     : {cpu:.1f}%")
    print(f"RAM     : {ram.percent:.1f}%  ({ram.used // 1024**2} MB / {ram.total // 1024**2} MB)")
    print(f"Disk    : {disk.percent:.1f}%  ({disk.used // 1024**3:.1f} GB / {disk.total // 1024**3:.1f} GB)")
except ImportError:
    print(f"OS      : {platform.system()} {platform.release()}")
    print("Install psutil for full stats: pip install psutil")
