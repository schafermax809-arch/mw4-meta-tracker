# Gunsmith: Daten, Berechnung und Pflege

## Module

| Bereich               | Datei                                  | Verantwortung                                                                  |
| --------------------- | -------------------------------------- | ------------------------------------------------------------------------------ |
| Waffen und Aufsätze   | `public/data/gunsmith.json`            | Getrennte Listen, stabile IDs, Quellenregister, Patch, Unsicherheit, Verlauf   |
| Datenvertrag          | `public/engine/database.js`            | Strikte Felder/Einheiten, Kompatibilität, Limit, Apex, Konflikte, Abdeckung    |
| Berechnung            | `public/engine/calculator.js`          | Basis, exakte Snapshots, explizite Operationen, Interaktionen, Deltas, STK/TTK |
| Suche                 | `public/engine/optimizer.js`           | Exhaustive / Beam, sechs Zielarten, Klassengewichte, Budget, Teilabdeckung     |
| Community             | `public/engine/community.js`           | Unabhängige Quellen, Patch-/Modusfilter, Widersprüche, Testevidenz             |
| Browser-Worker        | `public/engine/optimizer-worker.js`    | Suche außerhalb des UI-Threads, abbrechbar                                     |
| Oberfläche            | `public/engine-ui.js`, `public/app.js` | Bestehender Gunsmith, Vergleich, lokale Builds, Quellen und fehlende Daten     |
| Update                | `scripts/lib/gunsmith-update.mjs`      | Quellenvergleich, Vorschläge, Verlauf und komplette Neuberechnung              |
| Öffentliche Recherche | `scripts/lib/research.mjs`             | RSS-Discovery und optional explizit erlaubte Artikel-Fingerprints              |
| Offizieller Parser    | `scripts/lib/weapon-source.mjs`        | Nur explizit beschriftete Basiswerte / Apex-Fakten                             |

Die Browser-Engine hat keine Abhängigkeit von UI, Netzwerk, localStorage oder Node. Node-Tests importieren dieselben Funktionen. Synthetische Zahlen existieren ausschließlich in `test/engine.test.mjs`, nicht in den veröffentlichten Datensätzen.

## Zusätzliche Community-Werte

public/data/community-values.json speichert öffentliche Quellenprofile getrennt von den offiziellen Angaben. scripts/lib/community-values.mjs liest beschriftete Werte und öffentlich ausgelieferte Build-Varianten, normalisiert nur eindeutige Einheiten und erzeugt bei Änderungen Vorher-/Nachher-Vorschläge. config/community-values-sources.json enthält Allowlist, Abrufabstand und die ausdrücklich berücksichtigte Patchrevision.

public/engine/community-values.js validiert die Daten und ergänzt eine Laufzeitkopie der Datenbank. Fehlende Basiswerte erhalten status reported; offizielle Basiswerte werden nicht überschrieben. Menübewertungen erhalten eigene rating-Metriken mit /100. Alle Quellenabweichungen bleiben im UI einsehbar. Aktuelle Community-Builds ergänzen Quellen und reported-Verfügbarkeit, ohne die Rohdaten der bisherigen Recherche zu ändern. Slot-, Konflikt- und Apex-Regeln gelten auch für Quellenbuilds.

Ein neuer offizieller Patch bindet Community-Werte nicht automatisch neu. Der Review muss den Quellenstand und die Patchzuordnung in der Konfiguration prüfen. calculated.json ist an den offiziellen Datenbankhash und den Hash der Community-Profile gebunden. Der tägliche PR enthält alle zusammengehörigen Dateien; ein fehlgeschlagener Abruf verhindert die Veröffentlichung eines Teilbestands.

## Stat-Vertrag

Der freigegebene vollständige Aufsatzimport liegt in public/data/attachment-catalog.json: 686 globale Aufsatzdatensätze, die veröffentlichten Listen aller 33 Waffen und 41 Multiplayer-Builds. scripts/lib/attachment-catalog.mjs parst nur öffentlich dargestellte HTML-Listen, vergleicht sämtliche angekündigten Zeilen-/Slot-Zähler und bricht bei Lücken ab. Es führt keine fremden Skripte aus und verwendet keine privaten Endpunkte. config/attachment-catalog-source.json hält die vom Nutzer bestätigte Freigabe, Allowlist, Abrufabstand und Patchzuordnung fest.

public/engine/attachment-catalog.js ergänzt die Laufzeitkopie nach den Community-Werten. Vorhandene Aufsatz-IDs bleiben erhalten; zusätzliche historische Namen können im Slotdialog eingeblendet werden. Neue Einträge werden als reported geführt. Die veröffentlichte Freischaltwaffe wird nicht als universelle Kompatibilität interpretiert. Aktive Auswahl und Builds verwenden die explizite Waffenliste bzw. den veröffentlichten Build; bekannte Apex-Blockaden bleiben wirksam. Numerische Effekte werden bei fehlenden Messwerten nicht erfunden. Der neue interne Katalog unter Intel bietet Suche und Slotfilter über alle Einträge. Entsprechend dem Nutzerwunsch gibt es im Waffenmenü keine gesonderte Anzeige der Datenquelle; Metadaten und Herkunft bleiben für Pflege und Updates im Datensatz.

