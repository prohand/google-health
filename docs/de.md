# Google Health

Diese Integration bringt Ihre **Google-Health**-Daten in Gladys: alles, was Ihr
Fitbit-Tracker, Ihre Fitbit-Waage oder Ihre Pixel Watch an Ihr Google-Konto
sendet. Schritte, Herzfrequenz, Schlaf, Gewicht und mehr werden zu Sensoren,
Dashboard-Widgets und Szenenauslösern.

Der Zugriff ist **schreibgeschützt**: Gladys kann in Ihrem Konto nichts ändern.

## Bevor Sie beginnen

Sie brauchen:

- **Gladys 5.3 oder neuer**;
- ein Google-Konto, das die **Fitbit**-App nutzt (dort liegt das
  Google-Health-Profil);
- ein kostenloses **Google-Cloud**-Projekt. Google gibt Gesundheitsdaten nur an
  eine Anwendung weiter, die Ihnen gehört: Sie legen also einmalig Ihre eigene
  „Anwendung“ an. Das dauert etwa zehn Minuten.

Die Integration spricht über das Internet mit Google (Cloud): Einen lokalen
Modus gibt es nicht.

## Schritt 1 — Ihre Google-Anwendung anlegen

1. Öffnen Sie die [Google Cloud Console](https://console.cloud.google.com/) und
   legen Sie ein Projekt an (beliebiger Name, zum Beispiel `Gladys`).
2. Öffnen Sie **APIs & Dienste → Bibliothek**, suchen Sie **Google Health API**
   und klicken Sie auf **Aktivieren**.
3. Öffnen Sie **APIs & Dienste → OAuth-Zustimmungsbildschirm**:
   - Nutzertyp **Extern**;
   - Anwendungsname und Ihre E-Mail-Adresse eintragen;
   - unter **Datenzugriff** die drei Bereiche hinzufügen, die auf
     `googlehealth.activity_and_fitness.readonly`,
     `googlehealth.health_metrics_and_measurements.readonly` und
     `googlehealth.sleep.readonly` enden;
   - unter **Zielgruppe** Ihre eigene Google-Adresse als **Testnutzer**
     eintragen.
4. Öffnen Sie **APIs & Dienste → Anmeldedaten → Anmeldedaten erstellen →
   OAuth-Client-ID**, Typ **Webanwendung**.
5. Kopieren Sie die **Client-ID** und den **Clientschlüssel**.

### Die Weiterleitungs-URI

Google leitet Sie nur an eine Adresse zurück, die Sie angegeben haben. Tragen
Sie im OAuth-Client unter **Autorisierte Weiterleitungs-URIs** die Adresse ein,
die Gladys verwendet.

Am einfachsten finden Sie sie so: Führen Sie Schritt 2 einmal aus. Antwortet
Google mit `redirect_uri_mismatch`, kopieren Sie die Adresse aus den
Fehlerdetails oder klicken Sie in Gladys auf **Verbindung testen**: Die Adresse
erscheint unter der Schaltfläche. Tragen Sie sie im OAuth-Client ein, warten
Sie eine Minute und verbinden Sie erneut.

Google akzeptiert nur eine `https://`-Adresse mit Domainnamen oder
`http://localhost`. Öffnen Sie Gladys beim Verbinden über eine solche Adresse
(Ihre Gladys-Plus-Adresse funktioniert).

## Schritt 2 — Die Integration einrichten

1. Öffnen Sie den Tab **Konfiguration** der Integration.
2. Fügen Sie die **OAuth-Client-ID** und den **OAuth-Clientschlüssel** ein und
   **speichern** Sie.
3. Klicken Sie neben **Google-Konto** auf **Verbinden**, wählen Sie Ihr Konto
   und erteilen Sie **alle** Berechtigungen. Eine nicht erteilte Berechtigung
   lässt ihre Sensoren leer.
4. Zurück in Gladys wechselt der Status auf verbunden. Öffnen Sie den Tab
   **Erkennung** und fügen Sie das Gerät **Google Health** hinzu.

Weitere Einstellungen:

- **Tägliches Schrittziel** und **Schlafziel**: für die Anzeige im Widget und
  für die Szenenauslöser.
- **Aktualisierungsintervall**: wie oft Google abgerufen wird (standardmäßig 15
  Minuten, mindestens 5 Minuten). Ihre Uhr selbst synchronisiert nur von Zeit
  zu Zeit mit dem Telefon: Ein kürzeres Intervall bringt selten frischere
  Daten.
- **Zeitzone**: zum Beispiel `Europe/Berlin`. Sie bestimmt, wann „heute“
  beginnt. Bleibt sie leer, folgt der Tag der UTC-Zeit.

## Was Sie bekommen

### Das Gerät

Ein Gerät **Google Health** mit diesen Sensoren:

| Sensor                                 | Einheit  |
| -------------------------------------- | -------- |
| Schritte heute                         | Schritte |
| Distanz heute                          | km       |
| Aktive Kalorien, Gesamtkalorien heute  | kcal     |
| Etagen heute                           | Etagen   |
| Aktivzonenminuten heute                | Minuten  |
| Herzfrequenz, Ruhepuls                 | bpm      |
| Schlaf: Dauer, tief, REM, leicht, wach | Minuten  |
| Gewicht                                | kg       |
| Körperfett, Sauerstoffsättigung (SpO2) | %        |
| Herzfrequenzvariabilität               | ms       |
| Atemfrequenz                           | pro Min. |

Ein Sensor bleibt leer, wenn Ihre Geräte ihn nicht messen. Die Tageszähler
beginnen um Mitternacht in Ihrer Zeitzone wieder bei null. Die Sensornamen sind
in Gladys englisch; Sie können sie umbenennen.

### Dashboard-Widgets

- **Gesundheit des Tages**: Schritte im Vergleich zum Ziel, Herzfrequenz,
  letzter Schlaf, Kalorien, Distanz und Gewicht, mit der Schaltfläche
  **Aktualisieren**.
- **Gesundheit über 7 Tage**: ein Balkendiagramm der letzten sieben Tage des
  gewählten Messwerts (Schritte, Distanz, Kalorien, Etagen,
  Aktivzonenminuten), mit Tagesdurchschnitt und bestem Tag.

### Szenen

Auslöser, in der Kategorie **Integrationen** des Szeneneditors:

- **Tägliches Schrittziel erreicht** — einmal pro Tag. Variablen: Schritte,
  Ziel.
- **Eine Schlafnacht wurde aufgezeichnet** — Filter: Ziel erreicht oder
  verfehlt. Variablen: Schlafzeit (Minuten und Stunden), Tief- und REM-Schlaf.
- **Eine Gewichtsmessung wurde aufgezeichnet** — Filter: höher, niedriger oder
  stabil. Variablen: Gewicht, Änderung seit der vorherigen Messung.
- **Ein Training wurde aufgezeichnet** — Variablen: Name, Typ, Dauer, Kalorien,
  Distanz.

Aktionen:

- **Google Health jetzt abrufen** — ruft das Konto sofort ab.
- **Gesundheitsübersicht des Tages abrufen** — liefert die Werte und einen
  fertigen Satz (in der gewählten Sprache) zum Versenden oder Vorlesen, zum
  Beispiel: „Heute: 8.200 Schritte (Ziel 10.000), 6,1 km, 2.150 kcal.“

Ein Auslöser feuert, wenn Google die Daten **erhält**, also nach der
Synchronisierung Ihrer Uhr und beim nächsten Abruf der Integration.

## Schaltflächen des Konfigurationsbildschirms

- **Verbindung testen** — ruft das Konto sofort ab und meldet, was gefunden
  wurde.
- **Google-Konto trennen** — vergisst das Konto und widerruft den Zugriff bei
  Google. Das Gerät und sein Verlauf bleiben in Gladys.

## Fehlerbehebung

- **`redirect_uri_mismatch`** — siehe „Die Weiterleitungs-URI“ oben.
- **„Zugriff blockiert“ oder Fehler 403 `access_denied` bei Google** — Ihre
  Adresse steht nicht bei den **Testnutzern** des Zustimmungsbildschirms.
- **Die Verbindung geht alle 7 Tage verloren** — Google lässt den Zugriff einer
  Anwendung im Status **Test** ablaufen. **Veröffentlichen** Sie die Anwendung
  auf dem Zustimmungsbildschirm (für den Eigengebrauch ist unter 100 Nutzern
  keine Überprüfung nötig; Google zeigt eine Warnung „nicht überprüfte App“,
  die Sie übergehen können).
- **„Dieses Google-Konto hat kein Google-Health-Profil (Fitbit)“** — öffnen Sie
  die Fitbit-App einmal mit diesem Google-Konto.
- **Einige Sensoren bleiben leer** — eine Berechtigung wurde nicht erteilt:
  trennen, erneut verbinden und alles erlauben. Oder Ihre Geräte messen diesen
  Wert nicht.
- **Die Werte wirken veraltet** — öffnen Sie die Fitbit-App auf dem Telefon, um
  die Synchronisierung der Uhr anzustoßen.

## Datenschutz

Ihre Gesundheitsdaten gehen von Google zu Ihrem Gladys und nirgendwohin sonst.
Die Integration kontaktiert nur `accounts.google.com`, `oauth2.googleapis.com`
und `health.googleapis.com`. Sie können den Zugriff jederzeit in Ihrem
[Google-Konto](https://myaccount.google.com/connections) widerrufen.
