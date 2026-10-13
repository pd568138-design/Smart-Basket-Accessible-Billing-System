/*
 Smart Basket ESP32 + 16x2 I2C LCD
 Recommended architecture: ESP32 -> Express API -> MongoDB Atlas.
 Update WIFI_SSID, WIFI_PASSWORD and API_BASE. Do not put MongoDB credentials on ESP32.
 Hardware assumptions:
 - ESP32 DevKit V1
 - 16x2 LCD with I2C backpack, address usually 0x27 (sometimes 0x3F)
 - I2C SDA=GPIO21, SCL=GPIO22
 This starter fetches products from the backend by barcode entered in Serial Monitor.
 Add your barcode scanner UART wiring only after confirming scanner TX voltage and pins.
*/
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

const char* WIFI_SSID = "vivo pd";
const char* WIFI_PASSWORD = "priya@2006";
const char* API_BASE = "https://smart-basket-api.onrender.com";
LiquidCrystal_I2C lcd(0x27, 16, 2);
String scanBuffer = "";
float runningTotal = 0.0;

void showLCD(String a, String b) {
  lcd.clear(); lcd.setCursor(0,0); lcd.print(a.substring(0,16));
  lcd.setCursor(0,1); lcd.print(b.substring(0,16));
}
void connectWiFi() {
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  showLCD("Connecting WiFi", "");
  int tries=0;
  while(WiFi.status()!=WL_CONNECTED && tries<30){delay(500);tries++;}
  if(WiFi.status()==WL_CONNECTED) showLCD("WiFi connected", WiFi.localIP().toString());
  else showLCD("WiFi failed", "Check settings");
}
void lookupProduct(String barcode) {
  if(WiFi.status()!=WL_CONNECTED){showLCD("No WiFi", "Reconnect device");return;}
  HTTPClient http;
  String url=String(API_BASE)+"/api/products/barcode/"+barcode;
  http.begin(url);
  int code=http.GET();
  if(code==200){
    DynamicJsonDocument doc(2048);
    DeserializationError err=deserializeJson(doc,http.getString());
    if(!err){
      JsonObject p=doc["product"];
      String name=p["name"] | "Product";
      float price=p["price"] | 0.0;
      runningTotal+=price;
      showLCD(name, "Rs "+String(price,2)+" T:"+String(runningTotal,2));
      Serial.printf("PRODUCT,%s,%.2f,TOTAL,%.2f\n",name.c_str(),price,runningTotal);
    }else showLCD("JSON error","Try again");
  }else showLCD("Not found", barcode);
  http.end();
}
void setup(){
  Serial.begin(115200);
  Wire.begin(21,22);
  lcd.init(); lcd.backlight(); showLCD("Smart Basket","Starting...");
  connectWiFi();
  Serial.println("Type barcode digits in Serial Monitor then press Enter.");
}
void loop(){
  while(Serial.available()){
    char c=Serial.read();
    if(c=='\n'||c=='\r'){
      scanBuffer.trim();
      if(scanBuffer.length()>0){lookupProduct(scanBuffer);scanBuffer="";}
    }else if(isDigit(c)) scanBuffer+=c;
  }
}
