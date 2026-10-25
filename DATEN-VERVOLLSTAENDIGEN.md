# Daten vervollständigen

Der neue Menüpunkt `#/complete` ist ein lokales Recherchebuch innerhalb der vorhandenen MW4-Oberfläche. Es benötigt keinen Server, Account oder API-Schlüssel. Es recherchiert keine fehlenden Werte an deiner Stelle.

## Arbeitsablauf

1. Waffe, Slot und Datenstatus wählen; mit der Suche einen Aufsatz finden. „Fortschritt aller Waffen“ zeigt auch Waffen ohne Aufsatzslots.
2. Den Aufsatz öffnen. Vorhandene Angaben, Einheiten, Quellen und Mehrdeutigkeiten stehen über dem Editor. Google-, Reddit- und Datenbank-Suchlinks enthalten Waffe und Aufsatznamen.
3. Fehlende Messfelder ergänzen. Vorhandene Angaben lassen sich ausdrücklich als lokale Bearbeitung übernehmen. Der Originalbestand bleibt erhalten. „Keine Änderung“ nur mit Beleg als absolute Änderung `0` eintragen; eine leere Eingabe ist unbekannt.
4. Quelle oder genaue eigene Messmethode, Datum, Status und Testbedingungen je Feld angeben. „Mit zweiter Quelle abgeglichen“ benötigt eine zweite unterschiedliche Quelle. Auch dieser Status bleibt eine lokale Benutzerangabe und wird nicht automatisch zu unabhängig verifizierten Spieldaten.
5. Optional Vorher-/Nachher-Screenshots hinzufügen. PNG, JPEG und WebP bis 10 MB / 32 Megapixel werden nur in einer separaten IndexedDB gespeichert. Das Original lässt sich lokal herunterladen. Ein erneuter Upload ersetzt ausschließlich das Bild derselben Vorher-/Nachher-Zuordnung.
6. „OCR starten“ lädt selbst gehostete Tesseract.js-Software und deutsche/englische Sprachmodelle. Die Erkennung läuft im Browser, ohne Bild-Upload an einen Erkennungsdienst. Erkannter Text bleibt sichtbar und korrigierbar. Vorschläge müssen einzeln bestätigt werden. Falsche oder fehlende Einheiten verhindern die Übernahme. Bei Fehlern sind manuelle Zahlen und das Einfügen von OCR-Text möglich. OCR-Sicherheit ist keine Spielwert-Verifizierung.
7. Die Vorher-/Nachher-Rechnung zeigt absolute Differenz, Prozentänderung und Faktor. Beispiel 300/270 ms: −30 ms, −10 %, Faktor 0,9. Daraus wird kein Stapelmodell abgeleitet. „Unbekannt“, absolute Änderung, Prozentänderung, Multiplikator oder absoluter Endwert selbst auswählen. Bei Basis `0` bleiben Prozent und Faktor undefiniert.
8. Abweichungen von Quellen und Basiswerten ausdrücklich nur für die lokale Rechnung bestätigen. „Vorher-Messung als lokale Rechenbasis verwenden“ ist eine separate Option. Widersprüchliche lokale Basis-Messungen werden gesperrt statt gemittelt.
9. „Lokal speichern“ oder „Speichern & nächster Aufsatz“ wählen. Die bestätigten Einzeleffekte stehen direkt im Gunsmith als Teilrechnung bereit. Lokale Werte schließen keine unbekannten Stapel- oder Schadensmodelle.

## Abdeckung und Checkliste

Die elf Pflicht-Messfelder entsprechen dem Ausgangsbericht `mw4-aufsatz-pruefbericht.csv`: ADS-Zeit, Sprint-to-Fire, horizontaler und vertikaler ADS-Rückstoß, Gun Kick, Reichweite, Geschossgeschwindigkeit, Bewegung, Hüftfeuerstreuung, Magazin und Nachladezeit. Weitere vorhandene Datenbank-Metriken lassen sich ergänzen; sonstige qualitative Effekte haben ein eigenes Notizfeld.

Die CSV wurde mit Originaldatei-Hash in `public/data/research-audit.json` abgebildet. Aufsatz-IDs und alle 1.629 Zuordnungen werden geprüft. Die Arbeitsliste berechnet ihre Lücken aus dem jeweils aktuellen Datenbestand plus lokalen Ergänzungen neu. Die CSV zählt veröffentlichte numerische Angaben; die Arbeitsliste zählt eindeutig auswertbare Operationen. Deshalb sind die Zahlen nicht identisch. Nicht erwähnte Werte werden weder als `0` noch als „unverändert“ behandelt.

