/* ===========================================================================
 *  SMART · LAKE TWIN — GATEWAY  (Heltec WiFi LoRa 32 V3 / V4, SX1262)
 *  ---------------------------------------------------------------------------
 *  Receives LoRa packets from the sensor nodes and forwards each reading to
 *  Supabase via the PostgREST endpoint over WiFi (HTTPS POST).
 *
 *  Packet in :  NODEID,waterT,airT,hum,level,batt
 *  POST out  :  {url}/rest/v1/sensor_readings   (JSON)
 *
 *  SECURITY NOTE
 *  -------------
 *  Inserting into sensor_readings requires a key. Two options:
 *   (1) Prototype: put the Supabase SERVICE ROLE key on this gateway (it is a
 *       physically controlled device). Simple, but the key is powerful — keep
 *       the device secure and rotate the key if it is ever exposed.
 *   (2) Recommended for production: deploy a Supabase Edge Function `ingest`
 *       that checks a per-device shared secret and inserts with service role.
 *       Then store only that device secret here. (See setup guide.)
 *
 *  Board/library: same as the node ("Heltec ESP32 Dev-Boards").
 * =========================================================================== */

#include "LoRaWan_APP.h"
#include "Arduino.h"
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>

// ---- WiFi ------------------------------------------------------------------
const char* WIFI_SSID = "YOUR_WIFI";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";

// ---- Supabase --------------------------------------------------------------
const char* SUPABASE_URL = "https://YOUR-PROJECT.supabase.co";
// Option (1): service role key (keep the device secure!). Option (2): device secret to your Edge Function.
const char* SUPABASE_KEY = "PASTE_SERVICE_ROLE_KEY";
const char* INGEST_PATH  = "/rest/v1/sensor_readings";

// ---- LoRa (MUST match the node) -------------------------------------------
#define RF_FREQUENCY        915000000
#define LORA_BANDWIDTH      0
#define LORA_SPREADING_FACTOR 9
#define LORA_CODINGRATE     1
#define LORA_PREAMBLE_LENGTH 8
#define LORA_SYMBOL_TIMEOUT 0
#define LORA_FIX_LENGTH_PAYLOAD_ON false
#define LORA_IQ_INVERSION_ON false
#define RX_BUFFER_SIZE 256

static RadioEvents_t RadioEvents;
char rxpacket[RX_BUFFER_SIZE];

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("WiFi");
  uint32_t t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 15000) { delay(300); Serial.print("."); }
  Serial.println(WiFi.status() == WL_CONNECTED ? " connected" : " FAILED");
}

// parse "NODEID,wt,at,h,lv,bt" -> JSON, POST to Supabase
void forward(const char* csv, int rssi) {
  char id[16]; float wt, at, h, lv, bt;
  if (sscanf(csv, "%15[^,],%f,%f,%f,%f,%f", id, &wt, &at, &h, &lv, &bt) != 6) {
    Serial.printf("bad packet: %s\n", csv); return;
  }
  connectWiFi();
  if (WiFi.status() != WL_CONNECTED) return;

  char body[256];
  snprintf(body, sizeof(body),
    "{\"station\":\"%s\",\"water_temp\":%.2f,\"air_temp\":%.2f,\"humidity\":%.0f,"
    "\"water_level\":%.2f,\"battery\":%.2f,\"rssi\":%d}",
    id, wt, at, h, lv, bt, rssi);

  WiFiClientSecure client; client.setInsecure();   // for prototype; pin cert in production
  HTTPClient https;
  String url = String(SUPABASE_URL) + INGEST_PATH;
  https.begin(client, url);
  https.addHeader("Content-Type", "application/json");
  https.addHeader("apikey", SUPABASE_KEY);
  https.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
  https.addHeader("Prefer", "return=minimal");
  int code = https.POST((uint8_t*)body, strlen(body));
  Serial.printf("POST %s -> %d\n", id, code);
  https.end();
}

void onRxDone(uint8_t* payload, uint16_t size, int16_t rssi, int8_t snr) {
  uint16_t n = size < RX_BUFFER_SIZE - 1 ? size : RX_BUFFER_SIZE - 1;
  memcpy(rxpacket, payload, n); rxpacket[n] = 0;
  Serial.printf("RX (%d dBm): %s\n", rssi, rxpacket);
  forward(rxpacket, rssi);
  Radio.Rx(0);   // back to continuous receive
}

void setup() {
  Serial.begin(115200);
  Mcu.begin(HELTEC_BOARD, SLOW_CLK_TPYE);
  connectWiFi();

  RadioEvents.RxDone = onRxDone;
  Radio.Init(&RadioEvents);
  Radio.SetChannel(RF_FREQUENCY);
  Radio.SetRxConfig(MODEM_LORA, LORA_BANDWIDTH, LORA_SPREADING_FACTOR,
                    LORA_CODINGRATE, 0, LORA_PREAMBLE_LENGTH,
                    LORA_SYMBOL_TIMEOUT, LORA_FIX_LENGTH_PAYLOAD_ON,
                    0, true, 0, 0, LORA_IQ_INVERSION_ON, true);
  Radio.Rx(0);
  Serial.println("[gateway] listening for LoRa packets");
}

void loop() {
  Radio.IrqProcess();
}
