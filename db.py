import os
import sqlite3

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.db")


def get_db_connection():
    """Create a database connection to the SQLite database."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Initialize the SQLite database schema and default settings row."""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY,
            port TEXT DEFAULT 'com3',
            baud_rate INTEGER DEFAULT 9600,
            data_bits INTEGER DEFAULT 8,
            parity TEXT DEFAULT 'None',
            stop_bits TEXT DEFAULT '1',
            timeout REAL DEFAULT 1.0,
            gap REAL DEFAULT 2.0,
            is_simulated INTEGER DEFAULT 0,
            start_character TEXT DEFAULT '',
            end_character TEXT DEFAULT '',
            start_address INTEGER DEFAULT 0,
            end_address INTEGER DEFAULT 0,
            reverse_weight INTEGER DEFAULT 0,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS graph_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            report_code TEXT UNIQUE NOT NULL,
            maximum_peak REAL NOT NULL DEFAULT 0,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            time_taken_seconds REAL NOT NULL DEFAULT 0,
            sample_count INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """
    )

    # Check if default row (id = 1) exists, if not insert default values
    cursor.execute("SELECT id FROM settings WHERE id = 1;")
    if not cursor.fetchone():
        cursor.execute(
            """
            INSERT INTO settings (
                id, port, baud_rate, data_bits, parity, stop_bits,
                timeout, gap, is_simulated, start_character, end_character,
                start_address, end_address, reverse_weight
            ) VALUES (
                1, 'com3', 9600, 8, 'None', '1',
                1.0, 2.0, 0, '', '',
                0, 0, 0
            );
            """
        )

    conn.commit()
    conn.close()


def get_settings():
    """Fetch stored communication settings and frame parsing rules from database."""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM settings WHERE id = 1;")
    row = cursor.fetchone()
    conn.close()

    if not row:
        init_db()
        return get_settings()

    return {
        "port": row["port"],
        "baud_rate": int(row["baud_rate"]),
        "data_bits": int(row["data_bits"]),
        "parity": row["parity"],
        "stop_bits": str(row["stop_bits"]),
        "timeout": float(row["timeout"]),
        "gap": float(row["gap"]),
        "is_simulated": bool(row["is_simulated"]),
        "start_character": row["start_character"] or "",
        "end_character": row["end_character"] or "",
        "start_address": int(row["start_address"]),
        "end_address": int(row["end_address"]),
        "reverse_weight": bool(row["reverse_weight"]),
        "updated_at": row["updated_at"]
    }


def save_settings(data):
    """Update settings row in database with provided communication & frame parsing parameters."""
    if not data or not isinstance(data, dict):
        return get_settings()

    current = get_settings()

    # Update current dict with new values if provided
    updated_port = str(data.get("port", current["port"]))
    updated_baud = int(data.get("baud_rate", current["baud_rate"]))
    updated_data_bits = int(data.get("data_bits", current["data_bits"]))
    updated_parity = str(data.get("parity", current["parity"]))
    updated_stop_bits = str(data.get("stop_bits", current["stop_bits"]))
    updated_timeout = float(data.get("timeout", current["timeout"]))
    updated_gap = float(data.get("gap", current["gap"]))
    updated_is_simulated = 1 if bool(data.get("is_simulated", current["is_simulated"])) else 0

    updated_start_char = str(data["start_character"]) if "start_character" in data else current["start_character"]
    updated_end_char = str(data["end_character"]) if "end_character" in data else current["end_character"]
    updated_start_addr = int(data["start_address"]) if "start_address" in data else current["start_address"]
    updated_end_addr = int(data["end_address"]) if "end_address" in data else current["end_address"]
    updated_reverse_weight = 1 if bool(data.get("reverse_weight", current["reverse_weight"])) else 0

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        UPDATE settings
        SET port = ?,
            baud_rate = ?,
            data_bits = ?,
            parity = ?,
            stop_bits = ?,
            timeout = ?,
            gap = ?,
            is_simulated = ?,
            start_character = ?,
            end_character = ?,
            start_address = ?,
            end_address = ?,
            reverse_weight = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = 1;
        """,
        (
            updated_port,
            updated_baud,
            updated_data_bits,
            updated_parity,
            updated_stop_bits,
            updated_timeout,
            updated_gap,
            updated_is_simulated,
            updated_start_char,
            updated_end_char,
            updated_start_addr,
            updated_end_addr,
            updated_reverse_weight,
        ),
    )

    conn.commit()
    conn.close()

    return get_settings()


def save_graph_report(data):
    """Persist a completed live graph session report."""
    conn = get_db_connection()
    cursor = conn.cursor()

    report_code = data.get("report_code")
    if not report_code:
        cursor.execute("SELECT MAX(id) FROM graph_reports;")
        row = cursor.fetchone()
        max_id = (row[0] if row and row[0] is not None else 1000)
        report_code = f"RPT-{max_id + 1}"

    cursor.execute(
        """
        INSERT INTO graph_reports (
            report_code,
            maximum_peak,
            start_time,
            end_time,
            time_taken_seconds,
            sample_count
        ) VALUES (?, ?, ?, ?, ?, ?);
        """,
        (
            str(report_code),
            float(data.get("maximum_peak", 0)),
            str(data.get("start_time", "")),
            str(data.get("end_time", "")),
            float(data.get("time_taken_seconds", 0)),
            int(data.get("sample_count", 0)),
        ),
    )

    conn.commit()
    report_id = cursor.lastrowid
    conn.close()
    return get_graph_report(report_id)


def get_graph_report(report_id):
    """Fetch one graph report by numeric id."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM graph_reports WHERE id = ?;", (report_id,))
    row = cursor.fetchone()
    conn.close()
    return _report_row_to_dict(row) if row else None


def list_graph_reports(limit=100):
    """Fetch recent graph reports newest first."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT * FROM graph_reports
        ORDER BY id DESC
        LIMIT ?;
        """,
        (int(limit),),
    )
    rows = cursor.fetchall()
    conn.close()
    return [_report_row_to_dict(row) for row in rows]


def delete_graph_report(report_id):
    """Delete a report by ID."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM graph_reports WHERE id = ?;", (report_id,))
    conn.commit()
    conn.close()
    return True


def clear_all_reports():
    """Clear all report history."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM graph_reports;")
    conn.commit()
    conn.close()
    return True


def _report_row_to_dict(row):
    return {
        "id": int(row["id"]),
        "report_code": row["report_code"],
        "maximum_peak": float(row["maximum_peak"]),
        "start_time": row["start_time"],
        "end_time": row["end_time"],
        "time_taken_seconds": float(row["time_taken_seconds"]),
        "sample_count": int(row["sample_count"]),
        "created_at": row["created_at"],
    }

