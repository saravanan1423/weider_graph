import time
import re
import threading
import queue
import random
import serial
import serial.tools.list_ports

SERIAL_PORT = "com3"
BAUD_RATE = 9600
READ_TIMEOUT_SECONDS = 1
INTER_FRAME_GAP_SECONDS = 2

BYTE_SIZE_MAP = {
    5: serial.FIVEBITS,
    6: serial.SIXBITS,
    7: serial.SEVENBITS,
    8: serial.EIGHTBITS,
}
PARITY_MAP = {
    "None": serial.PARITY_NONE,
    "Even": serial.PARITY_EVEN,
    "Odd": serial.PARITY_ODD,
}
STOP_BITS_MAP = {
    "1": serial.STOPBITS_ONE,
    "1.5": serial.STOPBITS_ONE_POINT_FIVE,
    "2": serial.STOPBITS_TWO,
}

CONTROL_PREFIX = "".join(chr(index) for index in range(32))
VALUE_PATTERN = re.compile(r"-?\d+(?:\.\d+)?")

_LIVE_READER_LOCK = threading.Lock()
_LIVE_READER = None

# Each SSE client gets its own queue so concurrent/reconnecting browser tabs
# all see every frame, instead of competing consumers splitting them up.
_SUBSCRIBERS_LOCK = threading.Lock()
_SUBSCRIBERS = set()


def register_subscriber():
    """Create and register a new per-client frame queue."""
    subscriber_queue = queue.Queue(maxsize=200)
    with _SUBSCRIBERS_LOCK:
        _SUBSCRIBERS.add(subscriber_queue)
    return subscriber_queue


def unregister_subscriber(subscriber_queue):
    with _SUBSCRIBERS_LOCK:
        _SUBSCRIBERS.discard(subscriber_queue)


def broadcast_event(payload):
    """Push a payload to every currently-connected SSE client."""
    with _SUBSCRIBERS_LOCK:
        subscribers = list(_SUBSCRIBERS)
    for subscriber_queue in subscribers:
        try:
            subscriber_queue.put_nowait(payload)
        except queue.Full:
            try:
                subscriber_queue.get_nowait()
                subscriber_queue.put_nowait(payload)
            except queue.Empty:
                pass

def list_available_ports():
    """List physical serial ports available on the system."""
    ports = []
    try:
        for port in serial.tools.list_ports.comports():
            ports.append({
                "port": port.device,
                "description": port.description or port.device,
                "hwid": port.hwid or ""
            })
    except Exception:
        pass
    
    # Provide standard COM options if list is empty
    if not ports:
        for i in range(1, 11):
            ports.append({
                "port": f"COM{i}",
                "description": f"Serial Port (COM{i})",
                "hwid": "Standard/Virtual"
            })
    return ports


def printable_text(data):
    """Display every received byte without silently discarding invalid bytes."""
    if isinstance(data, str):
        data = data.encode("ascii", errors="replace")
    return data.decode("ascii", errors="backslashreplace").rstrip("\r\n")


def print_frame(frame):
    if not frame:
        return
    print("RAW bytes :", frame)
    print("TEXT      :", printable_text(frame))
    print("HEX       :", frame.hex(" ").upper())
    print("-" * 40)


def take_complete_frames(buffer, end_marker=None):
    """Remove and return terminated frames from a persistent buffer.

    When end_marker (e.g. an ETX byte sequence) is configured, it takes
    priority as the frame boundary — many scale protocols wrap a frame in
    STX...ETX with no CR/LF at all, so relying on CR/LF alone would let the
    buffer grow forever and never yield a frame. Falls back to CR/LF framing
    otherwise.
    """
    frames = []
    while buffer:
        if end_marker:
            marker_position = buffer.find(end_marker)
            if marker_position < 0:
                break
            frame_end = marker_position + len(end_marker)
            while frame_end < len(buffer) and buffer[frame_end] in (10, 13):
                frame_end += 1
            frames.append(bytes(buffer[:frame_end]))
            del buffer[:frame_end]
            continue

        delimiter_positions = [
            position
            for position in (buffer.find(b"\r"), buffer.find(b"\n"))
            if position >= 0
        ]
        if not delimiter_positions:
            break

        delimiter_position = min(delimiter_positions)
        # Keep a trailing CR briefly so an LF arriving in the next serial chunk
        # is joined to the same frame instead of becoming a false blank frame.
        if delimiter_position == len(buffer) - 1 and buffer[delimiter_position] == 13:
            break

        frame_end = delimiter_position + 1
        while frame_end < len(buffer) and buffer[frame_end] in (10, 13):
            frame_end += 1

        frames.append(bytes(buffer[:frame_end]))
        del buffer[:frame_end]

    return frames


