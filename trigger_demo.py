import requests

API_URL = 'http://127.0.0.1:8000/api'
TOKEN_URL = f'{API_URL}/token/'

# Use the demo account created by `python manage.py seed_demo_data`.
login = requests.post(TOKEN_URL, json={'username': 'demo', 'password': 'demo123'})
if login.status_code != 200:
    print('Demo login failed. Run: docker compose exec web python manage.py seed_demo_data')
    raise SystemExit(1)

headers = {'Authorization': f"Bearer {login.json()['access']}"}
response = requests.get(f'{API_URL}/events/', headers=headers)

if response.status_code == 200 and response.json().get('features'):
    # Get the latest disaster event id.
    latest_event_id = response.json()['features'][-1]['id']

    print(f'Triggering analysis for Event ID: {latest_event_id}...')

    # Trigger the spatial intersection calculation endpoint.
    trigger_response = requests.post(
        f'{API_URL}/events/{latest_event_id}/trigger_analysis/',
        headers=headers,
    )

    print('Result:', trigger_response.json())
else:
    print('No events found. Use the dashboard Simulate Disaster button first.')
