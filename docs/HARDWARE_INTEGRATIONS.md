# SentinelKiosk Hardware Integrations Report

## Overview

SentinelKiosk integrates with several categories of hardware: USB thermal printers, a serial bill validator, a serial coin validator, and touchscreen displays. All hardware is optional and can be mocked for development via the `MOCK_HARDWARE=1` environment variable. Configuration is managed through `config.json`.

---

## 1. Thermal Printers (USB / ESC/POS)

All printers communicate over USB using the ESC/POS protocol via the `python-escpos` and `pyusb` libraries. Each printer model has a dedicated service class in `printers/`.

### Epson TM-88V (`PrinterEP802Service`)

- **File:** `printers/printer_ep802_service.py`
- **Protocol:** USB (ESC/POS)
- **Codepage:** CP1252 (Western European)
- **Capabilities:** Logo/image printing (via PIL), barcode printing (CODE39, CODE128, EAN8), multi-line text, amount/currency display, timestamps, paper cut

### Thermal TL60 (`PrinterTl60Service`)

- **File:** `printers/printer_tl60_service.py`
- **Protocol:** USB (ESC/POS)
- **Codepage:** CP858
- **Capabilities:** All TM-88V capabilities plus barcode image generation via `python-barcode` (203 DPI, configurable module width/height), bitImageColumn printing, full cut via `\x1b\x69`

### Custom/Citizen VKP-80 / K80 (`PrinterCustomVkp80Service`)

- **File:** `printers/printer_custom_vkp80_service.py`
- **Protocol:** USB (ESC/POS)
- **Codepage:** CP437
- **Capabilities:** Barcode generation with ImageWriter (200 DPI, EAN8 default), paper cut with eject sequence (`\x1b\x69` + `\x1d\x65\x05`), simplified line formatting

### Seiko SII RP-10 (`PrinterSiiRp10Service`)

- **File:** `printers/printer_sii_rp10_service.py`
- **Protocol:** USB (ESC/POS)
- **Default VID:PID:** `0x0619:0x0123`
- **Codepage:** CP1252
- **Capabilities:** Barcode generation (CODE128 default, 203 DPI), paper cut via GS command (`\x1d\x56\x00`), full device initialization/reset sequence

### Printer Configuration

```json
"printer": {
    "service_class": "PrinterEP802Service",
    "vendor_id": 1305,
    "product_id": 8211,
    "interface": 0,
    "in_endpoint": 129,
    "out_endpoint": 3
}
```

### Printer Discovery

- **`find_printers.py`** — Enumerates all USB devices, extracts vendor/product IDs, discovers IN/OUT endpoints, and generates `config.json` snippets
- **`printers/usb_check.py`** — Detailed USB endpoint inspection (bulk, interrupt, kernel driver status)
- **Windows:** Requires Zadig WinUSB driver; `setup.py` copies `libusb-1.0.dll` into the venv

---

## 2. Bill Validator — ITL NV-150 (SSP Protocol)

- **Files:** `NV9/nv9_core.py`, `NV9/nv9_worker.py`
- **Protocol:** SSP (Seriial Protocol) over serial UART
- **Connection:** 9600 baud, 8N1
- **USB VID:PID:** `0x191c:0x4104`
- **Linux symlink:** `/dev/bill_validator` (via udev rule)

### Supported Currency

EUR (Euro) denominations: 5, 10, 20, 50, 100, 200, 500 (configurable per dataset/channel).

### SSP Commands

| Command               | Code   | Purpose                      |
| --------------------- | ------ | ---------------------------- |
| SYNC                  | `0x11` | Frame alignment              |
| HOST_PROTOCOL_VERSION | `0x06` | Protocol negotiation         |
| SETUP_REQUEST         | `0x05` | Dataset/channel discovery    |
| SET_INHIBITS          | `0x02` | Enable/disable note channels |
| ENABLE                | `0x0A` | Start accepting notes        |
| DISABLE               | `0x09` | Stop accepting notes         |
| POLL                  | `0x07` | Fetch pending events         |
| LAST_REJECT_CODE      | `0x17` | Query rejection reason       |
| HOLD                  | `0x18` | Escrow hold control          |

### SSP Events

| Event       | Code   | Description             |
| ----------- | ------ | ----------------------- |
| NOTE_READ   | `0xEF` | Note detected in escrow |
| CREDIT_NOTE | `0xEE` | Note credited           |
| REJECTING   | `0xED` | Note returning          |
| REJECTED    | `0xEC` | Note ejected            |
| STACKING    | `0xCC` | Note moving to stacker  |
| STACKED     | `0xEB` | Note stored in stacker  |
| DISABLED    | `0xE8` | Device disabled         |

### Features

- Note escrowing with configurable timeout (max 10 seconds)
- Automatic or manual rejection with reason codes
- Per-channel inhibition (enable/disable individual denominations)
- Device disabled state detection with auto-recovery and backoff
- Qt integration via `NV9Worker(QObject)` on a dedicated QThread
- Standalone CLI tool for diagnostics (`NV9/cli.py`)

### Configuration

```json
"bill_validator": {
    "worker_class": "NV9Worker",
    "port_name": "/dev/bill_validator",
    "baud_rate": 9600,
    "slave_id": 0,
    "host_protocol_version": 6
}
```

---

## 3. Coin Validator — CPI G13 (ccTalk Protocol)

- **Files:** `G13/g13_validator.py`, `G13/g13_worker.py`
- **Protocol:** ccTalk (Coin Changer Talk)
- **Connection:** 9600 baud, 8N1
- **USB VID:PID:** `0x1a86:0x7523` (CH340 serial converter)
- **Linux symlink:** `/dev/coin_validator` (via udev rule)

