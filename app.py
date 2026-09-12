import json
import time
import queue
from flask import Flask, render_template, jsonify, request, Response

from serial_handler import (
    list_available_ports,
    normalize_weight_value,
    get_continuous_serial_reader,
    stop_continuous_serial_reader,
    test_serial_connection,
    register_subscriber,
    unregister_subscriber
)
from db import (
    init_db,
    get_settings,
    save_settings,
    save_graph_report,
    list_graph_reports,
    delete_graph_report,
    clear_all_reports,
)

app = Flask(__name__)
# Initialize SQLite database schema and default configuration
init_db()


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/ports", methods=["GET"])
def get_ports():
    ports = list_available_ports()
    return jsonify({"status": "success", "ports": ports})


@app.route("/api/settings", methods=["GET"])
def get_app_settings():
    settings = get_settings()
    return jsonify({"status": "success", "settings": settings})


@app.route("/api/settings", methods=["POST"])
def update_app_settings():
    data = request.json or {}
    saved = save_settings(data)
    return jsonify({"status": "success", "message": "Settings saved to database", "settings": saved})


@app.route("/api/reports", methods=["GET"])
def get_all_reports():
    reports = list_graph_reports()
    return jsonify({"status": "success", "reports": reports})


@app.route("/api/reports", methods=["POST"])
def create_report_record():
    data = request.json or {}
    report = save_graph_report(data)
    return jsonify({"status": "success", "message": "Report saved to database", "report": report})


@app.route("/api/reports/<int:report_id>", methods=["DELETE"])
def remove_report_record(report_id):
    delete_graph_report(report_id)
    return jsonify({"status": "success", "message": f"Report #{report_id} deleted."})


@app.route("/api/reports/clear", methods=["POST"])
def clear_reports_history():
    clear_all_reports()
    return jsonify({"status": "success", "message": "All reports cleared."})




@app.route("/api/connect", methods=["POST"])
def connect_serial():
    # Force stop existing serial reader thread to ensure clean re-connection
    stop_continuous_serial_reader()

    data = request.json or {}
    port = data.get("port", "com3")
    baud_rate = int(data.get("baud_rate", 9600))
    data_bits = int(data.get("data_bits", 8))
    parity = data.get("parity", "None")
    stop_bits = str(data.get("stop_bits", "1"))
    timeout = float(data.get("timeout", 1.0))
    gap = float(data.get("gap", 2.0))
    is_simulated = bool(data.get("is_simulated", False))

    parse_rules = {
        "start_character": data.get("start_character", ""),
        "end_character": data.get("end_character", ""),
        "start_address": int(data.get("start_address", 0)),
        "end_address": int(data.get("end_address", 0)),
        "reverse_weight": bool(data.get("reverse_weight", False))
    }

    # Automatically persist settings to SQLite database
    save_settings({
        "port": port,
        "baud_rate": baud_rate,
        "data_bits": data_bits,
        "parity": parity,
        "stop_bits": stop_bits,
        "timeout": timeout,
        "gap": gap,
        "is_simulated": is_simulated,
        **parse_rules
    })


    effective_timeout = max(timeout, 0.1)
    config = (
        port,
        baud_rate,
        data_bits,
        parity,
        stop_bits,
        min(effective_timeout, 0.25),
        effective_timeout,
        max(gap, 0.1),
    )

    try:
        reader = get_continuous_serial_reader(config, is_simulated=is_simulated, parse_rules=parse_rules)
        time.sleep(0.3)
        with reader.state_lock:
            if not reader.connected and reader.error_message and "Waiting" not in reader.error_message:
                return jsonify({"status": "error", "message": reader.error_message}), 400

        return jsonify({
            "status": "success",
            "message": f"Connected to {port} ({'Simulated' if is_simulated else 'Hardware'})",
            "config": {
                "port": port,
                "baud_rate": baud_rate,
                "data_bits": data_bits,
                "parity": parity,
                "stop_bits": stop_bits,
                "timeout": timeout,
                "gap": gap,
                "is_simulated": is_simulated
            }
        })
    except Exception as err:
        return jsonify({"status": "error", "message": str(err)}), 400


@app.route("/api/disconnect", methods=["POST"])
def disconnect_serial():
    try:
        stop_continuous_serial_reader()
        return jsonify({"status": "success", "message": "Serial connection closed."})
    except Exception as err:
        return jsonify({"status": "error", "message": str(err)}), 500


@app.route("/api/update_rules", methods=["POST"])
def update_rules():
    data = request.json or {}
    parse_rules = {
        "start_character": data.get("start_character", ""),
        "end_character": data.get("end_character", ""),
        "start_address": int(data.get("start_address", 0)),
        "end_address": int(data.get("end_address", 0)),
        "reverse_weight": bool(data.get("reverse_weight", False))
    }
    # Update active reader rules if running
    global_reader = get_continuous_serial_reader.__globals__.get('_LIVE_READER')
    if global_reader:
        global_reader.update_parse_rules(parse_rules)

    # Persist rules to SQLite database
    save_settings(parse_rules)
    return jsonify({"status": "success", "message": "Rules updated and saved to database", "rules": parse_rules})



