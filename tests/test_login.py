import requests
import time

URL = "http://localhost:8002/api/auth/admin-login"

def test_login():
    print("Testing Admin Login...")
    try:
        res = requests.post(URL, json={"password": "admin123"})
        print(f"Status: {res.status_code}")
        print(f"Response: {res.text}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_login()