def read_complete_serial_frame(
    ser,
    timeout_seconds=1.0,
    inter_frame_gap_seconds=INTER_FRAME_GAP_SECONDS,
    receive_buffer=None,
    end_marker=None,
):
    """Read and reconstruct one frame using the same logic as the sample tool."""
    receive_buffer = receive_buffer if receive_buffer is not None else bytearray()
    buffered_frames = take_complete_frames(receive_buffer, end_marker=end_marker)
    if buffered_frames:
        if len(buffered_frames) > 1:
            receive_buffer[:0] = b"".join(buffered_frames[1:])
        return buffered_frames[0]

    last_byte_time = None
    deadline = time.monotonic() + max(float(timeout_seconds or 0), 0.1)

    while time.monotonic() <= deadline:
        waiting = getattr(ser, 'in_waiting', 0)
        chunk = ser.read(waiting if waiting > 0 else 1)

        if chunk:
            receive_buffer.extend(chunk)
            last_byte_time = time.monotonic()
            frames = take_complete_frames(receive_buffer, end_marker=end_marker)
            if frames:
                if len(frames) > 1:
                    receive_buffer[:0] = b"".join(frames[1:])
                return frames[0]
            continue

        if (
            receive_buffer
            and last_byte_time is not None
            and time.monotonic() - last_byte_time >= inter_frame_gap_seconds
        ):
            frame = bytes(receive_buffer)
            receive_buffer.clear()
            return frame

    frame = bytes(receive_buffer)
    receive_buffer.clear()
    return frame


def normalize_weight_value(
    raw_text,
    start_character="",
    end_character="",
    start_address=0,
    end_address=0,
    reverse_weight=False,
):
    text = str(raw_text or "")
    if not text:
        return ""

    start_marker = str(start_character or "")
    end_marker = str(end_character or "")
    if not start_marker:
        text = text.lstrip(CONTROL_PREFIX)
    if not start_marker and not end_marker:
        text = text.strip()

    if start_marker:
        marker_position = text.find(start_marker)
        if marker_position < 0:
            return ""
        text = text[marker_position + len(start_marker):]
    if end_marker:
        marker_position = text.find(end_marker)
        if marker_position < 0:
            return ""
        text = text[:marker_position]

    start_position = max(int(start_address or 0), 0)
    end_position = max(int(end_address or 0), 0)
    if start_position or end_position:
        start_index = max(start_position - 1, 0) if start_position else 0
        end_index = max(end_position - 1, 0) + 1 if end_position else None
        if end_index is not None and end_index <= start_index:
            return ""
        text = text[start_index:end_index]

    stripped = text.strip()
    if reverse_weight:
        stripped = stripped[::-1].strip()

    match = VALUE_PATTERN.fullmatch(stripped)
    if not match:
        search_match = VALUE_PATTERN.search(stripped)
        if search_match:
            match = search_match
        else:
            return stripped

    value = match.group(0)
    negative = value.startswith("-")
    numeric = value[1:] if negative else value
    if "." in numeric:
        integer_part, fraction_part = numeric.split(".", 1)
        integer_part = integer_part.lstrip("0") or "0"
        fraction_part = fraction_part.rstrip("0")
        normalized = integer_part if not fraction_part else f"{integer_part}.{fraction_part}"
    else:
        normalized = numeric.lstrip("0") or "0"
    return f"-{normalized}" if negative else normalized


def format_timeout_label(timeout_seconds):
    if timeout_seconds < 1:
        return f"{int(round(timeout_seconds * 1000))} ms"
    seconds = int(timeout_seconds) if float(timeout_seconds).is_integer() else timeout_seconds
    return f"{seconds} second" if seconds == 1 else f"{seconds} seconds"


