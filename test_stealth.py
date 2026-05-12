import sys
print(f"Python: {sys.executable}")
print(f"Path: {sys.path}")
try:
    import playwright_stealth
    print(f"Module: {playwright_stealth}")
    from playwright_stealth import stealth_async
    print("Import successful!")
except ImportError as e:
    print(f"Import failed: {e}")
except Exception as e:
    print(f"Error: {e}")