Der tägliche Workflow prüft diesen Katalog zusätzlich und übernimmt Änderungen erst über einen Review-PR. calculated.json ist jetzt außerdem an attachmentCatalogHash gebunden. Unveränderte Inhalte erzeugen keinen Commit und keinen neuen Datumsstempel; Fehler erhalten den veröffentlichten Stand und den persönlichen Fortschritt.

Ein Basiswert hat `value`, `unit`, `sourceIds`, `patchRevision`, `status`. Ein Modifikator hat `stat`, `operation`, `value`, `unit`, `order`, `sourceIds`, `patchRevision`.

- `add`: absolute Änderung in der Einheit des Werts, etwa ms.
- `multiply`: dimensionsloser Faktor. Prozentangaben müssen vorab eindeutig in diesen Faktor überführt werden. Ein Minus bei „ADS Speed“ wird ohne Klärung, ob die Quelle Zeit oder Geschwindigkeit meint, nicht übernommen.
- `set`: ersetzt den Wert absolut, etwa Magazinkapazität 1 Schuss.
- `order`: ausdrücklich verifizierte Reihenfolge. Zwei Operationen für denselben Wert mit derselben Reihenfolge sind mehrdeutig und werden nicht berechnet.
- `pros`, `cons`, `special`: qualitative Aussagen; keine erfundenen numerischen Gewichte daraus.

Die Engine erlaubt keine pauschale Addition veröffentlichter Prozentwerte. Eine Konfiguration ist nur berechenbar, wenn die vollständigen Effekte jedes gewählten Aufsatzes und die Kombinationsregeln der Waffe geprüft sind. Andernfalls bleiben aktuelle Werte unbekannt; die bekannten Basiswerte bleiben sichtbar. Ein exakter, patchaktueller Snapshot kann eine konkrete Kombination belegen, ohne eine allgemeine Stapelregel zu erfinden. Interaktionen werden nur bei vollständiger Übereinstimmung ihrer Aufsatz-IDs angewendet. Widersprüchliche Reihenfolgen, veraltete Quellen und negative/ungültige Ergebnisse werden nicht als Werte ausgegeben.

## TTK und STK

Ein Schadensprofil enthält aufeinanderfolgende Intervalle `[from,to)` in Metern, das letzte mit `to:null`, und numerische Körperzonenschäden. `fireModel` muss Schussfolge und Vorlaufzeit für den Patch belegen. Zielgesundheit und Entfernung werden nicht vorausgefüllt; die UI verlangt ein ausdrücklich bestätigtes Vergleichsszenario.

Für konstante Schussintervalle: `STK = ceil(HP / Körperzonenschaden)` und `TTK = Vorlaufzeit + (STK - 1) * 60000 / RPM`. Das ist theoretische Treffer-TTK ohne Fehlschüsse, Flugzeit, Panzerung oder Regeneration. Semiautomatik bedeutet theoretische maximale Schussfolge. Burst-, Pellet-, Nahkampf- und modifizierte Schadensprofile werden bis zu einer eigenen verifizierten Modellierung abgelehnt. Zusätzlich gibt es ein ausdrücklich als Community-Szenario gekennzeichnetes TTK/STK-Werkzeug im Quellenpanel. Es nutzt die numerischen Intervalle und RPM derselben Quelle, frei wählbare Zielgesundheit und Head/Body. Die veröffentlichten endlichen Distanzfenster werden nicht extrapoliert; Burst-/unbekannte Schussfolgen werden abgelehnt. Das Ergebnis ist eine theoretische Quellenrechnung ohne Aufsätze, keine unabhängig gemessene Spiel-TTK.

## Optimierung

`optimize(db, weaponId, {goal, weights, patch, context, allowApex})` bewertet relative Änderungen zur Basis anhand der vom Nutzer festgelegten Gewichte. Zeiten und Streuung werden minimiert, Reichweite/Kapazität/Mobilität maximiert. Klassengewichte sind offen dokumentierte Präferenzen, keine angeblich gemessenen Balance-Fakten.

Jeder Slot hat auch die Option „leer“. Fünf Standardaufsätze sind von einem separaten Apex getrennt. Die Suche kontrolliert Waffen-/Slot-Kompatibilität, Verfügbarkeit, Patch, Konflikte und blockierte Slots. Bis zu 100.000 theoretischen Slot-Kombinationen wird vollständig gesucht; darüber eine deterministische Beam-Suche mit Breite 160 und maximal 200.000 Bewertungen. Grenzen sind API-Parameter mit Sicherheitsobergrenzen.