„Messfelder dokumentiert“ ist Dokumentationsfortschritt, keine vollständige wissenschaftliche oder offizielle Verifizierung. Die zusätzliche Bestätigung sonstiger Effekte setzt eine Notiz mit Beleg voraus. Checklisten-Häkchen allein schließen keine Lücken. Konflikte und gesperrte Slot-Zuordnungen bleiben erkennbar. Veraltete lokale Messungen müssen ausdrücklich für den aktuellen Patch erneut geprüft werden.

## Optimizer und Gunsmith

Der vorhandene verifizierte Optimizer bleibt streng. Im Optimizer kann „Eigene Messwerte vergleichen“ eingeschaltet werden. Dieser Modus wertet eigene Effekte und Prioritäten direkt aus, vergleicht aber einzelne Aufsätze, solange Kombinationsregeln fehlen. Ein Score wird nur angezeigt, wenn **alle** gewichteten Zielwerte und Basiswerte berechenbar sind. Fehlende Ziele werden nicht umgewichtet. Es gibt keine erfundene TTK und kein unbelegtes optimales Gesamt-Build.

Gunsmith-Statistiken markieren lokale Ergänzungen und Teilrechnungen. Für jeden ausgewählten Aufsatz werden die noch fehlenden Einzelwirkungen aufgelistet. Offizielle Modifier, Verfügbarkeiten, Apex- und Slotregeln werden durch manuelle Eingaben nicht erweitert. Quellen und eigene Messungen werden nicht stillschweigend zusammengerechnet.

## Speichern, Export und Repository

Recherchewerte werden ausschließlich unter `mw4-local-research-v1` in localStorage gespeichert, Bilder ausschließlich in `mw4-research-media-v1`. Camo-Fortschritt, Favoriten und gespeicherte Builds verwenden weiterhin ihre bisherigen Speicher. Speicherfehler werden gemeldet. Ein Import validiert zuerst die ganze Datei, erkennt doppelte IDs/Messfelder und lässt bestehende lokale Einträge standardmäßig unverändert. Ein einzelner Schreibvorgang übernimmt die validierten Werte. Ein Wiederherstellungsimport muss ausdrücklich bestätigt werden. Änderungen in anderen Tabs verhindern ein stilles Überschreiben.

„Recherche-JSON exportieren“ exportiert gespeicherte Messwerte, Quellen und Checklisten; Screenshot-Bilder sind **nicht** enthalten. Originalbilder separat herunterladen. Auch unsichere/veraltete Einträge bleiben im Export erhalten; fremde IDs und alte Patches werden im Browser nicht aktiv gerechnet. Regelmäßig exportieren, da Browserdaten gelöscht werden können. Es erfolgt keine automatische Veröffentlichung oder Übermittlung an GitHub.

So werden die Werte bewusst in das Repository übernommen:

```sh
node scripts/import-research.mjs /pfad/mw4-recherche.json
node scripts/import-research.mjs /pfad/mw4-recherche.json --apply
# Bestehende Repository-Einträge erst nach Diff-Prüfung ersetzen:
node scripts/import-research.mjs /pfad/mw4-recherche.json --apply --replace
npm test
npm run validate
npm run build
git diff -- public/data/manual-research.json
```

Der erste Aufruf prüft nur. `--apply` schreibt atomar ausschließlich `public/data/manual-research.json`. Unbekannte Waffen-/Aufsatz-Zuordnungen und alte Patchstände werden beim Repository-Import abgelehnt. Doppelte bestehende Einträge benötigen ausdrücklich `--replace`. Die Datei anschließend in einem Pull Request prüfen; nach dem Merge veröffentlicht GitHub Pages die bewusst beigetragenen Daten. Der Browser kennzeichnet diese Quellen als „REPOSITORY · manuell beigetragen“. Auch das macht sie nicht automatisch offiziell oder unabhängig verifiziert. Die täglichen Quellenupdates ändern diese Datei und persönliche Browserdaten nicht.

CSV-Baseline bei einem ausdrücklich aktualisierten Prüfbericht neu erzeugen:

```sh
node scripts/prepare-research-audit.mjs /pfad/mw4-aufsatz-pruefbericht.csv
```

## Technische Grundlagen

Statische ES-Module ohne neue Backend-Abhängigkeit. Tesseract.js 6.0.1, Core 6.1.2 und Sprachdateien werden beim Build aus gesperrten npm-Abhängigkeiten nach `public/vendor/ocr` kopiert. OCR lädt keine fremden Laufzeit-CDNs. Dokumentation: [Tesseract.js API](https://github.com/naptha/tesseract.js/blob/master/docs/api.md), [lokale Bereitstellung](https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md). Die Software- und Modelllizenzen werden mit ausgeliefert.
