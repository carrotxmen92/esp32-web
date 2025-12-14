#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <HardwareSerial.h>

/* ================= CONFIG ================= */
#define WIFI_CHANNEL   1
#define SIM_BAUD       115200
#define SERVER_URL     "http://esp32-web.onrender.com/api/data"

/* ================= SIM UART ================= */
HardwareSerial sim7600(2); // RX=18 TX=17

/* ================= DATA ================= */
typedef struct __attribute__((packed)) {
  uint8_t node_id;
  float temp_obj;
  float temp_amb;
} sensor_packet_t;

sensor_packet_t lastPacket;
bool newData = false;

/* ================= ESP-NOW RECEIVE ================= */
void onReceive(const esp_now_recv_info_t *info,
               const uint8_t *data,
               int len)
{
  memcpy(&lastPacket, data, sizeof(lastPacket));
  newData = true;

  Serial.println("\n📥 ESP-NOW RECEIVED");
  Serial.printf("Node %d | Obj %.2f | Amb %.2f\n",
                lastPacket.node_id,
                lastPacket.temp_obj,
                lastPacket.temp_amb);
}

/* ================= AT SEND ================= */
void sendAT(String cmd, uint32_t waitMs = 500)
{
  Serial.print(">> ");
  Serial.println(cmd);
  sim7600.println(cmd);

  uint32_t t = millis();
  while (millis() - t < waitMs) {
    while (sim7600.available()) {
      Serial.write(sim7600.read());
    }
  }
}

/* ================= HTTP POST ================= */
void httpPost(sensor_packet_t &pkt)
{
  String json =
    "{\"node_id\":" + String(pkt.node_id) +
    ",\"temp_obj\":" + String(pkt.temp_obj, 2) +
    ",\"temp_amb\":" + String(pkt.temp_amb, 2) + "}";

  int len = json.length();

  Serial.println("\n===== HTTP SEND =====");
  Serial.println(json);
  Serial.print("LEN: ");
  Serial.println(len);

  sendAT("AT+HTTPINIT", 500);
  sendAT("AT+HTTPPARA=\"URL\",\"" SERVER_URL "\"", 500);
  sendAT("AT+HTTPPARA=\"CONTENT\",\"application/json\"", 300);

  sendAT("AT+HTTPDATA=" + String(len) + ",5000", 800);
  sim7600.print(json);
  delay(1200);

  sendAT("AT+HTTPACTION=1", 6000);
  sendAT("AT+HTTPTERM", 300);
}

/* ================= SETUP ================= */
void setup() {
  Serial.begin(115200);
  delay(1200);

  Serial.println("\n=== GATEWAY ESP32-S3 START ===");

  /* -------- ESP-NOW WIFI INIT -------- */
  WiFi.mode(WIFI_STA);
  WiFi.disconnect(true);
  delay(200);

  wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
  esp_wifi_init(&cfg);
  esp_wifi_set_storage(WIFI_STORAGE_RAM);
  esp_wifi_set_mode(WIFI_MODE_STA);
  esp_wifi_start();
  delay(300);

  esp_wifi_set_channel(WIFI_CHANNEL, WIFI_SECOND_CHAN_NONE);
  delay(200);

  uint8_t mac[6];
  esp_wifi_get_mac(WIFI_IF_STA, mac);
  Serial.printf("📡 Gateway MAC: %02X:%02X:%02X:%02X:%02X:%02X\n",
                mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);

  if (esp_now_init() != ESP_OK) {
    Serial.println("❌ ESP-NOW INIT FAIL");
    while (1);
  }

  esp_now_register_recv_cb(onReceive);
  Serial.println("✅ ESP-NOW READY");

  /* -------- SIM7600 INIT -------- */
  sim7600.begin(SIM_BAUD, SERIAL_8N1, 18, 17);
  delay(1000);

  sendAT("AT");
  sendAT("ATE0");
  sendAT("AT+CPIN?");
  sendAT("AT+CSQ");
  sendAT("AT+NETOPEN", 5000);
  sendAT("AT+IPADDR");
}

/* ================= LOOP ================= */
void loop() {
  if (newData) {
    newData = false;
    httpPost(lastPacket);
  }

  while (sim7600.available()) {
    Serial.write(sim7600.read());
  }
}
