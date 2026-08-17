import requests
import json
import time
import sys

BASE_URL = "http://localhost:8000/api"
TOKEN_URL = f"{BASE_URL}/token/"

failures = 0

# 1. Test Server Connectivity
try:
    print("[*] Testing server connectivity...")
    # Just checking if port is open
    requests.get(BASE_URL)
except requests.exceptions.ConnectionError:
    print("[-] Server is down or not responding on port 8000. Is docker-compose running?")
    sys.exit(1)

# Chat API now requires authentication (IsAuthenticated); anonymous POST should be rejected
print("\n[*] Testing Chat API Auth...")
chat_resp = requests.post(f"{BASE_URL}/chat/", json={"message": "hello"})
if chat_resp.status_code in [401, 403]:
    print("[+] Chat API properly rejects anonymous access (returned 401/403).")
else:
    print(f"[-] Chat API anonymous POST returned {chat_resp.status_code}, expected 401/403")
    failures += 1

# Farm API uses IsAuthenticatedOrReadOnly: anonymous GET should be allowed (200)
print("\n[*] Testing Farm API anonymous read...")
farms_resp = requests.get(f"{BASE_URL}/farms/")
if farms_resp.status_code == 200:
    print("[+] Farm API allows anonymous read (GET returned 200).")
else:
    print(f"[-] Farm API anonymous GET returned {farms_resp.status_code}, expected 200")
    failures += 1

# Anonymous write must still be rejected (401/403)
print("\n[*] Testing Farm API anonymous write...")
post_resp = requests.post(f"{BASE_URL}/farms/", json={"name": "anon-farm"})
if post_resp.status_code in [401, 403]:
    print("[+] Farm API properly protects writes by Auth (anonymous POST returned 401/403).")
else:
    print(f"[-] Farm API anonymous POST returned {post_resp.status_code}, expected 401/403")
    failures += 1

print("\n[*] Tests completed.")
if failures:
    print(f"[-] {failures} test(s) failed.")
    sys.exit(1)
print("[+] All tests passed.")