### ccTalk Commands

| Command                | Header | Purpose                        |
| ---------------------- | ------ | ------------------------------ |
| ADDRESS_POLL           | 253    | Broadcast address detection    |
| REQ_MANUFACTURER_ID    | 246    | Manufacturer query             |
| REQ_PRODUCT_CODE       | 244    | Product identification         |
| REQ_SOFTWARE_REV       | 241    | Firmware version               |
| MODIFY_INHIBIT_STATUS  | 231    | Per-coin-type inhibit control  |
| REQUEST_INHIBIT_STATUS | 230    | Query inhibit state            |
| MODIFY_MASTER_INHIBIT  | 228    | Global accept/reject           |
| REQUEST_MASTER_INHIBIT | 227    | Query master state             |
| READ_BUFFERED_CREDIT   | 229    | Fetch credit buffer (11 bytes) |
| REQUEST_COIN_ID        | 184    | Query coin type identifier     |
| MODIFY_SORTER_PATHS    | 210    | Map coin types to sorter paths |

### Features

- Up to 16 coin types (6-ASCII identifiers, e.g. `EU050A` = 0.50)
- 5 sorter paths for coin routing
- Circular 5-entry credit history buffer with 8-bit counter
- Automatic address detection via broadcast poll (fallback addresses 1-5)
- 10+ mapped error codes with human-readable descriptions
- Qt integration via `G13Worker(QObject)` on a dedicated QThread (200ms default poll)
- Standalone CLI tool for diagnostics (`G13/cli.py`)

### Configuration

```json
"coin_validator": {
    "worker_class": "G13Worker",
    "port_name": "/dev/coin_validator",
    "baud_rate": 9600,
    "address": 2
}
```

---

## 4. Display & Touchscreen

### Display

- Runs as a fullscreen Qt/Chromium (QtWebEngine) kiosk application
- Three modes: `--kiosk` (frameless fullscreen), `--fullscreen` (with frame), `--windowed` (development)
- GPU acceleration flags enabled: GPU rasterization, accelerated 2D canvas, hardware video decode
- Kiosk safety: pinch-zoom disabled, swipe-back gestures disabled

### Touchscreen

- **Reference hardware:** ILITEK Multi-Touch-V5000
- **Linux X11 integration:** `xinput map-to-output <device-id> <output-name>` for multi-display mapping
- Touch-optimized numeric keypad (`ui/keypad_dialog.py`) for PIN entry

---

## 5. Device Discovery & Setup Tools

| Tool                    | Purpose                                                                     |
| ----------------------- | --------------------------------------------------------------------------- |
| `find_printers.py`      | USB printer enumeration and config generation                               |
| `find_devices.py`       | Linux serial device enumeration via `/dev/serial/by-path/` and udev queries |
| `printers/usb_check.py` | Detailed USB endpoint inspection                                            |
| `NV9/cli.py`            | Bill validator standalone diagnostics                                       |
| `G13/cli.py`            | Coin validator standalone diagnostics                                       |

### udev Rules

**File:** `setup/udev/99-sentinel-kiosk.rules`

| Device                         | VID:PID     | Symlink               |
| ------------------------------ | ----------- | --------------------- |
| ITL NV-150 Bill Validator      | `191c:4104` | `/dev/bill_validator` |
| CPI G13 Coin Validator (CH340) | `1a86:7523` | `/dev/coin_validator` |

---

## 6. Platform Support

| Feature                 | Linux                          | Windows                    | macOS               |
| ----------------------- | ------------------------------ | -------------------------- | ------------------- |
| Thermal Printers (USB)  | libusb native                  | Zadig WinUSB + bundled DLL | libusb (untested)   |
| Bill Validator (Serial) | `/dev/bill_validator` via udev | COM port (COM3-5)          | pyserial (untested) |
| Coin Validator (Serial) | `/dev/coin_validator` via udev | COM port (COM2)            | pyserial (untested) |
| Touchscreen             | X11 `xinput` mapping           | Native touch input         | Not documented      |
| Auto-start              | systemd service                | Not documented             | Not documented      |
| Permissions             | `dialout` group for serial     | Admin/Zadig                | —                   |

---

## 7. Dependencies

| Library              | Purpose                                          |
| -------------------- | ------------------------------------------------ |
| `python-escpos`      | ESC/POS printer abstraction                      |
| `pyusb`              | USB device access                                |
| `python-barcode`     | Barcode image generation                         |
| `Pillow`             | Image processing for printer output              |
| `pyserial` (>=3.5)   | Serial port communication (bill/coin validators) |
| `PySide6` (>=6.10.0) | Qt GUI framework and threading                   |
| `libusb-1.0`         | System-level USB library                         |

---

## 8. Hardware Summary

| Device          | Type           | Protocol        | Connection  | Service/Worker Class        |
| --------------- | -------------- | --------------- | ----------- | --------------------------- |
| Epson TM-88V    | Printer        | ESC/POS         | USB         | `PrinterEP802Service`       |
| Thermal TL60    | Printer        | ESC/POS         | USB         | `PrinterTl60Service`        |
| Citizen VKP-80  | Printer        | ESC/POS         | USB         | `PrinterCustomVkp80Service` |
| Seiko SII RP-10 | Printer        | ESC/POS         | USB         | `PrinterSiiRp10Service`     |
| ITL NV-150      | Bill Validator | SSP             | Serial UART | `NV9Worker`                 |
| CPI G13         | Coin Validator | ccTalk          | Serial UART | `G13Worker`                 |
| ILITEK V5000    | Touchscreen    | X11/Input       | USB HID     | Qt/X11 integration          |
| Generic Display | Monitor        | X11/Framebuffer | HDMI/DP     | Qt/Chromium                 |
