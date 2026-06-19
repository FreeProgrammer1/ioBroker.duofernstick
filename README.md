# ioBroker Adapter: DuoFern Stick

Adapter zur Anbindung des **Rademacher DuoFern USB-Sticks** an ioBroker.

Mit diesem Adapter können DuoFern-Geräte über den lokalen USB-Stick in ioBroker eingebunden, automatisch erkannt, ausgewertet und – je nach Gerätetyp – gesteuert werden. Der Adapter ist für Installationen gedacht, bei denen DuoFern-Geräte direkt ohne zusätzliche Cloud-Anbindung in ioBroker genutzt werden sollen.

## Funktionsumfang

- Verbindung zum Rademacher DuoFern USB-Stick über eine serielle Schnittstelle
- Konfiguration von seriellem Port, Baudrate und Dongle-Serial über die ioBroker-Admin-Oberfläche
- Empfang und Verarbeitung von DuoFern-Telegrammen
- automatische Anlage erkannter DuoFern-Geräte unter `devices.*`
- Statusauswertung für viele DuoFern-Gerätetypen
- Steuer-States für Auf, Ab, Stopp, Position, Automatikfunktionen und weitere Gerätefunktionen
- zentrale Control-States für Pairing, Unpairing, Statusabfrage und Rohtelegramme
- persistente Statusverarbeitung: eingehende Telegramme werden als Teil-Updates verarbeitet
- fehlende Werte aus unvollständigen Telegrammen überschreiben vorhandene ioBroker-Werte nicht automatisch
- Schutz gegen fehlerhafte Rücksetzung von `runningTime` auf `0`
- optionales Logging von Rohtelegrammen zur Fehlersuche

## Unterstützte Geräteklassen

Der Adapter enthält einen Geräte- und Fähigkeitenkatalog für viele DuoFern-Geräteklassen, unter anderem:

| Geräteklasse | Beispiele |
|---|---|
| Rollläden / Gurtwickler | RolloTron Standard, RolloTron Comfort Master/Slave |
| Rohrmotoren | Rohrmotor, Rohrmotor-Aktor, Rohrmotor-Steuerung |
| Jalousien / Raffstores | Troll Comfort, Troll Basis, Connect-Aktor |
| Aktoren | Universalaktor, Steckdosenaktor, Licht-/Schaltaktoren |
| Dimmer | Dimmaktor, Dimmer |
| Sensoren | Sonnen-/Windsensor, Umweltsensor, Bewegungsmelder, Rauchmelder, Fenster-Tür-Kontakt |
| Fernbedienungen / Sender | Handsender, Wandtaster, HomeTimer, Funksender UP |
| Heizung / Thermostat | Raumthermostat, Heizkörperantrieb |
| Tor / Spezialgeräte | SX5 / Torsteuerung |

Je nach Gerätetyp werden nur die passenden bzw. beobachteten States angelegt. Dadurch erscheinen nicht unnötig alle theoretischen Datenpunkte bei jedem Gerät.

## Voraussetzungen

- ioBroker mit aktuellem js-controller
- Node.js 18 oder neuer
- ioBroker Admin 6 oder neuer
- Rademacher DuoFern USB-Stick
- Zugriff auf die serielle Schnittstelle des USB-Sticks

Unter Linux muss der ioBroker-Prozess Zugriff auf das serielle Gerät haben. Häufige Pfade sind zum Beispiel:

```text
/dev/ttyUSB0
/dev/serial/by-id/usb-Rademacher_DuoFern_USB-Stick-if00-port0
```

Der stabile Pfad unter `/dev/serial/by-id/` ist zu empfehlen, weil er auch nach einem Neustart oder erneutem Einstecken des USB-Sticks gleich bleibt.

## Installation

### Installation über ioBroker Admin

1. Adapterpaket hochladen oder über die benutzerdefinierte Installation einbinden.
2. Adapterinstanz `duofernstick.0` anlegen.
3. Seriellen Port in der Adapterkonfiguration eintragen.
4. Adapter starten.
5. Verbindung unter `duofernstick.0.info.connection` prüfen.

### Installation über die Konsole

Beispiel für eine lokale Installation aus einer TGZ-Datei:

```bash
cd /opt/iobroker
npm install /pfad/zur/iobroker.duofernstick-0.1.21.tgz
iobroker add duofernstick
```

Danach die Adapterkonfiguration im ioBroker Admin öffnen und den korrekten seriellen Port eintragen.

## Konfiguration

Die wichtigsten Einstellungen befinden sich in der Admin-Oberfläche der Adapterinstanz.

| Einstellung | Beschreibung |
|---|---|
| `serialPort` | Serieller Port des DuoFern USB-Sticks |
| `baudRate` | Baudrate, Standard: `115200` |
| `dongleSerial` | Serial des DuoFern-Sticks, beginnt üblicherweise mit `6F` |
| `autoCreateDevices` | erkannte Geräte automatisch anlegen |
| `statusOnStart` | beim Adapterstart Statusabfrage auslösen |
| `preserveUnknownValues` | vorhandene Werte bei unvollständigen Telegrammen erhalten |
| `createOnlySupportedStates` | nur passende bzw. beobachtete States pro Gerät anlegen |
| `debugRaw` | Rohtelegramme im Log ausgeben |

## Objektstruktur

Nach dem Start legt der Adapter folgende Hauptbereiche an:

```text
duofernstick.0
├── info
│   ├── connection
│   ├── lastRawTelegram
│   └── lastError
├── control
│   ├── pair
│   ├── unpair
│   ├── statusBroadcast
│   └── raw
└── devices
    └── <deviceId>
        ├── serial
        ├── deviceType
        ├── deviceTypeName
        ├── lastSeen
        ├── rawTelegram
        ├── command
        ├── getStatus
        ├── up
        ├── down
        ├── stop
        ├── position
        └── ...
```

