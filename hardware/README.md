# Hardware connection guide

## ESP32 + LCD (16x2 I2C)
| LCD I2C pin | ESP32 DevKit V1 |
|---|---|
| VCC | 5V/VIN if your backpack supports 5V (check module) |
| GND | GND |
| SDA | GPIO 21 |
| SCL | GPIO 22 |

If the display is blank, check contrast potentiometer and try I2C address `0x3F` instead of `0x27`.
Install Arduino IDE libraries: `LiquidCrystal_I2C` and `ArduinoJson` (by Benoit Blanchon). Select ESP32 Dev Module and its COM port. Enter Wi-Fi and Render API URL in the sketch before upload. The ESP32 sample accepts a barcode typed into Serial Monitor at 115200 baud; barcode scanner UART integration must be wired/configured to match the exact scanner model. Never connect a 5V UART TX directly to ESP32 RX unless level-shifted; ESP32 GPIO is 3.3V logic.

## Arduino UNO + 4 buttons
- Button 1: D2 to one button leg; other leg to GND.
- Button 2: D3 to one leg; other leg to GND.
- Button 3: D4 to one leg; other leg to GND.
- Button 4: D5 to one leg; other leg to GND.
- UNO USB cable -> cashier laptop.
- Upload `cashier_buttons.ino`; choose Arduino Uno and correct COM port.
- Open cashier website in Chrome/Edge localhost/HTTPS, click Connect Arduino and grant serial access.
- The app interprets 1–4 as B1–B4. Buttons do not directly connect to MongoDB; they send serial data to the browser, which selects the matching basket filter.

## ESP32 setup
1. Install Arduino IDE 2.
2. Boards Manager: install `esp32` by Espressif Systems.
3. Library Manager: install `LiquidCrystal_I2C` and `ArduinoJson`.
4. Open `esp32_smart_basket.ino`, set Wi-Fi name/password and API URL.
5. Select `ESP32 Dev Module`, correct COM port, upload.
6. The example reads barcode digits typed into Serial Monitor. Adapt UART scanner code only after checking the scanner's model, TX/RX pins and voltage.
