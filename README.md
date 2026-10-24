# MW4 Intel · Gunsmith, Camo-Tracker und tägliche Quellenprüfung

Statische Website für **Call of Duty: Modern Warfare 4 (2026), Multiplayer**. GitHub Pages, ohne Server und ohne kostenpflichtige APIs.

- [Website](https://schafermax809-arch.github.io/mw4-meta-tracker/)
- [GitHub Actions](https://github.com/schafermax809-arch/mw4-meta-tracker/actions)
- [Update-Vorschläge](https://github.com/schafermax809-arch/mw4-meta-tracker/pulls)
- [Recherchierte Datenbasis und Abdeckung jeder Waffe](DATENBASIS.md)
- [Engine, Datenvertrag, Berechnung und Review-Anleitung](GUNSMITH-ARCHITEKTUR.md)

## Was enthalten ist

Das Ingame-Menü integriert Waffenklassen, Suche/Filter, Favoriten, Tierlist, Grind Planner, Meta-/Camo-Builds und Camo-Tracking. Der Gunsmith hat META, COMMUNITY, OPTIMIZER, CAMO-BUILDS, EIGENER BUILD und VERGLEICH; Tarnungen, Herausforderungen und Tracker bleiben direkt erreichbar. Navigation per Hash ohne Seitenreload, Desktop-Tastatur, Touch-Menüs und responsive Ansichten.

Alle 33 Launch-Waffen wurden systematisch recherchiert. Die neue Datenbasis enthält 95 offizielle Basiswerte, 28 dokumentierte Apex-Aufsätze, 13 zusätzliche M4-Standardaufsätze (davon vier historische Beta-Referenzen), zwei kleine numerische Apex-Magazinangaben und zwei unterschiedliche redaktionelle M4-Builds. Quellen, Modus, Datum, Patch, Einheiten, Freischaltung und Verifizierungsstatus stehen in JSON und in der UI. Ein Apex ist separat von den fünf Standard-Slots und kann Slots blockieren. Bei ungeklärter Live-Verfügbarkeit bleibt er als Dokumentation sichtbar und nicht auswählbar.

**Der gesamte Standard-Aufsatzkatalog, sämtliche numerischen Effekte und exakte Schadensprofile konnten nicht mit zulässigen, zugänglichen Quellen verifiziert werden. Es gibt deshalb derzeit für keine Waffe ein zertifiziertes mathematisches Meta-Optimum.** Die Engine ist implementiert und mit getrennten synthetischen Testfällen geprüft; sie gibt bei fehlenden Spieldaten ausdrücklich unbekannt / begrenzt / nicht verfügbar aus. Sie erfindet keine Werte oder Builds. DATENBASIS.md dokumentiert jede Waffe und alle Recherchegrenzen.

## Berechnung und Bedienung

Der Stat-Rechner unterstützt explizite absolute Änderungen, Faktoren, gesetzte Werte, Reihenfolgen, Interaktionen und exakte Konfigurations-Snapshots. Nur vollständige, verifizierte Regeln erzeugen aktuelle Zahlen und absolute/prozentuale Deltas. TTK/STK benötigen Körperzonenschäden, Distanzintervalle, verifizierte Schussfolge und ein bestätigtes Gesundheitsszenario. Nicht modellierte Burst-/Pellet- oder modifizierte Schadensprofile werden abgelehnt.

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

Der Kandidat enthält meta.json, gunsmith.json, research.json, calculated.json und die beiden Review-Dateien. Der Workflow prüft Daten, Berechnungsfingerabdruck, Tests und Build vor dem Commit. Neue Patchnotes stempeln alte Messwerte nicht automatisch als aktuell. Geprüfte Änderungen erzeugen vollständige Vorher-/Nachher-Historie und neue Optimierer-Ergebnisse.

## Dateien und Freigabe

public/data/meta.json bleibt der strikte Kernkatalog mit Camo-Definitionen, Tiers und klassischen verifizierten Builds. public/data/gunsmith.json ist der separate recherchierte Waffen-/Aufsatzdatensatz; research.json enthält Discovery-Baselines, calculated.json die an Datenbankhash/Patch gebundenen Ergebnisse. presentation.json bleibt das Asset-Register. Persönliche Werte befinden sich in keiner dieser Dateien.

Kernkatalog-Änderungen: reviews/approved.json mit baseStateHash, documents und operations. Erlaubte Operationen sind upsert-weapon und upsert-attachment mit vollständigen Datensätzen und abgerufenen Quellenbelegen. Keine Löschung, kein Fortschritt. Ausführen mit npm run apply-review -- --input reviews/approved.json; anschließend npm run recompute, Tests, Validierung und Build.

Gunsmith-Änderungen: reviews/gunsmith-approved.json mit baseHash, patchRevision sowie vollständigen Quellen-/Waffen-/Aufsatz-/Community-Datensätzen. npm run apply-gunsmith-review -- --input reviews/gunsmith-approved.json schreibt nach Validierung Historie und neue Ergebnisse. Genaue Felder, Basishash-Befehl und Berechnungsregeln: GUNSMITH-ARCHITEKTUR.md. Alle Freigaben im Review-Branch prüfen und erst danach mergen.

## Lokal starten und prüfen

Node.js 24 oder neuer:

~~~sh
npm ci --ignore-scripts
npm test
npm run recompute
npm run validate
npm run build
npm start
~~~

Lokale Website: http://127.0.0.1:4173. Der statische Build liegt in dist/. GitHub Pages veröffentlicht über .github/workflows/pages.yml. Keine Secrets oder kostenpflichtigen Dienste erforderlich.

## Bilder und 3D

Three.js/GLTFLoader/OrbitControls werden lokal gebündelt und nur bei registriertem lizenziertem Modell geladen. Aktuell gibt es keine verifizierten MW4-3D- oder Camo-Assets. Drei unveränderte, lizenzierte Fotos realer Waffentypen sind ausdrücklich als Referenzfoto gekennzeichnet; fehlende Spielrender und Camo-Vorschauen werden nicht nachgebildet. Keine vorgetäuschte visuelle Aufsatzänderung. Nachweise: public/ASSET-LICENSES.md und Intel → Bildnachweise.

## Zeitstempel

lastSuccessfulUpdate im Kernkatalog bezeichnet den letzten übernommenen geänderten Quellenstand; ein unveränderter Lauf verändert ihn nicht. checkedAt jedes Actions-Laufs steht im Run-Report. patchRevision ist ein SHA-256-Fingerabdruck der offiziellen Patchnotes, keine offizielle numerische Buildversion. Gunsmith führt zusätzlich reviewedAt, Quellen-/Wertepatches und history mit betroffenen Waffen und Vorher-/Nachher-Daten.