class SimulatedSerialDevice:
    """Mock serial device interface for testing when physical COM port is absent."""
    def __init__(self):
        self.in_waiting = 0
        self.is_open = True
        self.buffer = bytearray()
        self._last_gen = time.monotonic()
        self._current_weight = 12.45

    def read(self, size=1):
        now = time.monotonic()
        if now - self._last_gen >= 0.4:
            self._last_gen = now
            self._current_weight += random.choice([-0.05, 0.0, 0.05, 0.10, -0.10])
            if self._current_weight < 0:
                self._current_weight = 0.0
            weight_str = f"{self._current_weight:07.2f}"
            frame = f"\x02  {weight_str} kg\r\n".encode("ascii")
            self.buffer.extend(frame)

        if not self.buffer:
            time.sleep(0.05)
            return b""

        to_read = min(len(self.buffer), size if size > 0 else len(self.buffer))
        chunk = bytes(self.buffer[:to_read])
        del self.buffer[:to_read]
        return chunk

    def close(self):
        self.is_open = False


class ContinuousSerialReader:
    def __init__(self, config, is_simulated=False, parse_rules=None):
        self.config = config
        self.is_simulated = is_simulated
        self.parse_rules = parse_rules or {}
        self.stop_event = threading.Event()
        self.value_event = threading.Event()
        self.state_lock = threading.Lock()
        self.latest_value = ""
        self.latest_raw_hex = ""
        self.latest_bytes_list = []
        self.latest_text = ""
        self.normalized_value = ""
        self.error_message = "Waiting for scale data"
        self.connected = False
        self.frame_count = 0
        self.thread = threading.Thread(target=self._run, daemon=True)

    def start(self):
        self.thread.start()

    def stop(self):
        self.stop_event.set()
        self.thread.join(timeout=max(float(self.config[5] or 1.0) + 0.5, 1.0))

    def update_parse_rules(self, rules):
        with self.state_lock:
            self.parse_rules.update(rules)

    def snapshot(self, wait_seconds):
        if not self.value_event.is_set():
            self.value_event.wait(timeout=max(float(wait_seconds or 0), 0.1))
        with self.state_lock:
            if self.connected:
                return {
                    "status": "success",
                    "message": "Connected",
                    "value": self.latest_value,
                    "normalized": self.normalized_value,
                    "hex": self.latest_raw_hex,
                    "text": self.latest_text,
                    "bytes": self.latest_bytes_list,
                    "frame_count": self.frame_count
                }
            return {
                "status": "not_connected",
                "message": self.error_message,
                "value": "",
                "normalized": "",
                "hex": "",
                "text": "",
                "bytes": [],
                "frame_count": 0
            }

    def _set_value(self, frame_bytes):
        text_val = printable_text(frame_bytes)
        hex_val = frame_bytes.hex(" ").upper()
        bytes_list = list(frame_bytes)
        
        with self.state_lock:
            self.frame_count += 1
            self.latest_value = text_val
            self.latest_raw_hex = hex_val
            self.latest_text = text_val
            self.latest_bytes_list = bytes_list
            self.connected = True
            self.error_message = ""
            
            self.normalized_value = normalize_weight_value(
                raw_text=text_val,
                start_character=self.parse_rules.get("start_character", ""),
                end_character=self.parse_rules.get("end_character", ""),
                start_address=self.parse_rules.get("start_address", 0),
                end_address=self.parse_rules.get("end_address", 0),
                reverse_weight=self.parse_rules.get("reverse_weight", False),
            )

        payload = {
            "timestamp": time.strftime("%H:%M:%S.") + f"{int((time.time() % 1) * 1000):03d}",
            "frame_index": self.frame_count,
            "raw_bytes": bytes_list,
            "hex": hex_val,
            "text": text_val,
            "normalized": self.normalized_value,
            "simulated": self.is_simulated
        }

        broadcast_event(payload)

        self.value_event.set()

    def _set_error(self, message):
        with self.state_lock:
            self.connected = False
            self.error_message = message

        payload = {
            "type": "error",
            "message": message,
            "simulated": self.is_simulated
        }
        broadcast_event(payload)

        self.value_event.set()

    def _run(self):
        ser = None
        receive_buffer = bytearray()
        port, baud_rate, data_bits, parity, stop_bits, read_timeout, _, inter_frame_gap = self.config
        try:
            if self.is_simulated or str(port).lower() in ("simulator", "virtual"):
                ser = SimulatedSerialDevice()
                info_msg = "Connected to Virtual Scale Simulator. Emulating live weight data stream..."
            else:
                ser = serial.Serial(
                    port=port,
                    baudrate=baud_rate,
                    bytesize=BYTE_SIZE_MAP[int(data_bits)],
                    parity=PARITY_MAP[parity],
                    stopbits=STOP_BITS_MAP[str(stop_bits)],
                    timeout=read_timeout,
                )
                info_msg = f"Successfully opened serial port {port} at {baud_rate} baud. Waiting for device data..."
            
            with self.state_lock:
                self.connected = True
                self.error_message = ""

            # Broadcast connection info event
            broadcast_event({
                "type": "info",
                "timestamp": time.strftime("%H:%M:%S"),
                "message": info_msg,
                "port": port
            })

            last_no_data_warning = time.monotonic()

            while not self.stop_event.is_set():
                with self.state_lock:
                    end_char = self.parse_rules.get("end_character", "")
                end_marker = end_char.encode("latin-1", errors="ignore") if end_char else None

                frame = read_complete_serial_frame(
                    ser,
                    timeout_seconds=read_timeout,
                    inter_frame_gap_seconds=inter_frame_gap,
                    receive_buffer=receive_buffer,
                    end_marker=end_marker,
                )
                if frame:
                    self._set_value(frame)
                    last_no_data_warning = time.monotonic()
                else:
                    # If 5 seconds pass with no serial data on real COM port, emit helpful warning info
                    if not self.is_simulated and time.monotonic() - last_no_data_warning > 6.0:
                        last_no_data_warning = time.monotonic()
                        broadcast_event({
                            "type": "info",
                            "timestamp": time.strftime("%H:%M:%S"),
                            "message": f"Listening on {port}... No data bytes received yet. (Check scale power, cable, Baud Rate, or enable Virtual Scale Simulator mode)",
                            "port": port
                        })
                    time.sleep(0.02)
        except (serial.SerialException, OSError, ValueError, KeyError) as error:
            self._set_error(f"Serial port connection error on {port}: {error}")
        finally:
            if ser is not None and getattr(ser, 'is_open', False):
                ser.close()


