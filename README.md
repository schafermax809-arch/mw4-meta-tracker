# MW4 Intel · Gunsmith, Camo-Tracker und tägliche Quellenprüfung

Statische Website für **Call of Duty: Modern Warfare 4 (2026), Multiplayer**. GitHub Pages, ohne Server und ohne kostenpflichtige APIs.

- [Website](https://schafermax809-arch.github.io/mw4-meta-tracker/)
- [GitHub Actions](https://github.com/schafermax809-arch/mw4-meta-tracker/actions)
- [Update-Vorschläge](https://github.com/schafermax809-arch/mw4-meta-tracker/pulls)
- [Recherchierte Datenbasis und Abdeckung jeder Waffe](DATENBASIS.md)
- [Engine, Datenvertrag, Berechnung und Review-Anleitung](GUNSMITH-ARCHITEKTUR.md)
- [Daten vervollständigen: eigener Werteeditor, Screenshots, lokale OCR und Repository-Import](DATEN-VERVOLLSTAENDIGEN.md)

## Was enthalten ist

Das Ingame-Menü integriert Waffenklassen, Suche/Filter, Favoriten, Tierlist, Grind Planner, Meta-/Camo-Builds und Camo-Tracking. Der Gunsmith hat META, COMMUNITY, OPTIMIZER, CAMO-BUILDS, EIGENER BUILD und VERGLEICH; Tarnungen, Herausforderungen und Tracker bleiben direkt erreichbar. Navigation per Hash ohne Seitenreload, Desktop-Tastatur, Touch-Menüs und responsive Ansichten.

Alle 33 Launch-Waffen sind erfasst. Der neue vollständige Import des freigegebenen Aufsatzdatensatzes enthält **686 Aufsatznamen**, die veröffentlichten Waffenprofile für alle 33 Waffen und **41 Multiplayer-Builds**. Die M4 hat 71 Einträge in neun Standardkategorien plus Apex. Der integrierte Aufsatzkatalog lässt sich nach Name, Freischaltwaffe und Slot durchsuchen. Das Feld „Freischaltwaffe“ ist keine pauschale Kompatibilitätszusage; die Auswahl im Gunsmith verwendet die jeweilige Waffenliste und zusätzlich belegte Builds.

Bestehende Aufsatz-IDs und gespeicherte Builds bleiben erhalten. Zusätzliche/historische Einträge lassen sich im Slotdialog einblenden. Quellenabhängige Namensvarianten bleiben getrennt, wenn ihre Gleichheit nicht eindeutig belegt ist. Die importierten Namen, Typen und Freischaltlevel sind nutzbar, auch wenn zu einem Aufsatz keine numerischen Effekte vorliegen. Fehlende Modifikatoren werden nicht als Nullwirkung ausgegeben.

Daneben enthält die Basis 161 offizielle Angaben, 328 Community-Spezifikationen, 155 Menübewertungen und 163 Kopf-/Körper-Schadensintervalle. Community-Basiswerte werden standardmäßig angezeigt und sind mit C markiert. Der Quellen-TTK-Rechner verwendet Entfernungsbänder, Trefferzone und frei wählbare Gesundheit. Der Optimizer bietet veröffentlichte Builds für passende Einsatzzwecke an, solange die Aufsatzeffekte keine numerische Suche erlauben. Eine vollständige mathematische Meta-Berechnung wird nur bei vollständigen Messwerten behauptet.

Die Herkunft bleibt in den JSON-Dateien erhalten. Gemäß aktueller Transparenz-Anforderung zeigt jeder Aufsatz Quellen, Prüfdatum und Effektstatus. Die frühere Ausblendung zusätzlicher Kataloghinweise ist damit aufgehoben. Die Freigabe für den ursprünglichen Katalog wurde vom Nutzer am 25. Oktober 2026 bestätigt.

## Berechnung und Bedienung

Der Stat-Rechner unterstützt explizite absolute Änderungen, Faktoren, gesetzte Werte, Reihenfolgen, Interaktionen und exakte Konfigurations-Snapshots. Veröffentlichte Community-Basiswerte ergänzen fehlende offizielle Zahlen. Build-Deltas benötigen vollständige Effekte und Kombinationsregeln. Das Quellenpanel berechnet zusätzlich Community-TTK/STK aus dem jeweiligen Schadensprofil, dessen RPM, Entfernung, Trefferzone und frei wählbarer Zielgesundheit. Es bleibt innerhalb des veröffentlichten Distanzfensters und verwendet keine Aufsatzeffekte. Der streng verifizierte Rechner verlangt weiterhin bestätigte Schussfolge und Gesundheitsszenario. Nicht modellierte Burst-/Pellet- oder modifizierte Schadensprofile werden abgelehnt.

Der Optimierer sucht alle gültigen Kombinationen bei überschaubarem Raum, sonst begrenzt per Beam-Suche im Web Worker. Ziele: Meta, Longshot, Headshot, Hipfire, Multikill und eigene Slider-Gewichte. Leere Slots sind erlaubt. Klassengewichte, Bewertungsformel, Suchbudget und Unsicherheiten sind offen dokumentiert. Ein vollständiges Optimum wird nur bei vollständiger Datenabdeckung behauptet. Community vergleicht unabhängige Quellen, trennt alte Patches/Modi und macht Widersprüche sichtbar; Stimmen und Likes ersetzen keine Messungen. Hybrid verlangt tatsächliche Übereinstimmung von berechenbarem Kandidat und aktueller Community-Evidenz.

Eigene und Community-Builds lassen sich übernehmen, speichern, bearbeiten, vergleichen, importieren/exportieren und per Unicode-sicherem Link teilen. Der Vergleich enthält Basiswaffe, aktuellen Entwurf, gespeicherte Builds und aktuelle Empfehlungen. Verfügbare Zahlen bekommen Vergleichsbalken und Deltas; fehlende Messwerte bleiben unbekannt.

Pfeiltasten navigieren Waffen, Enter öffnet den Gunsmith, F setzt Favoriten, / öffnet die Suche, Escape geht zurück. Q/E wechseln Waffen, 1–9 Untermenüs. Tab-Leiste mit Pfeilen, Pos1 und Ende. Formulare behalten ihre normale Tastaturbedienung; Animationen beachten reduced-motion.

## Persönlicher Speicher

Der bestehende Camo-Schlüssel **mw4-intel:camo-progress:v1** und das Importformat bleiben unverändert. Favoriten: mw4-intel:preferences:v1; eigene Builds: mw4-intel:custom-builds:v1. Metadaten- und Gunsmith-Updates greifen niemals auf persönliche Camo-Zähler zu. Fehlerhafte Speicherdateien werden nicht stillschweigend zurückgesetzt. Importe/Resets benötigen eine bewusste Aktion in der UI. Alte Builds bleiben bei neuen Patches erhalten und werden bei Bedarf als prüfbedürftig markiert.

## Automatische Updates

Die GitHub Action läuft täglich **05:17 UTC** (06:17 Uhr Winter / 07:17 Uhr Sommer in Deutschland), auch bei ausgeschaltetem PC. GitHub kann Zeitpläne verzögern. Manuelles Starten über Actions → Daily verified meta review. GitHub kann geplante Workflows in inaktiven öffentlichen Repositories nach 60 Tagen deaktivieren; gegebenenfalls dort wieder aktivieren.

Offizielle Patchnotes-/Blog-Indexseiten und bekannte Kernartikel werden mit robots.txt, HTTPS-Allowlist, Größenlimit, Rate-Limit, Timeout und begrenzten Wiederholungen geprüft. SHA-256 des redaktionellen Inhalts erkennt auch Revisionen unter derselben URL. Explizit beschriftete neue Waffen-/Basisfakten werden getrennt von qualitativen Hinweisen erfasst. Der erlaubte öffentliche esports.gg-RSS-Feed entdeckt zusätzliche MW4-Quellen. Er ist ein begrenztes aktuelles Fenster, kein vollständiges Archiv.

**CODMunity und Reddit werden wegen fehlender Sammlungserlaubnis nicht automatisiert gesammelt.** HTTP-Sperren und undokumentierte private Endpunkte werden nicht umgangen. Die Website behauptet keinen täglichen Reddit-Check. Manuelle Quellen und Zugriffslücken werden im Actions-Bericht sowie in der Datenbasis ausgewiesen. Die Community-Analyse arbeitet mit geprüften strukturierten Empfehlungen, nicht mit unbelegten KI-Zusammenfassungen.

Änderungen werden zunächst in work/candidate vorbereitet und validiert. Der feste Branch automation/meta-update bekommt bei tatsächlichen Änderungen einen Commit und einen Review-PR. Erst ein Merge veröffentlicht den Datensatz. Identische offene Vorschläge erzeugen keinen weiteren Commit. Manuelle Änderungen am offenen Bot-Branch werden geschützt. Fehler lassen den veröffentlichten Stand unverändert; Reports und Kandidaten bleiben 30 Tage als Actions-Artefakt verfügbar. Der Workflow hat ausdrücklich contents:write und pull-requests:write; GitHub-Einstellung zum Erstellen von PRs muss erlaubt bleiben.

Zusätzlich prüft der tägliche Lauf die 32 in config/community-values-sources.json registrierten öffentlichen Metka-Seiten mit moderatem Abrufabstand. Der Parser übernimmt einzelne Fakten und Build-Slots aus öffentlich ausgeliefertem HTML, ohne Artikeltexte, Grafiken oder Seitenlayouts zu spiegeln. Unklare Einheiten bleiben als Rohangabe sichtbar. Bei Layoutänderung, falscher Waffenidentität oder einem fehlgeschlagenen Abruf wird kein Teilbestand veröffentlicht. Zusätzliche Vergleichsquellen werden manuell gepflegt.

Der tägliche Lauf prüft zusätzlich den freigegebenen globalen Aufsatzkatalog und alle registrierten Waffenprofile. Er prüft sämtliche Zeilen- und Slot-Zähler und verwirft unvollständige Abrufe. Änderungen an Listen oder Builds erzeugen einen Review-PR mit Vorher/Nachher.

Der Kandidat enthält meta.json, gunsmith.json, community-values.json, attachment-catalog.json, effect-evidence.json, research.json, calculated.json und die beiden Review-Dateien. Der Workflow prüft Daten, Berechnungsfingerabdruck, Tests und Build vor dem Commit. Neue Patchnotes stempeln alte Messwerte nicht automatisch als aktuell. Geprüfte Änderungen erzeugen vollständige Vorher-/Nachher-Historie und neue Optimierer-Ergebnisse.

## Dateien und Freigabe

public/data/meta.json bleibt der strikte Kernkatalog mit Camo-Definitionen, Tiers und klassischen verifizierten Builds. public/data/gunsmith.json ist der separate recherchierte Waffen-/Aufsatzdatensatz; research.json enthält Discovery-Baselines, calculated.json die an Datenbankhash/Patch gebundenen Ergebnisse. public/data/community-values.json bewahrt die einzelnen Community-Profile, Quellen-Rohangaben, Ratings, Schadensintervalle und Varianten. Das Browser-Modul führt sie in einer Kopie mit dem offiziellen Datensatz zusammen; die offiziellen Werte werden dabei nicht überschrieben. presentation.json bleibt das Asset-Register. Persönliche Werte befinden sich in keiner dieser Dateien.

Kernkatalog-Änderungen: reviews/approved.json mit baseStateHash, documents und operations. Erlaubte Operationen sind upsert-weapon und upsert-attachment mit vollständigen Datensätzen und abgerufenen Quellenbelegen. Keine Löschung, kein Fortschritt. Ausführen mit npm run apply-review -- --input reviews/approved.json; anschließend npm run recompute, Tests, Validierung und Build.

Gunsmith-Änderungen: reviews/gunsmith-approved.json mit baseHash, patchRevision sowie vollständigen Quellen-/Waffen-/Aufsatz-/Community-Datensätzen. npm run apply-gunsmith-review -- --input reviews/gunsmith-approved.json schreibt nach Validierung Historie und neue Ergebnisse. Genaue Felder, Basishash-Befehl und Berechnungsregeln: GUNSMITH-ARCHITEKTUR.md. Alle Freigaben im Review-Branch prüfen und erst danach mergen.

## Lokal starten und prüfen

Node.js 24 oder neuer:

```sh
npm ci --ignore-scripts
npm test
npm run recompute
npm run validate
npm run build
npm start
```

Lokale Website: http://127.0.0.1:4173. Der statische Build liegt in dist/. GitHub Pages veröffentlicht über .github/workflows/pages.yml. Keine Secrets oder kostenpflichtigen Dienste erforderlich.

## Bilder und 3D

Three.js/GLTFLoader/OrbitControls werden lokal gebündelt und nur bei registriertem lizenziertem Modell geladen. Aktuell gibt es keine verifizierten MW4-3D- oder Camo-Assets. Drei unveränderte, lizenzierte Fotos realer Waffentypen sind ausdrücklich als Referenzfoto gekennzeichnet; fehlende Spielrender und Camo-Vorschauen werden nicht nachgebildet. Keine vorgetäuschte visuelle Aufsatzänderung. Nachweise: public/ASSET-LICENSES.md und Intel → Bildnachweise.

## Zeitstempel

lastSuccessfulUpdate im Kernkatalog bezeichnet den letzten übernommenen geänderten Quellenstand; ein unveränderter Lauf verändert ihn nicht. checkedAt jedes Actions-Laufs steht im Run-Report. patchRevision ist ein SHA-256-Fingerabdruck der offiziellen Patchnotes, keine offizielle numerische Buildversion. Gunsmith führt zusätzlich reviewedAt, Quellen-/Wertepatches und history mit betroffenen Waffen und Vorher-/Nachher-Daten.

## Numerische Aufsatzeffekte – Recherche vom 25.10.2026

[Prüfbericht für alle 33 Waffen](AUFSATZ-PRUEFBERICHT.md). Der Ausgangsbestand mit 799 waffenbezogenen Einträgen wurde vollständig abgeglichen: 742 exakte Namens-/Slotzuordnungen, 57 ungeklärte ältere Namen. Die öffentlichen ggranked-MW4-Multiplayer-Launchprofile enthalten 1.572 Zuordnungen. 830 zusätzliche explizite Zuordnungen ergeben nun 1.629 Einträge; bestehende IDs bleiben erhalten. 8.524 numerische Angaben sind gespeichert, davon 7.597 als eindeutige Einzeloperationen. 1.275 Aufsätze haben mindestens eine Zahlenangabe. Diese Zahlen sind Community-Angaben; weiterhin besitzen nur zwei Aufsätze einen offiziellen numerischen Einzelbeleg, und kein Aufsatz hat einen vollständig verifizierten Effektsatz.

public/data/effect-evidence.json bewahrt Quelle, Spiel, Modus, Quellenstand, Prüfdatum, unveränderte Zahlenangaben, Einheiten und Interpretationsgrenzen. Das Browser-Modul ergänzt neue Zuordnungen in einer Kopie und überschreibt keine offiziellen Basiswerte. Der Stat-Rechner zeigt bekannte Einzelwirkungen mit \* als **Teilrechnung**, etwa M4/FSS Fireline Grip ADS 240 → 260 ms. Andere Effekte und Kombinationen bleiben unbekannt. Mehrere Modifikatoren desselben Werts werden ohne belegte Stapelregel nicht verrechnet. Prozentangaben zu „Speed“ werden nicht ungeprüft in Zeitprozente umgedeutet. Generisches „Recoil“ wird nicht automatisch einzelnen Rückstoßachsen zugewiesen.

Der Optimizer verwendet solche Teilrechnungen nicht als bestätigte mathematische Grundlage. Für alle Produktionswaffen fehlen derzeit vollständige Effekte und Stapelregeln. Community Build, Calculated Build und Hybrid bleiben getrennte Typen. Der kombinatorische Algorithmus ist mit explizit synthetischen, vollständig definierten Testdaten geprüft; diese Werte werden niemals ausgeliefert.

config/effect-evidence-sources.json registriert alle 28 öffentlichen Waffenprofile und fünf N/A-Waffen. Die tägliche Action prüft dieselben Profile unter Beachtung von robots.txt, Nutzungsbedingungen-Fingerabdruck, Abrufabstand, HTTPS-Allowlist, Größenlimit, Mindestumfang und vorhandenen Slotkategorien. Änderungen werden zur Review vorgeschlagen; unveränderte Zahlen ändern keinen veröffentlichten Zeitstempel. CODMunity und Reddit bleiben von automatisierter Sammlung ausgeschlossen.

Den aktuellen Fortschrittsbericht und eine CSV mit jeder Zuordnung erzeugen:

```sh
node scripts/report-effects.mjs work/mw4-datenpruefung.md
```