`optimal` wird nur bei vollständiger Exhaustive-Suche, lückenlosem Katalog, verifizierter Kompatibilität/Stat-Mathematik, geklärter Verfügbarkeit und ohne unbekannte Kombination vergeben. `partial` nennt konkrete Lücken, untersuchte Kombinationen und das Suchbudget. Beam-Ergebnisse garantieren kein globales Optimum. `source-based` liefert bei unvollständiger Mathematik einen aktuellen Quellenbuild, gerankt nach passendem veröffentlichtem Einsatzzweck und unabhängigen Herkunftsgruppen. Numerische Slider werden in diesem Modus ausdrücklich nicht ausgewertet. Ohne passende Quellen bleibt `unavailable` mit den fehlenden Voraussetzungen. Fehlende gewichtete Werte werden nicht entfernt oder auf andere Gewichte verteilt. Longshot erfordert zusätzlich die belegte Distanz der jeweiligen Klasse.

Community zählt eine unabhängige Herkunft nur einmal; verbundene Websites/Syndizierung sind kein zweiter Beleg. Die Evidenz ist bei einer Quelle gering, bei zwei unabhängigen Quellen mittel und erst mit unabhängigen reproduzierbaren Tests hoch. Votes/Likes sind kein Eingangssignal. Unterschiedliche Builds bleiben sichtbar. Hybrid ist nur unter berechenbaren Kandidaten mit tatsächlicher Übereinstimmung zu einer aktuellen Community-Konfiguration möglich. Der Zusatzbonus ist maximal 0,05; Hybrid behauptet kein mathematisches Optimum.

## Geprüfte Änderungen übernehmen

Auf einem Review-Branch eine Datei mit folgenden Feldern erstellen:

```json
{
  "baseHash": "SHA-256 des aktuellen kanonischen gunsmith.json",
  "patchRevision": "aktuelle Revision aus meta.json",
  "sources": [],
  "weapons": [],
  "attachments": [],
  "community": []
}
```

In die Listen kommen vollständige, geprüfte Datensätze. IDs bleiben stabil; es gibt keine Löschoperation und keinen persönlichen Fortschritt im Format. Neue Quellen zuerst im Quellenregister mit Datum, Zugriffspolitik und Herkunftsgruppe angeben. Die kompletten Feldnamen sind im Validator definiert.

```sh
node --input-type=module -e "import {readJson} from './scripts/lib/io.mjs'; import {hash} from './scripts/lib/model.mjs'; console.log(hash(await readJson('public/data/gunsmith.json')))"
npm run apply-gunsmith-review -- --input reviews/gunsmith-approved.json
npm test
npm run validate
npm run build
```

Veralteter Basishash oder ein falscher Zielpatch wird abgelehnt. Die Freigabe schreibt komplette Vorher-/Nachher-Datensätze in die Historie und berechnet alle Ziele neu. Ein No-op verändert keine Zeitstempel. `npm run recompute` erneuert bei bewusster manueller Pflege die berechneten Dateien. Der Validator prüft den Datenbank-Fingerabdruck; veraltete Berechnungsergebnisse verhindern den Build-Workflow.

## Tägliche GitHub-Prüfung

Der bestehende Workflow bleibt täglich 05:17 UTC aktiv. Er prüft offizielle Quellen, die 32 registrierten öffentlichen Waffenprofile sowie den freigegebenen RSS-Feed, erkennt neue Waffen-/Apex-Fakten und stellt exakte geänderte Zahlen zur Prüfung. Unbekannte Zahlen oder Effekte werden nicht abgeleitet. Neue Quellenlinks und qualitative Hinweise landen in `reviews/gunsmith-pending.json`. Die bisherigen Werte behalten ihren Belegpatch; ein neuer Patch stempelt alte Messungen nicht automatisch aktuell.

Vor dem Commit werden Kernkatalog, Gunsmith-Daten, Berechnungsfingerabdruck, Tests und statischer Build geprüft. Ein Git-Commit veröffentlicht den Vorschlag als atomaren Dateisatz auf dem Review-Branch. Erst ein Merge veröffentlicht ihn mit Pages. Unveränderte Quellen erzeugen keinen Commit; identische offene Vorschläge erhalten denselben Zeitstempel. Bei einem Fehler bleibt der veröffentlichte Stand erhalten, der Actions-Lauf enthält den Fehlerbericht.

`public/data/research.json` enthält die letzte Discovery-Basis; aus dem RSS-Fenster verschwundene Einträge werden nicht als Löschung interpretiert. `public/data/calculated.json` enthält nachvollziehbare Ergebnisse bzw. konkrete Gründe für Nichtberechenbarkeit, gebunden an Datenbankhash und Patch.

Es gibt keine kostenpflichtige KI und keine Behauptung einer automatischen Reddit-Analyse. Fehlende Zugangserlaubnis wird als `manual-only` ausgewiesen. Quellen mit Sammelverbot oder HTTP-Sperre werden nicht umgangen. Die vollständige Rechercheabdeckung und offenen Daten stehen in `DATENBASIS.md` und auf der Website unter Intel → Gunsmith-Datenbasis.

Der bisherige Camo-Schlüssel `mw4-intel:camo-progress:v1` bleibt unverändert. Keine Engine- oder Update-Datei liest oder schreibt diesen Speicher. Builds und Favoriten liegen weiterhin getrennt. Bestehende Camo-Definitionen und persönliche Zähler werden durch Gunsmith-Updates nicht verändert.