def get_continuous_serial_reader(config, is_simulated=False, parse_rules=None):
    global _LIVE_READER
    with _LIVE_READER_LOCK:
        if (
            _LIVE_READER is None 
            or _LIVE_READER.config != config 
            or _LIVE_READER.is_simulated != is_simulated 
            or not _LIVE_READER.thread.is_alive()
        ):
            if _LIVE_READER is not None:
                _LIVE_READER.stop()
            _LIVE_READER = ContinuousSerialReader(config, is_simulated=is_simulated, parse_rules=parse_rules)
            _LIVE_READER.start()
        elif parse_rules:
            _LIVE_READER.update_parse_rules(parse_rules)
        return _LIVE_READER


def stop_continuous_serial_reader():
    global _LIVE_READER
    with _LIVE_READER_LOCK:
        if _LIVE_READER is not None:
            _LIVE_READER.stop()
            _LIVE_READER = None


def test_serial_connection(
    port=SERIAL_PORT,
    baud_rate=BAUD_RATE,
    data_bits=8,
    parity="None",
    stop_bits="1",
    timeout_seconds=5,
    poll_interval=0.1,
    start_character="",
    end_character="",
    start_address=0,
    end_address=0,
    is_simulated=False,
    gap_seconds=INTER_FRAME_GAP_SECONDS,
):
    del poll_interval
    effective_timeout = max(float(timeout_seconds or 0), 0.1)
    config = (
        port,
        int(baud_rate),
        int(data_bits),
        parity,
        str(stop_bits),
        min(effective_timeout, 0.25),
        effective_timeout,
        max(float(gap_seconds or 0), 0.1),
    )
    parse_rules = {
        "start_character": start_character,
        "end_character": end_character,
        "start_address": start_address,
        "end_address": end_address,
    }
    reader = get_continuous_serial_reader(config, is_simulated=is_simulated, parse_rules=parse_rules)
    return reader.snapshot(effective_timeout)
