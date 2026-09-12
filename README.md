# Serial Data Monitor & Scale Analyzer

A Flask-based dashboard for reading, parsing, visualizing, and reporting serial data from weighing scales or other serial devices. The app can connect to physical COM/TTY ports through `pyserial`, or run against a built-in virtual scale simulator for local testing without hardware.

The current project is a compact single-app structure:

- Flask backend in `app.py`
- SQLite persistence in `config.db` through `db.py`
- Serial reader, frame parsing, and simulator logic in `serial_handler.py`
- Browser dashboard in `templates/index.html`, `static/js/app.js`, and `static/css/style.css`

## Features

- Live serial streaming through Server-Sent Events (SSE)
- Physical serial-port support through `pyserial`
- Built-in virtual scale simulator
- Configurable baud rate, data bits, parity, stop bits, timeout, and inter-frame gap
- Configurable parsing rules for start marker, end marker, character address range, and reverse string handling
- Raw frame inspection as text, byte list, and hex
- Live graph recording with min, max, average, sample count, and peak detection
- SQLite-backed communication settings
- SQLite-backed graph session reports
- JSON log export from the browser

## Project Structure

```text
.
|-- app.py                  # Flask app, API routes, SSE stream endpoint
|-- db.py                   # SQLite schema and persistence helpers
|-- serial_handler.py       # Serial-port discovery, frame reading, parser, simulator
|-- config.db               # Local SQLite database
|-- README.md               # Project documentation
|-- static/
|   |-- css/
|   |   `-- style.css       # Dashboard styling
|   `-- js/
|       `-- app.js          # Frontend state, API calls, graph drawing, reports UI
|-- templates/
|   `-- index.html          # Main dashboard template
|-- myenv/                  # Local virtual environment
`-- __pycache__/            # Python bytecode cache
```

## Runtime Requirements

- Python 3.10+
- Flask
- pyserial

There is currently no `requirements.txt` in this folder. Install the required packages manually:

```bash
pip install flask pyserial
```

## Setup

### Windows PowerShell

```powershell
python -m venv myenv
.\myenv\Scripts\Activate.ps1
pip install flask pyserial
python app.py
```

### Linux/macOS

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install flask pyserial
python app.py
```

Open the app at:

```text
http://127.0.0.1:5000
```

## Using the App

1. Open the dashboard.
2. Go to **Communication Settings**.
3. Select either a detected serial port or enable the virtual scale simulator.
4. Configure baud rate, data bits, parity, stop bits, timeout, and inter-frame gap.
5. Set parsing rules if your scale frame needs slicing.
6. Click **Connect & Stream**.
7. Use **Live Graph** to record a session.
8. Click **Stop** to calculate the peak and save a report to SQLite.
9. Open **Reports** to view or delete saved graph-session history.

## Serial Parsing Rules

Parsing is handled by `normalize_weight_value()` in `serial_handler.py`.

- `start_character`: optional marker where the useful frame begins.
- `end_character`: optional marker where the useful frame ends.
- `start_address`: optional one-based inclusive character position.
- `end_address`: optional one-based inclusive character position.
- `reverse_weight`: reverses the extracted string before normalization.

Example:

```text
Raw stream:       05[000000]$%05[000000]$%
Start character: [
End character:   ]
Start address:   1
End address:     6
Result:          000000
Normalized:      0
```

Control characters can be entered from the UI as escaped values such as:

```text
\x02
\x03
\r
\n
```

## Database

The app stores data in:

```text
config.db
```

`db.py` creates the tables automatically when the Flask app starts.

### `settings`

Stores the latest serial and parser configuration. The app keeps a single row with `id = 1`.

Important fields:

- `port`
- `baud_rate`
- `data_bits`
- `parity`
- `stop_bits`
- `timeout`
- `gap`
- `is_simulated`
- `start_character`
- `end_character`
- `start_address`
- `end_address`
- `reverse_weight`
- `updated_at`

### `graph_reports`

Stores completed graph recording sessions.

Important fields:

- `report_code`
- `maximum_peak`
- `start_time`
- `end_time`
- `time_taken_seconds`
- `sample_count`
- `created_at`

## API Reference

### Page

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/` | Render the main dashboard |

### Settings and ports

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/ports` | List detected serial ports, with fallback COM ports |
| `GET` | `/api/settings` | Read saved settings from SQLite |
| `POST` | `/api/settings` | Save serial and parser settings |

### Serial connection

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/connect` | Start the live serial reader |
| `POST` | `/api/disconnect` | Stop the live serial reader |
| `POST` | `/api/test` | Read a snapshot/test frame |
| `GET` | `/api/stream` | SSE endpoint for live frame events |

### Parser testing

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/update_rules` | Update active parser rules and persist them |
| `POST` | `/api/parse_test` | Test parser rules against supplied raw text |

### Reports

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/reports` | List saved graph reports |
| `POST` | `/api/reports` | Save a graph report |
| `DELETE` | `/api/reports/<report_id>` | Delete one report |
| `POST` | `/api/reports/clear` | Delete all saved reports |

## Serial-Port Notes

### Windows

Typical ports are named `COM1`, `COM2`, `COM3`, and so on. If no physical ports are detected, the UI still offers fallback COM options.

### Linux

List connected serial devices:

```bash
python3 -m serial.tools.list_ports -v
```

Common device names:

```text
/dev/ttyUSB0
/dev/ttyACM0
```

On Debian/Ubuntu, your user may need access to the `dialout` group:

```bash
sudo usermod -aG dialout "$USER"
```

Log out and back in after changing group membership.

## Development Checks

Compile-check the Python files:

```bash
python -m py_compile app.py db.py serial_handler.py
```

Run the app locally:

```bash
python app.py
```

## Current Code Notes

- `app.py` currently registers `/api/reports` twice for both `GET` and `POST`. Flask accepts the duplicate route definitions because the endpoint function names differ, but only the first matching route is normally used. This should be cleaned up to avoid confusion.
- `requirements.txt` is not present. Add one if the project will be deployed or shared.
- `config.db` is present in the project folder. For production, consider using an environment-specific database path and excluding local database files from version control.
- The frontend loads Google Fonts from the network. If this app must run fully offline, bundle fonts locally or remove that dependency.