@app.route("/api/parse_test", methods=["POST"])
def parse_test():
    data = request.json or {}
    raw_text = data.get("raw_text", "")
    start_char = data.get("start_character", "")
    end_char = data.get("end_character", "")
    start_addr = int(data.get("start_address", 0))
    end_addr = int(data.get("end_address", 0))
    reverse = bool(data.get("reverse_weight", False))

    normalized = normalize_weight_value(
        raw_text=raw_text,
        start_character=start_char,
        end_character=end_char,
        start_address=start_addr,
        end_address=end_addr,
        reverse_weight=reverse
    )

    # Calculate breakdown for character index visualization
    text = str(raw_text or "")
    start_pos = -1
    end_pos = -1
    start_marker = str(start_char or "")
    end_marker = str(end_char or "")

    frame_text = text
    frame_offset = 0

    if start_marker:
        pos = text.find(start_marker)
        if pos >= 0:
            start_pos = pos
            frame_offset = pos + len(start_marker)

    if end_marker:
        search_from = frame_offset if start_pos >= 0 else 0
        pos = text.find(end_marker, search_from)
        if pos >= 0:
            end_pos = pos

    if start_pos >= 0 and end_pos >= 0:
        frame_text = text[start_pos + len(start_marker):end_pos]
    elif start_pos >= 0:
        frame_text = text[start_pos + len(start_marker):]
    elif end_pos >= 0:
        frame_text = text[:end_pos]

    # Calculate 1-based address slice in frame_text
    start_idx = max(start_addr - 1, 0) if start_addr else 0
    end_idx = max(end_addr - 1, 0) + 1 if end_addr else None

    sliced_text = frame_text
    if start_addr or end_addr:
        if end_idx is not None and end_idx <= start_idx:
            sliced_text = ""
        else:
            sliced_text = frame_text[start_idx:end_idx] if end_idx is not None else frame_text[start_idx:]

    return jsonify({
        "status": "success",
        "raw_text": raw_text,
        "frame_text": frame_text,
        "sliced_text": sliced_text,
        "normalized": normalized,
        "start_pos": start_pos,
        "end_pos": end_pos,
        "start_marker_len": len(start_marker),
        "end_marker_len": len(end_marker),
        "frame_offset": frame_offset
    })


@app.route("/api/test", methods=["POST"])
def test_connection():
    data = request.json or {}
    port = data.get("port", "com3")
    baud_rate = int(data.get("baud_rate", 9600))
    data_bits = int(data.get("data_bits", 8))
    parity = data.get("parity", "None")
    stop_bits = str(data.get("stop_bits", "1"))
    timeout = float(data.get("timeout", 5.0))
    is_simulated = bool(data.get("is_simulated", False))

    res = test_serial_connection(
        port=port,
        baud_rate=baud_rate,
        data_bits=data_bits,
        parity=parity,
        stop_bits=stop_bits,
        timeout_seconds=timeout,
        start_character=data.get("start_character", ""),
        end_character=data.get("end_character", ""),
        start_address=int(data.get("start_address", 0)),
        end_address=int(data.get("end_address", 0)),
        is_simulated=is_simulated
    )
    return jsonify(res)


@app.route("/api/reports", methods=["GET"])
def get_reports():
    limit = int(request.args.get("limit", 100))
    return jsonify({"status": "success", "reports": list_graph_reports(limit=limit)})


@app.route("/api/reports", methods=["POST"])
def create_report():
    data = request.json or {}
    saved = save_graph_report(data)
    return jsonify({"status": "success", "report": saved})


@app.route("/api/stream")
def sse_stream():
    def event_generator():
        # Each connection gets its own queue so concurrent/reconnecting tabs
        # all see every frame instead of stealing them from one another.
        subscriber_queue = register_subscriber()
        try:
            # Yield connection keep-alive heartbeat
            yield f"data: {json.dumps({'type': 'ping', 'message': 'Stream connected'})}\n\n"
            while True:
                try:
                    # Wait for next serial frame with a timeout
                    frame_data = subscriber_queue.get(timeout=0.5)
                    if isinstance(frame_data, dict) and "type" not in frame_data:
                        frame_data["type"] = "frame"
                    yield f"data: {json.dumps(frame_data)}\n\n"
                except queue.Empty:
                    yield f"data: {json.dumps({'type': 'keepalive'})}\n\n"
                except (GeneratorExit, OSError):
                    break
                except Exception:
                    break
        finally:
            unregister_subscriber(subscriber_queue)

    return Response(event_generator(), mimetype="text/event-stream")


if __name__ == "__main__":
    print("=" * 60)
    print(" Starting Serial Port Data Visualizer & Parsing App...")
    print(" Open http://127.0.0.1:5000 in your browser.")
    print("=" * 60)
    app.run(host="127.0.0.1", port=5000, debug=False, threaded=True)
