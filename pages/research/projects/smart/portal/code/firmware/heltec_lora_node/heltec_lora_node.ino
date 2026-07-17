/* ===========================================================================
 *  SMART · LAKE TWIN — Sensor NODE  (Heltec WiFi LoRa 32 V3 / V4, SX1262)
 *  ---------------------------------------------------------------------------
 *  Reads reservoir sensors and transmits a compact CSV packet over LoRa (P2P)
 *  to the gateway node, which forwards it to Supabase over WiFi.
 *
 *  Sensors (edit pins/types to your build):
 *    - Water temperature : DS18B20 (OneWire)         -> GPIO 7
 *    - Air temp/humidity : AHT20 / DHT22 (I2C/1-wire) -> I2C SDA/SCL
 *    - Water level       : pressure or ultrasonic     -> analog / GPIO
 *
 *  Board package : "Heltec ESP32 Series Dev-boards" (v3.x)
 *  Library       : "Heltec ESP32 Dev-Boards" (provides LoRaWan_APP / Radio)
 *  Select board  : Tools -> Board -> Heltec WiFi LoRa 32(V3)
 *
 *  Packet format (CSV):  NODEID,waterT,airT,hum,level,batt
 *  e.g.                  PS-01,18.42,15.30,78,4.62,3.81
 * =========================================================================== */

#include "LoRaWan_APP.h"      // Heltec V3 LoRa P2P API (Radio.*)
#include "Arduino.h"
#include <OneWire.h>
#include <DallasTemperature.h>
// #include <Adafruit_AHTX0.h>   // uncomment if using AHT20

// ---- LoRa radio parameters (MUST match the gateway) ------------------------
#define RF_FREQUENCY        915000000  // Hz — use 915E6 (AU/BR) or 868E6 (EU). Check local regs!
#define TX_OUTPUT_POWER     14         // dBm
#define LORA_BANDWIDTH      0          // 0:125kHz
#define LORA_SPREADING_FACTOR 9        // SF7..SF12 (higher = longer range, slower)
#define LORA_CODINGRATE     1          // 1:4/5
#define LORA_PREAMBLE_LENGTH 8
#define LORA_SYMBOL_TIMEOUT 0
#define LORA_FIX_LENGTH_PAYLOAD_ON false
#define LORA_IQ_INVERSION_ON false

// ---- identity & timing -----------------------------------------------------
const char* NODE_ID = "PS-01";
const uint32_t SEND_PERIOD_MS = 60000UL;   // send every 60 s (raise to save power)

// ---- sensors ---------------------------------------------------------------
#define ONE_WIRE_PIN 7
OneWire oneWire(ONE_WIRE_PIN);
DallasTemperature waterSensor(&oneWire);
// Adafruit_AHTX0 aht;

static RadioEvents_t RadioEvents;
char txpacket[128];
uint32_t lastSend = 0;

float readWaterTemp() {
  waterSensor.requestTemperatures();
  float t = waterSensor.getTempCByIndex(0);
  return (t < -50 || t > 80) ? NAN : t;
}
float readAirTemp()  { /* return aht.temperature; */ return 15.0 + random(-50,50)/10.0; }
float readHumidity() { /* return aht.humidity;    */ return 75.0 + random(-100,100)/10.0; }
float readLevel()    { /* map(analogRead(pin),...) */ return 4.60 + random(-20,20)/100.0; }
float readBattery()  { /* voltage divider on VBAT  */ return 3.70 + random(0,20)/100.0; }

void onTxDone()    { Radio.Sleep(); }
void onTxTimeout() { Radio.Sleep(); }

void setup() {
  Serial.begin(115200);
  Mcu.begin(HELTEC_BOARD, SLOW_CLK_TPYE);   // Heltec V3 init
  waterSensor.begin();
  // aht.begin();

  RadioEvents.TxDone = onTxDone;
  RadioEvents.TxTimeout = onTxTimeout;
  Radio.Init(&RadioEvents);
  Radio.SetChannel(RF_FREQUENCY);
  Radio.SetTxConfig(MODEM_LORA, TX_OUTPUT_POWER, 0, LORA_BANDWIDTH,
                    LORA_SPREADING_FACTOR, LORA_CODINGRATE,
                    LORA_PREAMBLE_LENGTH, LORA_FIX_LENGTH_PAYLOAD_ON,
                    true, 0, 0, LORA_IQ_INVERSION_ON, 3000);
  Serial.printf("[%s] node ready\n", NODE_ID);
}

void loop() {
  if (millis() - lastSend >= SEND_PERIOD_MS) {
    lastSend = millis();
    float wt = readWaterTemp(), at = readAirTemp(), h = readHumidity(),
          lv = readLevel(), bt = readBattery();
    snprintf(txpacket, sizeof(txpacket), "%s,%.2f,%.2f,%.0f,%.2f,%.2f",
             NODE_ID, wt, at, h, lv, bt);
    Serial.printf("TX: %s\n", txpacket);
    Radio.Send((uint8_t*)txpacket, strlen(txpacket));
  }
  Radio.IrqProcess();
}
