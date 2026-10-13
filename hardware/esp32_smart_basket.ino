```cpp
/*
  Smart Basket ESP32 - LCD Removed
  ESP32 -> Wi-Fi -> Render Express API -> MongoDB Atlas
  Barcode input through Serial Monitor
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

const char* WIFI_SSID = "vivo pd";
const char* WIFI_PASSWORD = "priya@2006";
const char* API_BASE = "https://smart-basket-api.onrender.com";

String scanBuffer = "";
float runningTotal = 0.0;

void connectWiFi() {
  Serial.println("Connecting to Wi-Fi...");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < 30) {
    delay(500);
    Serial.print(".");
    tries++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWi-Fi connected!");
    Serial.print("ESP32 IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\nWi-Fi failed. Check hotspot settings.");
  }
}

void lookupProduct(String barcode) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("No Wi-Fi. Reconnecting...");
    connectWiFi();
    if (WiFi.status() != WL_CONNECTED) return;
  }

  HTTPClient http;
  String url = String(API_BASE) + "/api/products/barcode/" + barcode;

  Serial.print("Requesting: ");
  Serial.println(url);

  http.begin(url);
  int code = http.GET();

  if (code == 200) {
    DynamicJsonDocument doc(2048);
    DeserializationError err = deserializeJson(doc, http.getString());

    if (!err) {
      JsonObject p = doc["product"];

      String name = p["name"] | "Product";
      float price = p["price"] | 0.0;

      runningTotal += price;

      Serial.println("\n--- PRODUCT FOUND ---");
      Serial.print("Barcode: ");
      Serial.println(barcode);
      Serial.print("Product: ");
      Serial.println(name);
      Serial.print("Price: Rs. ");
      Serial.println(price, 2);
      Serial.print("Basket Total: Rs. ");
      Serial.println(runningTotal, 2);
      Serial.println("---------------------");
    } else {
      Serial.println("JSON response error.");
    }
  } else {
    Serial.print("HTTP request failed. Code: ");
    Serial.println(code);
    Serial.println("Check Render status and API endpoint.");
  }

  http.end();
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\nSMART BASKET - LCD-FREE MODE");
  connectWiFi();

  Serial.println("Enter barcode digits in Serial Monitor and press Enter.");
}

void loop() {
  while (Serial.available()) {
    char c = Serial.read();

    if (c == '\n' || c == '\r') {
      scanBuffer.trim();

      if (scanBuffer.length() > 0) {
        lookupProduct(scanBuffer);
        scanBuffer = "";
      }
    } else if (isDigit(c)) {
      scanBuffer += c;
    }
  }
}
```