Die genaue Anzahl der States hängt vom erkannten Gerätetyp ab.

## Zentrale Steuerung

### Pairing starten

```text
duofernstick.0.control.pair = true
```

Startet den Pairing-Modus des Sticks.

### Unpairing starten

```text
duofernstick.0.control.unpair = true
```

Startet den Unpairing-Modus des Sticks.

### Statusabfrage senden

```text
duofernstick.0.control.statusBroadcast = true
```

Fordert eine Statusmeldung der bekannten bzw. erreichbaren Geräte an.

### Rohtelegramm senden

```text
duofernstick.0.control.raw = <HEX-TELEGRAMM>
```

Sendet ein Rohtelegramm als Hex-Wert über den Stick. Diese Funktion ist vor allem zur Fehlersuche und für Tests gedacht.

## Gerätesteuerung

Je nach Gerätetyp können folgende States vorhanden sein:

| State | Bedeutung |
|---|---|
| `up` | fährt Rollladen/Jalousie hoch |
| `down` | fährt Rollladen/Jalousie runter |
| `stop` | stoppt die aktuelle Bewegung |
| `toggle` | Umschaltbefehl |
| `position` | Zielposition in Prozent |
| `getStatus` | Status des Gerätes abfragen |
| `manualMode` | manueller Modus |
| `timeAutomatic` | Zeitautomatik |
| `sunAutomatic` | Sonnenautomatik |
| `duskAutomatic` | Dämmerungsautomatik |
| `dawnAutomatic` | Morgenautomatik |
| `windAutomatic` | Windautomatik |
| `rainAutomatic` | Regenautomatik |
| `level` | Dimm-/Schaltlevel |
| `state` | Schaltzustand |

Beispiel:

```text
duofernstick.0.devices.<deviceId>.up = true
duofernstick.0.devices.<deviceId>.down = true
duofernstick.0.devices.<deviceId>.stop = true
duofernstick.0.devices.<deviceId>.position = 50
```

## Statuswerte

Typische Statuswerte sind:

| State | Beschreibung |
|---|---|
| `position` | aktuelle Position in Prozent |
| `moving` | Gerät bewegt sich |
| `direction` | Bewegungsrichtung `up`, `down`, `stop` oder `unknown` |
| `runningTime` | Laufzeit in Sekunden |
| `lastSeen` | Zeitpunkt des letzten empfangenen Telegramms |
| `rawTelegram` | letztes Telegramm dieses Gerätes |
| `deviceType` | DuoFern-Gerätetyp als Code |
| `deviceTypeName` | erkannter Gerätename |

Wichtig: Der Adapter behandelt eingehende Telegramme als Teilstatus. Wenn ein Telegramm zum Beispiel keine Laufzeit enthält, wird ein bereits vorhandener Wert nicht einfach auf `0` gesetzt.

## Fehlerbehebung

### Adapter verbindet sich nicht mit dem Stick

Prüfen:

- stimmt der serielle Port?
- existiert der Pfad unter Linux wirklich?
- hat der ioBroker-Benutzer Zugriff auf das Gerät?
- ist der USB-Stick an die richtige VM bzw. den richtigen Host durchgereicht?
- blockiert ein anderer Prozess den Port?

Hilfreiche Befehle unter Linux:

```bash
ls -l /dev/ttyUSB*
ls -l /dev/serial/by-id/
dmesg | grep -i tty
```

### Keine Geräte werden angelegt

Prüfen:

- ist `autoCreateDevices` aktiviert?
- empfängt der Adapter Rohtelegramme unter `info.lastRawTelegram`?
- ist `debugRaw` zur Analyse aktiviert?
- wurde am DuoFern-Gerät oder an einer Fernbedienung eine Aktion ausgelöst?

### Werte springen oder wirken unplausibel

Prüfen:

- ob mehrere Geräte dieselbe oder falsch erkannte ID verwenden
- ob Rohtelegramme vollständig empfangen werden
- ob der richtige Gerätetyp erkannt wurde
- ob das Gerät Statuswerte aktiv sendet oder nur beim Start einmal antwortet

Bei Tests sind `info.lastRawTelegram`, `devices.<deviceId>.rawTelegram` und das ioBroker-Log besonders wichtig.

## Hinweise zum Betrieb

Der Adapter ist für den lokalen Betrieb mit einem direkt angeschlossenen DuoFern USB-Stick vorgesehen. Da DuoFern-Geräte je nach Typ, Firmware und Telegrammformat unterschiedlich reagieren können, sollten neue Gerätetypen zunächst beobachtet und getestet werden.

Für eine Fehlersuche sind folgende Angaben hilfreich:

- Adapterversion
- ioBroker-Version
- Node.js-Version
- Betriebssystem / Docker / VM / Proxmox
- verwendeter USB-Stick-Pfad
- Gerätetyp
- relevante Rohtelegramme
- ioBroker-Logauszug beim Start und bei Geräteaktionen

## Changelog

### 0.1.21

- erweiterter Geräte- und Fähigkeitenkatalog
- automatische Geräteanlage unter `devices.*`
- Admin-Konfiguration für seriellen Port, Baudrate, Dongle-Serial und Debug-Optionen
- Verarbeitung eingehender Telegramme als Teil-Updates
- Schutz gegen ungewolltes Überschreiben fehlender Werte
- Schutz gegen Rücksetzung von `runningTime` auf `0`
- Control-States für Pairing, Unpairing, StatusBroadcast und Raw-Telegramme
- Steuer-States für Rollladen-, Aktor-, Dimmer-, Sensor- und Thermostatklassen

## Lizenz

MIT
